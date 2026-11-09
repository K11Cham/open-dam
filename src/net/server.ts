import { makeSettings } from '../game/settings'
import type { PlayerId, RuleSettings } from '../game/types'
import { flagTime } from '../match/clock'
import { isOver } from '../match/reducer'
import { MatchHost, createRecord } from '../match/session'
import type { MatchRecord, MatchState, SeatAccount, SeatAccounts } from '../match/types'
import { linkHost } from './hostLink'
import { KEEPALIVE_REQUEST, PROTOCOL_VERSION, isNetMessage, keepaliveResponse } from './protocol'
import type { GuestMessage, NetMessage, Transport } from './protocol'

/**
 * The match server's logic, without the network. Whatever listens for
 * connections (a WebSocket server in Node, a Durable Object, a test) hands
 * each one to `accept` and feeds it text frames; this file does the rest:
 *
 *  - one room per match, opened from the store when someone asks for it and
 *    closed when the last connection leaves;
 *  - the room's `MatchHost` is the authority, linked with `linkHost` exactly
 *    as a browser host is, but with both seats remote;
 *  - the record is saved after every accepted action;
 *  - time is the server's, and the server calls a flag when a clock runs out;
 *  - each connection keeps the client id it first used, so it cannot speak
 *    for another client.
 *
 * A server whose process sleeps between messages (a hibernating Durable
 * Object) uses three more hooks: `presence: 'connection'`, so no heartbeat
 * timer runs; `schedule`, so a flag becomes an alarm instead of a timer, with
 * `runDue` called when it rings; and `resume`, to pick its connections up
 * again after waking.
 */

/** One client connection as the server sees it: text out, and a way to hang up. */
export interface ServerSocket {
  send(text: string): void
  close(): void
  /**
   * Keep what the server knows about this connection with the connection
   * itself, so `resume` can rebuild it after the server sleeps. A server that
   * never sleeps can leave it out.
   */
  remember?(memo: ConnectionMemo): void
  /** When this connection was last heard from (epoch ms), if the socket layer knows. A silent one loses its seat to a newcomer. */
  lastActive?(): number | null
}

/** What a connection must remember to be picked up again: the client id it speaks for and the matches it joined. */
export interface ConnectionMemo {
  clientId: string | null
  matchIds: string[]
}

/** Who holds each seat, by client id. */
export type SeatHolders = Partial<Record<PlayerId, string>>

/**
 * What a server keeps beside a match's record: who is signed in at each seat
 * and whether the game is rated. It stays out of the record, which is the
 * game itself and travels to every device.
 */
export interface RoomMeta {
  rated: boolean
  accounts: SeatAccounts
}

export const emptyMeta = (): RoomMeta => ({ rated: false, accounts: { player1: null, player2: null } })

/** Where matches live between connections. A database in production; a Map in tests. */
export interface MatchStore {
  load(matchId: string): MatchRecord | null
  save(record: MatchRecord): void
  /** The match's seat accounts; a store without them serves games without accounts. */
  loadMeta?(matchId: string): RoomMeta | null
  saveMeta?(matchId: string, meta: RoomMeta): void
  /** Which client holds each seat, for a server that resumes after sleeping. */
  loadSeats?(matchId: string): SeatHolders | null
  saveSeats?(matchId: string, seats: SeatHolders): void
}

/** The signed-in person behind a connection, as whatever accepted it vouches. */
export type Identity = Omit<SeatAccount, 'rating' | 'change'>

export interface MatchServerOptions {
  store: MatchStore
  now?: () => number
  /** The id the server signs its own messages with. */
  serverId?: string
  /**
   * Called once when a game ends, after its final record is saved. This is
   * where a server rates the game (`ratedScore` and `rateGame` in
   * src/match/rating.ts), so results never come from a browser. It may
   * return the seats' accounts with their new ratings, which the players are
   * then shown.
   */
  onFinished?: (record: MatchRecord, state: MatchState, meta: RoomMeta) => void | SeatAccounts | Promise<void | SeatAccounts>
  /**
   * How a seated client counts as present: by heartbeat pings (the default)
   * or by its connection being open (see `linkHost`). A server that sleeps
   * between messages needs `connection`.
   */
  presence?: 'heartbeat' | 'connection'
  /**
   * Called with the time a match next needs attention (its running clock's
   * flag), or null when it needs none. When given, the server sets no timers
   * of its own: the caller calls `runDue` at that time (a Durable Object
   * alarm). Without it, the server calls flags itself with `setTimeout`.
   */
  schedule?: (matchId: string, at: number | null) => void
}

interface RoomOptions {
  store: MatchStore
  now: () => number
  serverId: string
  onFinished: MatchServerOptions['onFinished']
  presence: 'heartbeat' | 'connection'
  schedule: MatchServerOptions['schedule']
  /** Seats held by connections being resumed. */
  claims?: SeatHolders
}

/** What `accept` returns: give it each text frame, and tell it when the connection closes. */
export interface ServerConnection {
  receive(text: string): void
  drop(): void
}

const GUEST_TYPES = new Set(['join', 'intent', 'ping', 'leave'])
const SEATS: PlayerId[] = ['player1', 'player2']

const isGuestMessage = (message: NetMessage): message is GuestMessage =>
  GUEST_TYPES.has(message.type) &&
  typeof message.from === 'string' &&
  message.from.length > 0 &&
  SEATS.includes((message as { seat?: PlayerId }).seat as PlayerId)

/** Retry a refused flag claim this soon (the reducer allows a small early margin, timers can still fire early). */
const FLAG_RETRY_MS = 200

/**
 * A connection silent this long no longer holds its seat against someone
 * else asking for it. Clients send a keepalive every two seconds, so a live
 * one is never this quiet; a phone that lost its network without closing the
 * socket is.
 */
export const SILENT_CONNECTION_MS = 20_000

/**
 * One live match. It is the `Transport` its host link talks to: messages the
 * link sends go to the room's connections, and guest messages arriving on any
 * connection go to the link.
 */
class Room implements Transport {
  readonly host: MatchHost
  private members = new Map<ServerSocket, string>()
  /**
   * Who each connection is signed in as, as the server checked it (a session
   * cookie). Kept per connection, not per client id: a client id is whatever
   * the browser says, so another connection could claim one.
   */
  private identities = new Map<ServerSocket, Identity | null>()
  /** The account of the connection whose message is being handled, for `claim`. */
  private acting: Identity | null = null
  /** Which client holds each seat, as the link last welcomed them; saved so a sleeping server can restore it. */
  private seated: SeatHolders
  private meta: RoomMeta
  private readonly matchId: string
  private handlers = new Set<(message: NetMessage) => void>()
  private readonly unlink: () => void
  private readonly stopWatching: () => void
  private flagTimer: ReturnType<typeof setTimeout> | undefined
  private readonly options: RoomOptions
  /** The report of the game's end, while it is being made. */
  finishing: Promise<void> | null = null

  constructor(record: MatchRecord, options: RoomOptions) {
    const { store, now, onFinished } = options
    this.options = options
    this.matchId = record.config.id
    this.meta = store.loadMeta?.(this.matchId) ?? emptyMeta()
    this.seated = { ...(options.claims ?? {}) }
    this.host = new MatchHost(record, { now, connection: 'waiting-for-opponent' })
    // A room reopened on a finished game must not report it again.
    let finished = isOver(this.host.getSnapshot().state)
    this.stopWatching = this.host.subscribe((update) => {
      if (!update.step) return
      store.save(update.snapshot.record)
      this.scheduleFlag()
      if (!finished && isOver(update.snapshot.state)) {
        finished = true
        this.finishing = this.finish(onFinished, update.snapshot.record, update.snapshot.state)
      }
    })
    this.unlink = linkHost(this.host, this, {
      hostSeat: null,
      clientId: options.serverId,
      now,
      presence: options.presence,
      isPresent: (clientId) => this.isPresent(clientId),
      claims: options.claims,
    })
    this.scheduleFlag()
  }

  get size() {
    return this.members.size
  }

  private async finish(onFinished: MatchServerOptions['onFinished'], record: MatchRecord, state: MatchState) {
    let accounts: SeatAccounts | void
    try {
      accounts = await onFinished?.(record, state, this.meta)
    } catch {
      // Rating failed (the accounts store was unreachable). The game itself is
      // saved; the caller may retry and hand the ratings over with `setAccounts`.
      return
    }
    if (accounts) this.setAccounts(accounts)
  }

  /** New accounts for the seats (or ratings that just moved): keep them and tell everyone here. */
  setAccounts(accounts: SeatAccounts) {
    this.meta = { ...this.meta, accounts }
    this.options.store.saveMeta?.(this.matchId, this.meta)
    this.announceAccounts()
  }

  private accountsMessage(): NetMessage {
    return {
      v: PROTOCOL_VERSION,
      matchId: this.matchId,
      from: this.options.serverId,
      type: 'accounts',
      accounts: this.meta.accounts,
      rated: this.meta.rated,
    }
  }

  private announceAccounts() {
    const text = JSON.stringify(this.accountsMessage())
    for (const socket of this.members.keys()) socket.send(text)
  }

  /** Whether a client has a connection here that has not gone silent. */
  private isPresent(clientId: string): boolean {
    const t = this.options.now()
    for (const [socket, id] of this.members) {
      if (id !== clientId) continue
      const last = socket.lastActive?.() ?? null
      if (last === null || t - last < SILENT_CONNECTION_MS) return true
    }
    return false
  }

  /**
   * A seat that belongs to an account is only for that account. A rated game
   * starts with both seats taken this way; in a casual game the first
   * signed-in person welcomed into a seat claims it.
   */
  private mayUse(seat: PlayerId, identity: Identity | null): boolean {
    const owner = this.meta.accounts[seat]
    return !owner || identity?.id === owner.id
  }

  /** The link welcomed a client into a seat: if it is signed in and the seat is free, the seat becomes theirs. */
  private claim(seat: PlayerId, clientId: string) {
    if (this.seated[seat] !== clientId) this.setSeated(seat, clientId)
    const identity = this.acting
    if (!identity || this.meta.accounts[seat]) return
    // One account at both seats is someone playing themselves: the second seat stays anonymous.
    const other = this.meta.accounts[seat === 'player1' ? 'player2' : 'player1']
    if (other?.id === identity.id) return
    this.setAccounts({ ...this.meta.accounts, [seat]: { ...identity } })
  }

  private setSeated(seat: PlayerId, clientId: string | null) {
    const next = { ...this.seated }
    if (clientId === null) delete next[seat]
    else next[seat] = clientId
    this.seated = next
    this.options.store.saveSeats?.(this.matchId, next)
  }

  /** When the running side's clock reaches zero, or null when no clock runs. */
  get deadline(): number | null {
    const { state } = this.host.getSnapshot()
    if (!state.clock?.running || isOver(state)) return null
    return flagTime(state.clock)
  }

  /** Call time exactly when the running side's clock reaches zero, by timer or through `schedule`. */
  private scheduleFlag(at = this.deadline) {
    if (this.options.schedule) {
      this.options.schedule(this.matchId, at)
      return
    }
    if (this.flagTimer !== undefined) clearTimeout(this.flagTimer)
    this.flagTimer = undefined
    if (at === null) return
    this.flagTimer = setTimeout(() => this.callFlag(), Math.max(0, at - this.options.now()))
  }

  /** Claim the flag for the running side. Refused (a hair early): try again shortly. */
  callFlag() {
    const { state } = this.host.getSnapshot()
    const running = state.clock?.running
    const at = this.deadline
    if (!running || at === null) return
    if (this.host.submit('system', { type: 'engine', action: { type: 'timeout', player: running } })) {
      this.scheduleFlag(Math.max(at, this.options.now()) + FLAG_RETRY_MS)
    }
  }

  /** A connection picked up again after the server slept: a member at once, and nobody is told. */
  restore(socket: ServerSocket, clientId: string | null, identity: Identity | null) {
    if (clientId === null) return
    this.members.set(socket, clientId)
    this.identities.set(socket, identity)
  }

  /** A keepalive on a connection: an answer, and a ping for each seat its client holds. */
  keepalive(socket: ServerSocket) {
    socket.send(keepaliveResponse(this.matchId, this.options.serverId))
    const clientId = this.members.get(socket)
    if (clientId === undefined) return
    for (const seat of SEATS) {
      if (this.seated[seat] !== clientId) continue
      const ping: GuestMessage = { v: PROTOCOL_VERSION, matchId: this.matchId, from: clientId, type: 'ping', seat }
      this.handleAs(this.identities.get(socket) ?? null, ping)
    }
  }

  /** Hand a guest message to the link, with the sending connection's account known to `claim`. */
  private handleAs(identity: Identity | null, message: GuestMessage) {
    this.acting = identity
    try {
      for (const handler of [...this.handlers]) handler(message)
    } finally {
      this.acting = null
    }
  }

  /** A guest message from one of the room's connections (or one about to join). */
  deliver(socket: ServerSocket, clientId: string, message: GuestMessage, identity: Identity | null = null) {
    if (!this.mayUse(message.seat, identity)) {
      if (message.type === 'join') {
        const taken: NetMessage = {
          v: PROTOCOL_VERSION,
          matchId: this.matchId,
          from: this.options.serverId,
          type: 'seat-taken',
          to: clientId,
          seat: message.seat,
        }
        socket.send(JSON.stringify(taken))
      }
      return
    }
    if (!this.members.has(socket)) {
      this.members.set(socket, clientId)
      this.identities.set(socket, identity)
      // A connection that just arrived may have missed actions while it was
      // away. A guest that still counts itself seated adopts this snapshot; one
      // that does not answers it with a join.
      const { record } = this.host.getSnapshot()
      const snapshot: NetMessage = {
        v: PROTOCOL_VERSION,
        matchId: this.matchId,
        from: this.options.serverId,
        type: 'snapshot',
        record,
      }
      socket.send(JSON.stringify(snapshot))
      socket.send(JSON.stringify(this.accountsMessage()))
    }
    // With no presence timer, a full ping (from an older client) gets an answer, so it keeps hearing from the server.
    if (message.type === 'ping' && this.options.presence === 'connection') {
      socket.send(keepaliveResponse(this.matchId, this.options.serverId))
    }
    this.handleAs(identity, message)
    if (message.type === 'leave' && this.seated[message.seat] === clientId) this.setSeated(message.seat, null)
  }

  /** The connection closed. Free whichever seat it held straight away rather than waiting for its heartbeat to lapse. */
  leave(socket: ServerSocket) {
    const clientId = this.members.get(socket)
    if (clientId === undefined) return
    this.members.delete(socket)
    this.identities.delete(socket)
    // The same client may already be back on a new connection; its seat stays.
    if ([...this.members.values()].includes(clientId)) return
    for (const seat of SEATS) {
      const message: GuestMessage = { v: PROTOCOL_VERSION, matchId: this.matchId, from: clientId, type: 'leave', seat }
      for (const handler of [...this.handlers]) handler(message)
      if (this.seated[seat] === clientId) this.setSeated(seat, null)
    }
  }

  // -- Transport, for the host link ------------------------------------------

  send(message: NetMessage) {
    if (message.type === 'welcome') this.claim(message.seat, message.to)
    const text = JSON.stringify(message)
    const to = 'to' in message ? message.to : null
    for (const [socket, clientId] of this.members) {
      if (to === null || to === clientId) socket.send(text)
    }
  }

  onMessage(handler: (message: NetMessage) => void) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close() {
    if (this.flagTimer !== undefined) clearTimeout(this.flagTimer)
    this.stopWatching()
    this.unlink()
    this.handlers.clear()
    this.members.clear()
    this.host.dispose()
  }
}

export class MatchServer {
  private readonly store: MatchStore
  private readonly now: () => number
  private readonly serverId: string
  private readonly onFinished: MatchServerOptions['onFinished']
  private readonly presence: 'heartbeat' | 'connection'
  private readonly schedule: MatchServerOptions['schedule']
  private rooms = new Map<string, Room>()

  constructor(options: MatchServerOptions) {
    this.store = options.store
    this.now = options.now ?? Date.now
    this.serverId = options.serverId ?? 'server'
    this.onFinished = options.onFinished
    this.presence = options.presence ?? 'heartbeat'
    this.schedule = options.schedule
  }

  /** Start a new online game with both seats open to whoever joins first. Returns its id. */
  createMatch(settings: Partial<RuleSettings> = {}, names: Record<PlayerId, string> = { player1: '', player2: '' }): string {
    const record = createRecord({
      mode: 'online',
      settings: makeSettings(settings),
      seats: { player1: { kind: 'remote', name: names.player1 }, player2: { kind: 'remote', name: names.player2 } },
      createdAt: this.now(),
    })
    this.store.save(record)
    return record.config.id
  }

  /** Matches with at least one connection right now. */
  get openRooms(): string[] {
    return [...this.rooms.keys()]
  }

  /** The live host of an open match, for inspection and tests. */
  hostOf(matchId: string): MatchHost | null {
    return this.rooms.get(matchId)?.host ?? null
  }

  /**
   * A new connection. `identity` is the account it is signed in to, which the
   * caller checked (a session cookie, in the Worker); null for a guest.
   */
  accept(socket: ServerSocket, identity: Identity | null = null): ServerConnection {
    return this.connect(socket, identity, { clientId: null, matchIds: [] })
  }

  /**
   * Pick connections up again after the server slept and lost its memory (a
   * Durable Object waking from hibernation), each with the memo it last
   * remembered. Rooms reopen from the store with the seats their connected
   * holders had, and nobody is sent anything.
   */
  resume(entries: Array<{ socket: ServerSocket; identity: Identity | null; memo: ConnectionMemo }>): ServerConnection[] {
    const clientsByMatch = new Map<string, Set<string>>()
    for (const { memo } of entries) {
      if (memo.clientId === null) continue
      for (const matchId of memo.matchIds) {
        const clients = clientsByMatch.get(matchId) ?? new Set<string>()
        clients.add(memo.clientId)
        clientsByMatch.set(matchId, clients)
      }
    }
    for (const [matchId, clients] of clientsByMatch) {
      if (this.rooms.has(matchId)) continue
      const saved = this.store.loadSeats?.(matchId) ?? {}
      const claims: SeatHolders = {}
      for (const seat of SEATS) {
        const holder = saved[seat]
        if (holder !== undefined && clients.has(holder)) claims[seat] = holder
      }
      this.roomFor(matchId, claims)
    }
    return entries.map(({ socket, identity, memo }) => {
      for (const matchId of memo.matchIds) this.rooms.get(matchId)?.restore(socket, memo.clientId, identity)
      return this.connect(socket, identity, memo)
    })
  }

  private connect(socket: ServerSocket, identity: Identity | null, memo: ConnectionMemo): ServerConnection {
    let clientId: string | null = memo.clientId
    const joined = new Set<string>(memo.matchIds.filter((matchId) => this.rooms.has(matchId)))
    const remember = () => socket.remember?.({ clientId, matchIds: [...joined] })

    const receive = (text: string) => {
      if (text === KEEPALIVE_REQUEST) {
        for (const matchId of joined) this.rooms.get(matchId)?.keepalive(socket)
        return
      }
      let message: unknown
      try {
        message = JSON.parse(text)
      } catch {
        return
      }
      if (!isNetMessage(message) || !isGuestMessage(message)) return
      // The first id a connection uses is its identity from then on.
      const known = clientId !== null
      clientId ??= message.from
      if (message.from !== clientId) return

      const room = this.roomFor(message.matchId)
      if (!room) {
        const closed: NetMessage = { v: PROTOCOL_VERSION, matchId: message.matchId, from: this.serverId, type: 'closed' }
        socket.send(JSON.stringify(closed))
        if (!known) remember()
        return
      }
      const fresh = !joined.has(message.matchId)
      joined.add(message.matchId)
      if (fresh || !known) remember()
      try {
        room.deliver(socket, clientId, message, identity)
      } catch {
        // A malformed intent must not take the server down; the sender just gets no answer.
      }
    }

    const drop = () => {
      for (const matchId of joined) {
        const room = this.rooms.get(matchId)
        if (!room) continue
        room.leave(socket)
        if (room.size === 0) this.closeRoom(matchId)
      }
      joined.clear()
    }

    return { receive, drop }
  }

  private closeRoom(matchId: string) {
    const room = this.rooms.get(matchId)
    if (!room) return
    room.close()
    this.rooms.delete(matchId)
  }

  /**
   * Whatever a match needs now that its scheduled time has come: a flag whose
   * time is up is called, even with nobody connected. Resolves once a game
   * this ended has been reported. For a server that passed `schedule`.
   */
  async runDue(matchId: string): Promise<void> {
    const wasOpen = this.rooms.has(matchId)
    const room = this.roomFor(matchId)
    if (!room) return
    const deadline = room.deadline
    if (deadline !== null && deadline <= this.now()) room.callFlag()
    else this.schedule?.(matchId, deadline)
    await room.finishing
    if (!wasOpen && room.size === 0) this.closeRoom(matchId)
  }

  /** Accounts with ratings that arrived late (a report that was retried): keep them, and tell anyone connected. */
  setAccounts(matchId: string, accounts: SeatAccounts) {
    const room = this.rooms.get(matchId)
    if (room) {
      room.setAccounts(accounts)
      return
    }
    const meta = this.store.loadMeta?.(matchId) ?? emptyMeta()
    this.store.saveMeta?.(matchId, { ...meta, accounts })
  }

  private roomFor(matchId: string, claims?: SeatHolders): Room | null {
    const open = this.rooms.get(matchId)
    if (open) return open
    let record: MatchRecord | null
    try {
      record = this.store.load(matchId)
    } catch {
      return null
    }
    if (!record) return null
    let room: Room
    try {
      // Only online games with both seats remote belong on a server.
      if (SEATS.some((seat) => record.config.seats[seat].kind !== 'remote')) return null
      // A stored record that no longer replays throws here; it is refused rather than taking the server down.
      room = new Room(record, {
        store: this.store,
        serverId: this.serverId,
        now: this.now,
        onFinished: this.onFinished,
        presence: this.presence,
        schedule: this.schedule,
        claims,
      })
    } catch {
      return null
    }
    this.rooms.set(matchId, room)
    return room
  }

  /** Close every room (shutting down). Records are already saved. */
  close() {
    for (const room of this.rooms.values()) room.close()
    this.rooms.clear()
  }
}
