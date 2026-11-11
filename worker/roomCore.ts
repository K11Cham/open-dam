import { turnsPlayed } from '../src/game/notation'
import { flagTime } from '../src/match/clock'
import { ratedScore, ratingPool } from '../src/match/rating'
import { isOver, replay } from '../src/match/reducer'
import type { MatchRecord, MatchState, SeatAccounts } from '../src/match/types'
import { MatchServer, emptyMeta } from '../src/net/server'
import type { ConnectionMemo, Identity, RoomMeta, SeatHolders, ServerConnection, ServerSocket } from '../src/net/server'
import type { FinishedGame, RatingChanges } from './accountStore'

/**
 * The logic of one online match's Durable Object (`MatchRoom`, room.ts),
 * apart from Cloudflare's classes so the tests can run it with a fake storage,
 * fake sockets and a fake clock.
 *
 * Three things here are not in `MatchServer`, because they only matter to a
 * server that sleeps:
 *
 *  - **Hibernation.** Each socket carries an attachment (who it is, what it
 *    joined). After the object wakes with no memory, `open` rebuilds every
 *    connection from those attachments and the seats saved in storage.
 *  - **One alarm, three deadlines.** A Durable Object has one alarm. It rings
 *    for whichever comes first: the running clock's flag (so a timed game
 *    ends on time with nobody connected), a retry of a failed report, or the
 *    clean-up of a game nobody has opened for a month.
 *  - **Reports that survive failure.** A finished game with accounts is
 *    written down as a pending report before `Accounts.recordGame` is called,
 *    and crossed off only when that succeeds. Until then the alarm retries
 *    with growing gaps. `recordGame` is idempotent, so a retry racing a slow
 *    success stores the game once.
 */

/** The part of `DurableObjectStorage` the room uses. */
export interface RoomStorage {
  get<T>(key: string): Promise<T | undefined>
  put(entries: Record<string, unknown>): Promise<void>
  delete(keys: string[]): Promise<unknown>
  deleteAll(): Promise<void>
  setAlarm(at: number): Promise<void>
  deleteAlarm(): Promise<void>
  /** When the alarm is set for, or null. */
  getAlarm(): Promise<number | null>
}

/** What each socket keeps with itself across hibernation. */
export interface SocketAttachment {
  /** This socket's own id, so the room finds its connection whichever wrapper the runtime hands back. */
  sid: string
  identity: Identity | null
  memo: ConnectionMemo
}

/** One hibernatable WebSocket, as the room needs it. */
export interface RoomSocket {
  send(text: string): void
  close(): void
  attachment(): SocketAttachment | null
  attach(value: SocketAttachment): void
  /** When the runtime last answered this socket's keepalive without waking the room. */
  autoResponseAt(): number | null
}

export interface RoomCoreOptions {
  storage: RoomStorage
  recordGame: (game: FinishedGame) => Promise<RatingChanges>
  now?: () => number
  newId?: () => string
  /** Where a line about something going wrong goes; Workers Logs keeps `console.error`. */
  log?: (line: Record<string, unknown>) => void
}

const RECORD_KEY = 'record'
const META_KEY = 'meta'
const SEATS_KEY = 'seats'
const DEADLINES_KEY = 'deadlines'
const PENDING_KEY = 'pendingReport'

/** Games nobody has opened for this long are deleted, so storage does not grow forever. */
export const KEEP_IDLE_MS = 30 * 24 * 60 * 60 * 1000

/** Gaps between retries of a failed report: a minute, five, thirty, then hourly. */
export const REPORT_RETRY_MS = [60_000, 5 * 60_000, 30 * 60_000, 60 * 60_000]

interface Deadlines {
  /** When the running clock's flag falls. */
  flagAt: number | null
  /** When to try a failed report again. */
  reportAt: number | null
  /** When to delete a game nobody has opened. */
  cleanupAt: number | null
}

/** A finished game waiting to reach the Accounts object. */
export interface PendingReport {
  game: FinishedGame
  attempts: number
  /** The seats' accounts when the game ended, to put the new ratings on. */
  accounts: SeatAccounts
}

/** The report a finished game makes, or null when no seat had an account. */
export function finishedGameOf(record: MatchRecord, state: MatchState, meta: RoomMeta): FinishedGame | null {
  const { player1, player2 } = meta.accounts
  if (!player1 && !player2) return null
  const status = state.position.status
  if (status.kind === 'playing') return null
  // A game one side never moved in says nothing about strength; it is kept, unrated.
  const counts = ratedScore(state) !== null
  return {
    id: record.config.id,
    pool: ratingPool(record.config.settings),
    rated: meta.rated && counts,
    finishedAt: record.actions.at(-1)?.at ?? Date.now(),
    players: { player1: player1?.id ?? null, player2: player2?.id ?? null },
    winner: status.kind === 'win' ? status.winner : null,
    reason: status.reason,
    // Counted as the result summary counts them (turnsPlayed). The column is named for plies, but holds moves played.
    plies: turnsPlayed(state.position.moves),
    record: JSON.stringify(record),
  }
}

/** The seats' accounts with their new ratings on them. */
const withRatings = (accounts: SeatAccounts, changes: RatingChanges): SeatAccounts | null => {
  if (!changes.player1 && !changes.player2) return null
  const seat = (which: 'player1' | 'player2') => {
    const account = accounts[which]
    const change = changes[which]
    return account && change ? { ...account, rating: change.after, change: change.after - change.before } : account
  }
  return { player1: seat('player1'), player2: seat('player2') }
}

export class RoomCore {
  private record: MatchRecord | null = null
  private meta: RoomMeta | null = null
  private seats: SeatHolders | null = null
  private deadlines: Deadlines = { flagAt: null, reportAt: null, cleanupAt: null }
  private readonly server: MatchServer
  private readonly storage: RoomStorage
  private readonly recordGame: RoomCoreOptions['recordGame']
  private readonly now: () => number
  private readonly newId: () => string
  private readonly log: NonNullable<RoomCoreOptions['log']>
  /** Each open socket's connection, by the socket's own id. */
  private connections = new Map<string, { socket: ServerSocket; connection: ServerConnection }>()
  /** When each socket last sent a frame that woke the room. */
  private heard = new Map<string, number>()

  private constructor(options: RoomCoreOptions) {
    this.storage = options.storage
    this.recordGame = options.recordGame
    this.now = options.now ?? Date.now
    this.newId = options.newId ?? (() => crypto.randomUUID())
    this.log = options.log ?? ((line) => console.error(JSON.stringify(line)))
    this.server = new MatchServer({
      now: this.now,
      presence: 'connection',
      schedule: (_matchId, at) => {
        if (this.deadlines.flagAt === at) return
        this.deadlines.flagAt = at
        void this.arm()
      },
      store: {
        // A room only ever serves the match it was created for.
        load: (matchId) => (this.record?.config.id === matchId ? this.record : null),
        save: (record) => {
          this.record = record
          // Not awaited: Cloudflare holds back this object's outgoing messages
          // until the write is durable, so nobody sees a move that was not saved.
          void this.storage.put({ [RECORD_KEY]: record })
        },
        loadMeta: () => this.meta,
        saveMeta: (_matchId, meta) => {
          this.meta = meta
          void this.storage.put({ [META_KEY]: meta })
        },
        loadSeats: () => this.seats,
        saveSeats: (_matchId, seats) => {
          this.seats = seats
          void this.storage.put({ [SEATS_KEY]: seats })
        },
      },
      onFinished: (record, state, meta) => this.report(record, state, meta),
    })
  }

  /** Load the match from storage and pick up the sockets that stayed open while the room slept. */
  static async open(options: RoomCoreOptions, sockets: RoomSocket[] = []): Promise<RoomCore> {
    const core = new RoomCore(options)
    const { storage } = options
    core.record = (await storage.get<MatchRecord>(RECORD_KEY)) ?? null
    core.meta = (await storage.get<RoomMeta>(META_KEY)) ?? null
    core.seats = (await storage.get<SeatHolders>(SEATS_KEY)) ?? null
    const saved = await storage.get<Deadlines>(DEADLINES_KEY)
    if (saved) core.deadlines = saved
    else if (core.record) await core.adoptOlderRoom()
    // A report written down but never given a retry (the object stopped between the two): give it one now.
    if (core.deadlines.reportAt === null && (await storage.get<PendingReport>(PENDING_KEY))) {
      core.deadlines.reportAt = core.now() + REPORT_RETRY_MS[0]
      await core.arm()
    }
    const entries = sockets.flatMap((raw) => {
      const attachment = raw.attachment()
      if (!attachment) return []
      return [{ raw, attachment, socket: core.wrap(raw, attachment.sid) }]
    })
    const connections = core.server.resume(
      entries.map(({ attachment, socket }) => ({ socket, identity: attachment.identity, memo: attachment.memo })),
    )
    entries.forEach(({ attachment, socket }, i) => core.connections.set(attachment.sid, { socket, connection: connections[i] }))
    return core
  }

  /**
   * A room saved before rooms kept their deadlines (before the 2026-11
   * hardening) has only its clean-up alarm. Keep that alarm's time as the
   * clean-up, and work out from the saved game when its running clock's flag
   * falls, so a game abandoned before the update still ends on time.
   */
  private async adoptOlderRoom() {
    const cleanupAt = (await this.storage.getAlarm()) ?? this.now() + KEEP_IDLE_MS
    let flagAt: number | null = null
    try {
      const state = replay(this.record!)
      if (state.clock?.running && !isOver(state)) flagAt = flagTime(state.clock)
    } catch {
      // A record that no longer replays has no clock to watch; the clean-up still comes.
    }
    this.deadlines = { flagAt, reportAt: null, cleanupAt }
    await this.arm()
  }

  /** The match this room serves, once it has one. */
  get matchId(): string | null {
    return this.record?.config.id ?? null
  }

  /** Sockets open right now. */
  get openSockets(): number {
    return this.connections.size
  }

  /** The time the alarm should ring next, or null for none. */
  get nextAlarm(): number | null {
    const times = [this.deadlines.flagAt, this.deadlines.reportAt, this.deadlines.cleanupAt].filter(
      (t): t is number => t !== null,
    )
    return times.length ? Math.min(...times) : null
  }

  /** Called once by the Worker or the lobby for a new match. False if this room already has one. */
  async create(record: MatchRecord, meta: RoomMeta = emptyMeta()): Promise<boolean> {
    if (this.record) return false
    this.record = record
    this.meta = meta
    this.deadlines = { flagAt: null, reportAt: null, cleanupAt: this.now() + KEEP_IDLE_MS }
    await this.storage.put({ [RECORD_KEY]: record, [META_KEY]: meta })
    await this.arm()
    return true
  }

  private wrap(raw: RoomSocket, sid: string): ServerSocket {
    return {
      send: (text) => {
        try {
          raw.send(text)
        } catch {
          // The socket closed under us; its close event drops the connection.
        }
      },
      close: () => raw.close(),
      remember: (memo) => {
        const current = raw.attachment()
        if (current) raw.attach({ ...current, memo })
      },
      lastActive: () => {
        const times = [this.heard.get(sid) ?? null, raw.autoResponseAt()].filter((t): t is number => t !== null)
        return times.length ? Math.max(...times) : null
      },
    }
  }

  /** A new socket, already accepted for hibernation. */
  connect(raw: RoomSocket, identity: Identity | null) {
    const sid = this.newId()
    raw.attach({ sid, identity, memo: { clientId: null, matchIds: [] } })
    const socket = this.wrap(raw, sid)
    this.connections.set(sid, { socket, connection: this.server.accept(socket, identity) })
    this.heard.set(sid, this.now())
  }

  /** A text frame from a socket. */
  message(raw: RoomSocket, text: string) {
    const sid = raw.attachment()?.sid
    const entry = sid === undefined ? undefined : this.connections.get(sid)
    if (!entry || sid === undefined) return
    this.heard.set(sid, this.now())
    entry.connection.receive(text)
  }

  /** A socket closed or failed. Each visit pushes the clean-up back. */
  async closed(raw: RoomSocket) {
    const sid = raw.attachment()?.sid
    const entry = sid === undefined ? undefined : this.connections.get(sid)
    if (entry && sid !== undefined) {
      this.connections.delete(sid)
      this.heard.delete(sid)
      entry.connection.drop()
    }
    if (!this.record) return
    this.deadlines.cleanupAt = this.now() + KEEP_IDLE_MS
    await this.arm()
  }

  /** Write the deadlines down and set the one alarm for the earliest. */
  private async arm() {
    await this.storage.put({ [DEADLINES_KEY]: { ...this.deadlines } })
    const at = this.nextAlarm
    if (at === null) await this.storage.deleteAlarm()
    else await this.storage.setAlarm(at)
  }

  /** The alarm rang: do whatever is due, then set it for what is next. */
  async alarm() {
    const t = this.now()
    const matchId = this.matchId
    if (matchId && this.deadlines.flagAt !== null && this.deadlines.flagAt <= t) {
      this.deadlines.flagAt = null
      // Opens the game without anyone connected if need be, calls the flag and reports the result.
      await this.server.runDue(matchId)
    }
    if (this.deadlines.reportAt !== null && this.deadlines.reportAt <= t) await this.retryReport()
    if (this.deadlines.cleanupAt !== null && this.deadlines.cleanupAt <= t) {
      if (this.connections.size > 0) this.deadlines.cleanupAt = t + KEEP_IDLE_MS
      else {
        // Nobody has opened this game for a month. A finished game with accounts lives on in their history.
        const pending = await this.storage.get<PendingReport>(PENDING_KEY)
        if (pending) this.log({ level: 'error', event: 'report-abandoned', matchId, attempts: pending.attempts })
        this.record = null
        this.meta = null
        this.seats = null
        this.deadlines = { flagAt: null, reportAt: null, cleanupAt: null }
        await this.storage.deleteAll()
        await this.storage.deleteAlarm()
        return
      }
    }
    await this.arm()
  }

  /** Store a finished game for the accounts that played it; return their new ratings to show. */
  private async report(record: MatchRecord, state: MatchState, meta: RoomMeta): Promise<SeatAccounts | void> {
    const game = finishedGameOf(record, state, meta)
    if (!game) return
    const pending: PendingReport = { game, attempts: 0, accounts: meta.accounts }
    // Written before the call, so a failure (or this object restarting mid-call) leaves something to retry.
    await this.storage.put({ [PENDING_KEY]: pending })
    return (await this.attempt(pending)) ?? undefined
  }

  /**
   * One try at reporting. The retry is set before the call, not only when it
   * fails: if the object is evicted or restarted while the call is in flight
   * (a deploy), the alarm still comes back for the report. A retry racing a
   * slow success is harmless, since `recordGame` stores a game once. On
   * failure, schedule the next try and throw, so the game is not shown as rated.
   */
  private async attempt(pending: PendingReport): Promise<SeatAccounts | null> {
    this.deadlines.reportAt = this.now() + REPORT_RETRY_MS[Math.min(pending.attempts, REPORT_RETRY_MS.length - 1)]
    await this.arm()
    let changes: RatingChanges
    try {
      changes = await this.recordGame(pending.game)
    } catch (error) {
      const attempts = pending.attempts + 1
      this.deadlines.reportAt = this.now() + REPORT_RETRY_MS[Math.min(attempts, REPORT_RETRY_MS.length) - 1]
      this.log({
        level: 'error',
        event: 'report-failed',
        matchId: pending.game.id,
        attempts,
        message: error instanceof Error ? error.message : String(error),
      })
      await this.storage.put({ [PENDING_KEY]: { ...pending, attempts } })
      await this.arm()
      throw error
    }
    this.deadlines.reportAt = null
    await this.storage.delete([PENDING_KEY])
    await this.arm()
    return withRatings(pending.accounts, changes)
  }

  private async retryReport() {
    const pending = await this.storage.get<PendingReport>(PENDING_KEY)
    if (!pending) {
      this.deadlines.reportAt = null
      return
    }
    try {
      const accounts = await this.attempt(pending)
      // The ratings arrived late: anyone still here sees them now.
      if (accounts) this.server.setAccounts(pending.game.id, accounts)
    } catch {
      // Logged and rescheduled by `attempt`.
    }
  }
}
