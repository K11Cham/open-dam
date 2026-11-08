import { sanitizeSettings } from '../game/settings'
import type { PlayerId } from '../game/types'
import { INITIAL_RATING, ratingPool } from '../match/rating'
import { SeekQueue } from './matchmaking'
import type { Pairing, Seek } from './matchmaking'
import { PROTOCOL_VERSION, isLobbyMessage } from './protocol'
import type { LobbyReply, SeekerMessage } from './protocol'
import type { ServerConnection } from './server'

/** One connection to the lobby: text out, a way to hang up, and (for a server that sleeps) somewhere to keep its seek. */
export interface LobbySocket {
  send(text: string): void
  close(): void
  /** Keep the connection's waiting seek with it (null once it is not waiting), so `resume` can put it back after the server sleeps. */
  rememberSeek?(seek: Seek | null): void
}

/**
 * The matchmaking lobby's logic, without the network: the counterpart of
 * `MatchServer` for players who want a game rather than one who has a link.
 * Whatever listens for connections hands each one to `accept`, exactly as it
 * does for `MatchServer`. A player posts a seek with the rules they want; the
 * lobby looks up their rating itself (a browser never says how strong it is),
 * runs the `SeekQueue`, starts a game for each pairing through `createMatch`,
 * and tells both players which match and seat are theirs. They then connect to
 * that match like any invited player.
 */

export interface LobbyOptions {
  /** Start a game for a pairing and return its match id (for example `MatchServer.createMatch`, or a request to a room). */
  createMatch: (pairing: Pairing) => string | Promise<string>
  /** A player's rating in a pool (`ratingPool` in src/match/rating.ts). Unknown players are new: 1500. */
  ratingOf?: (playerId: string, pool: string) => number | undefined
  now?: () => number
  /** Picks who moves first; injectable for tests. */
  random?: () => number
  serverId?: string
  /** Only signed-in players may seek (rated games need accounts); `accept` is then given each connection's account id. */
  requireAccount?: boolean
  /** Only timed games may be sought. Rated play is timed only, so an abandoned game always ends when a clock runs out. */
  requireClock?: boolean
  /**
   * Called with when the queue should next be swept, or null for never. When
   * given, the lobby sets no timer of its own: the caller calls `sweep` then
   * (a Durable Object alarm).
   */
  schedule?: (at: number | null) => void
}

/** The answer to an untimed seek when only timed games are rated. */
export const NEEDS_CLOCK = 'Rated games need a clock. Choose one, or invite a friend for an untimed game.'

/** How often waiting seeks are tried again, so their rating windows can widen. */
export const SWEEP_MS = 2_000

/** Client ids are short random strings; anything far longer is not one. */
const MAX_CLIENT_ID = 64

const SEATS: PlayerId[] = ['player1', 'player2']

const isSeekerMessage = (message: unknown): message is SeekerMessage =>
  isLobbyMessage(message) &&
  message.from.length > 0 &&
  message.from.length <= MAX_CLIENT_ID &&
  (message.type === 'seek' || message.type === 'cancel')

export class Lobby {
  private readonly queue: SeekQueue
  private readonly createMatch: LobbyOptions['createMatch']
  private readonly ratingOf: NonNullable<LobbyOptions['ratingOf']>
  private readonly now: () => number
  private readonly serverId: string
  private readonly requireAccount: boolean
  private readonly requireClock: boolean
  private readonly schedule: LobbyOptions['schedule']
  /** Each seeking player's newest connection, which is where their answer goes. */
  private sockets = new Map<string, LobbySocket>()
  private sweepTimer: ReturnType<typeof setTimeout> | undefined
  private nextSeek = 1

  constructor(options: LobbyOptions) {
    this.queue = new SeekQueue({ random: options.random })
    this.createMatch = options.createMatch
    this.ratingOf = options.ratingOf ?? (() => undefined)
    this.now = options.now ?? Date.now
    this.serverId = options.serverId ?? 'lobby'
    this.requireAccount = options.requireAccount ?? false
    this.requireClock = options.requireClock ?? false
    this.schedule = options.schedule
  }

  /** Players waiting for a game right now. */
  get waiting(): number {
    return this.queue.waiting.length
  }

  /**
   * A new connection. `accountId` is the account it is signed in to, as the
   * caller checked; when given, it is the player's identity in place of the
   * client id the browser sends, so one person in two tabs is one seeker.
   */
  accept(socket: LobbySocket, accountId: string | null = null): ServerConnection {
    return this.connect(socket, accountId, accountId)
  }

  /**
   * Pick connections up again after the server slept (a Durable Object waking
   * from hibernation). Each waiting seek goes back on the queue as it was,
   * keeping its place and its widened window.
   */
  resume(entries: Array<{ socket: LobbySocket; accountId: string | null; seek: Seek | null }>): ServerConnection[] {
    const connections = entries.map(({ socket, accountId, seek }) => {
      if (seek) {
        this.queue.restore(seek)
        this.sockets.set(seek.playerId, socket)
      }
      return this.connect(socket, accountId, accountId ?? seek?.playerId ?? null)
    })
    this.scheduleSweep()
    return connections
  }

  private connect(socket: LobbySocket, accountId: string | null, known: string | null): ServerConnection {
    let clientId: string | null = known

    const receive = (text: string) => {
      let message: unknown
      try {
        message = JSON.parse(text)
      } catch {
        return
      }
      if (!isSeekerMessage(message)) return
      if (accountId === null) {
        if (this.requireAccount) {
          if (message.type === 'seek')
            this.reply(socket, message.from, { type: 'seek-ended', reason: 'Sign in to find a rated game.' })
          return
        }
        // As on the match server, the first id a connection uses is its identity from then on.
        clientId ??= message.from
        if (message.from !== clientId) return
      }
      if (clientId === null) return
      if (message.type === 'cancel') {
        if (this.sockets.get(clientId) === socket) this.cancel(clientId, 'Search cancelled.')
        return
      }
      this.seek(socket, clientId, message.settings)
    }

    // A player who leaves stops seeking, unless they are already back on another connection.
    const drop = () => {
      if (clientId !== null && this.sockets.get(clientId) === socket) this.cancel(clientId, null)
    }

    return { receive, drop }
  }

  /** Try every waiting seek again, now that windows may have widened. Called by the sweep timer, or by the caller's alarm. */
  sweep() {
    for (const pairing of this.queue.sweep(this.now())) void this.start(pairing)
    this.scheduleSweep()
  }

  /** Stop the sweep timer (shutting down). Waiting players are not told; their connections are closing anyway. */
  close() {
    if (this.sweepTimer !== undefined) clearTimeout(this.sweepTimer)
    this.sweepTimer = undefined
  }

  private seek(socket: LobbySocket, playerId: string, untrusted: unknown) {
    const settings = sanitizeSettings(untrusted)
    if (this.requireClock && settings.timeControl === null) {
      this.reply(socket, playerId, { type: 'seek-ended', reason: NEEDS_CLOCK })
      return
    }
    const pool = ratingPool(settings)
    const rating = this.ratingOf(playerId, pool) ?? INITIAL_RATING
    // A seek from a second tab moves the player's answer there; the first tab hears that its search ended.
    const previous = this.sockets.get(playerId)
    if (previous && previous !== socket)
      this.reply(previous, playerId, { type: 'seek-ended', reason: 'Searching in another tab.' })
    if (previous && previous !== socket) previous.rememberSeek?.(null)
    this.sockets.set(playerId, socket)
    this.reply(socket, playerId, { type: 'seeking', pool, rating })
    const seek: Seek = { id: `${playerId}#${this.nextSeek++}`, playerId, settings, rating, since: this.now() }
    const pairing = this.queue.add(seek, this.now())
    if (pairing) void this.start(pairing)
    else socket.rememberSeek?.(seek)
    this.scheduleSweep()
  }

  private cancel(playerId: string, reason: string | null) {
    const seek = this.queue.waiting.find((s) => s.playerId === playerId)
    if (seek) this.queue.remove(seek.id)
    const socket = this.sockets.get(playerId)
    this.sockets.delete(playerId)
    socket?.rememberSeek?.(null)
    if (socket && reason) this.reply(socket, playerId, { type: 'seek-ended', reason })
    this.scheduleSweep()
  }

  /** Make the game, then tell both players where it is. If it cannot be made, both are told and may seek again. */
  private async start(pairing: Pairing) {
    const players = SEATS.map((seat) => pairing.seats[seat].playerId)
    const sockets = players.map((playerId) => this.sockets.get(playerId))
    for (const playerId of players) this.sockets.delete(playerId)
    for (const socket of sockets) socket?.rememberSeek?.(null)
    let matchId: string
    try {
      matchId = await this.createMatch(pairing)
    } catch {
      players.forEach((playerId, i) => {
        const socket = sockets[i]
        if (socket) this.reply(socket, playerId, { type: 'seek-ended', reason: 'Could not start the game. Try again.' })
      })
      return
    }
    SEATS.forEach((seat, i) => {
      const socket = sockets[i]
      const other = pairing.seats[SEATS[1 - i]]
      if (!socket) return
      this.reply(socket, players[i], {
        type: 'paired',
        matchId,
        seat,
        settings: pairing.settings,
        opponentRating: other.rating,
      })
    })
  }

  private scheduleSweep() {
    if (this.sweepTimer !== undefined) clearTimeout(this.sweepTimer)
    this.sweepTimer = undefined
    // Sweeping helps only while two or more wait and some window is still
    // widening. Once every window is at its widest only a new seek can pair,
    // and posting one already tries, so a quiet lobby is left to sleep.
    const due = this.queue.canWiden(this.now()) ? this.now() + SWEEP_MS : null
    if (this.schedule) {
      this.schedule(due)
      return
    }
    if (due === null) return
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = undefined
      this.sweep()
    }, SWEEP_MS)
  }

  private reply(socket: LobbySocket, to: string, body: DistributiveOmit<LobbyReply, 'v' | 'channel' | 'from' | 'to'>) {
    const message = { v: PROTOCOL_VERSION, channel: 'lobby', from: this.serverId, to, ...body } as LobbyReply
    socket.send(JSON.stringify(message))
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
