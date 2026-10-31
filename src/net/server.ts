import { makeSettings } from '../game/settings'
import type { PlayerId, RuleSettings } from '../game/types'
import { flagTime } from '../match/clock'
import { isOver } from '../match/reducer'
import { MatchHost, createRecord } from '../match/session'
import type { MatchRecord, MatchState, SeatAccount, SeatAccounts } from '../match/types'
import { linkHost } from './hostLink'
import { PROTOCOL_VERSION, isNetMessage } from './protocol'
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
 */

/** One client connection as the server sees it: text out, and a way to hang up. */
export interface ServerSocket {
  send(text: string): void
  close(): void
}

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
}

type RoomOptions = Required<Omit<MatchServerOptions, 'onFinished'>> & Pick<MatchServerOptions, 'onFinished'>

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
 * One live match. It is the `Transport` its host link talks to: messages the
 * link sends go to the room's connections, and guest messages arriving on any
 * connection go to the link.
 */
class Room implements Transport {
  readonly host: MatchHost
  private members = new Map<ServerSocket, string>()
  /** Who each client id is signed in as, for the clients that are. */
  private identities = new Map<string, Identity>()
  private meta: RoomMeta
  private readonly saveMeta: (meta: RoomMeta) => void
  private handlers = new Set<(message: NetMessage) => void>()
  private readonly unlink: () => void
  private readonly stopWatching: () => void
  private flagTimer: ReturnType<typeof setTimeout> | undefined
  private readonly now: () => number
  private readonly serverId: string

  constructor(record: MatchRecord, options: RoomOptions) {
    const { store, serverId, now, onFinished } = options
    this.now = now
    this.serverId = serverId
    const matchId = record.config.id
    this.meta = store.loadMeta?.(matchId) ?? emptyMeta()
    this.saveMeta = (meta) => store.saveMeta?.(matchId, meta)
    this.host = new MatchHost(record, { now, connection: 'waiting-for-opponent' })
    // A room reopened on a finished game must not report it again.
    let finished = isOver(this.host.getSnapshot().state)
    this.stopWatching = this.host.subscribe((update) => {
      if (!update.step) return
      store.save(update.snapshot.record)
      this.scheduleFlag()
      if (!finished && isOver(update.snapshot.state)) {
        finished = true
        void this.finish(onFinished, update.snapshot.record, update.snapshot.state)
      }
    })
    this.unlink = linkHost(this.host, this, { hostSeat: null, clientId: serverId, now })
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
      // Rating failed (the accounts store was unreachable). The game itself is saved; it just goes unrated.
      return
    }
    if (!accounts) return
    this.meta = { ...this.meta, accounts }
    this.saveMeta(this.meta)
    this.announceAccounts()
  }

  private accountsMessage(): NetMessage {
    const matchId = this.host.getSnapshot().record.config.id
    return {
      v: PROTOCOL_VERSION,
      matchId,
      from: this.serverId,
      type: 'accounts',
      accounts: this.meta.accounts,
      rated: this.meta.rated,
    }
  }

  private announceAccounts() {
    const text = JSON.stringify(this.accountsMessage())
    for (const socket of this.members.keys()) socket.send(text)
  }

  /**
   * A seat that belongs to an account is only for that account. A rated game
   * starts with both seats taken this way; in a casual game the first
   * signed-in person welcomed into a seat claims it.
   */
  private mayUse(seat: PlayerId, clientId: string): boolean {
    const owner = this.meta.accounts[seat]
    return !owner || this.identities.get(clientId)?.id === owner.id
  }

  /** The link welcomed a client into a seat: if it is signed in and the seat is free, the seat becomes theirs. */
  private claim(seat: PlayerId, clientId: string) {
    const identity = this.identities.get(clientId)
    if (!identity || this.meta.accounts[seat]) return
    // One account at both seats is someone playing themselves: the second seat stays anonymous.
    const other = this.meta.accounts[seat === 'player1' ? 'player2' : 'player1']
    if (other?.id === identity.id) return
    this.meta = { ...this.meta, accounts: { ...this.meta.accounts, [seat]: { ...identity } } }
    this.saveMeta(this.meta)
    this.announceAccounts()
  }

  /** Call time exactly when the running side's clock reaches zero. */
  private scheduleFlag() {
    if (this.flagTimer !== undefined) clearTimeout(this.flagTimer)
    const { state } = this.host.getSnapshot()
    const at = state.clock && !isOver(state) ? flagTime(state.clock) : null
    const running = state.clock?.running
    if (at === null || !running) return
    const claim = () => {
      if (this.host.submit('system', { type: 'engine', action: { type: 'timeout', player: running } })) {
        this.flagTimer = setTimeout(claim, FLAG_RETRY_MS)
      }
    }
    this.flagTimer = setTimeout(claim, Math.max(0, at - this.now()))
  }

  /** A guest message from one of the room's connections (or one about to join). */
  deliver(socket: ServerSocket, clientId: string, message: GuestMessage, identity: Identity | null = null) {
    if (identity) this.identities.set(clientId, identity)
    if (!this.mayUse(message.seat, clientId)) {
      if (message.type === 'join') {
        const matchId = this.host.getSnapshot().record.config.id
        const taken: NetMessage = {
          v: PROTOCOL_VERSION,
          matchId,
          from: this.serverId,
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
      // A connection that just arrived may have missed actions while it was
      // away. A guest that still counts itself seated adopts this snapshot; one
      // that does not answers it with a join.
      const { record } = this.host.getSnapshot()
      const snapshot: NetMessage = {
        v: PROTOCOL_VERSION,
        matchId: record.config.id,
        from: this.serverId,
        type: 'snapshot',
        record,
      }
      socket.send(JSON.stringify(snapshot))
      socket.send(JSON.stringify(this.accountsMessage()))
    }
    for (const handler of [...this.handlers]) handler(message)
  }

  /** The connection closed. Free whichever seat it held straight away rather than waiting for its heartbeat to lapse. */
  leave(socket: ServerSocket) {
    const clientId = this.members.get(socket)
    if (clientId === undefined) return
    this.members.delete(socket)
    // The same client may already be back on a new connection; its seat stays.
    if ([...this.members.values()].includes(clientId)) return
    const matchId = this.host.getSnapshot().record.config.id
    for (const seat of SEATS) {
      const message: GuestMessage = { v: PROTOCOL_VERSION, matchId, from: clientId, type: 'leave', seat }
      for (const handler of [...this.handlers]) handler(message)
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
  private rooms = new Map<string, Room>()

  constructor(options: MatchServerOptions) {
    this.store = options.store
    this.now = options.now ?? Date.now
    this.serverId = options.serverId ?? 'server'
    this.onFinished = options.onFinished
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
    let clientId: string | null = null
    const joined = new Set<string>()

    const receive = (text: string) => {
      let message: unknown
      try {
        message = JSON.parse(text)
      } catch {
        return
      }
      if (!isNetMessage(message) || !isGuestMessage(message)) return
      // The first id a connection uses is its identity from then on.
      clientId ??= message.from
      if (message.from !== clientId) return

      const room = this.roomFor(message.matchId)
      if (!room) {
        const closed: NetMessage = { v: PROTOCOL_VERSION, matchId: message.matchId, from: this.serverId, type: 'closed' }
        socket.send(JSON.stringify(closed))
        return
      }
      joined.add(message.matchId)
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
        if (room.size === 0) {
          room.close()
          this.rooms.delete(matchId)
        }
      }
      joined.clear()
    }

    return { receive, drop }
  }

  private roomFor(matchId: string): Room | null {
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
      room = new Room(record, { store: this.store, serverId: this.serverId, now: this.now, onFinished: this.onFinished })
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
