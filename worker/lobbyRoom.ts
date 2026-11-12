import { DurableObject } from 'cloudflare:workers'
import { createRecord } from '../src/match/session'
import { Lobby } from '../src/net/lobby'
import type { LobbySocket } from '../src/net/lobby'
import type { Pairing, Seek } from '../src/net/matchmaking'
import type { Identity, ServerConnection } from '../src/net/server'
import type { Env } from './index'
import { identityFrom } from './room'

/** A seek is a few hundred bytes. */
const MAX_FRAME_CHARS = 4096

/** What each lobby socket keeps with itself across hibernation. */
interface LobbyAttachment {
  identity: Identity | null
  /** The player's rating in each pool they have played, read when they connected. */
  ratings: Record<string, number>
  /** Their waiting seek, if any. */
  seek: Seek | null
  /** A keyed hash of their network, from the Worker, so two accounts on one network are not paired. */
  network: string | null
}

/**
 * Matchmaking, as one Durable Object that every seeker reaches, running the
 * `Lobby` from src/net. Only signed-in players may seek, since every game it
 * makes is rated, and only timed games (an abandoned rated game must end when
 * a clock runs out). Each player's ratings are read from the Accounts object
 * when they connect, so the browser never says how strong it is; each pairing
 * becomes a match room whose two seats belong to the two accounts.
 *
 * Sockets use the Hibernatable WebSockets API. A waiting seek lives in its
 * socket's attachment, so when the object wakes after sleeping, `Lobby.resume`
 * puts every waiting player back on the queue; the sweep that widens rating
 * windows is an alarm, not a timer.
 */
export class LobbyRoom extends DurableObject<Env> {
  private readonly lobby: Lobby
  private connections = new Map<WebSocket, ServerConnection>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.lobby = new Lobby({
      requireAccount: true,
      requireClock: true,
      ratingOf: (playerId, pool) => this.personOf(playerId)?.ratings[pool],
      createMatch: (pairing) => this.startGame(pairing),
      schedule: (at) => void (at === null ? ctx.storage.deleteAlarm() : ctx.storage.setAlarm(at)),
    })
    // Waking from hibernation: everyone still connected, with their seeks.
    const sockets = ctx.getWebSockets()
    const resumed = this.lobby.resume(
      sockets.map((ws) => {
        const attachment = this.attachmentOf(ws)
        return {
          socket: this.wrap(ws),
          accountId: attachment?.identity?.id ?? null,
          seek: attachment?.seek ?? null,
          network: attachment?.network ?? null,
        }
      }),
    )
    sockets.forEach((ws, i) => this.connections.set(ws, resumed[i]))
  }

  private attachmentOf(ws: WebSocket): LobbyAttachment | null {
    return (ws.deserializeAttachment() as LobbyAttachment | null) ?? null
  }

  /** Who a connected account is and how they are rated, from whichever of their sockets is open. */
  private personOf(accountId: string): LobbyAttachment | null {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = this.attachmentOf(ws)
      if (attachment?.identity?.id === accountId) return attachment
    }
    return null
  }

  private wrap(ws: WebSocket): LobbySocket {
    return {
      send: (text) => {
        try {
          ws.send(text)
        } catch {
          // Closed under us; the close event cleans up.
        }
      },
      close: () => ws.close(),
      rememberSeek: (seek) => {
        const attachment = this.attachmentOf(ws)
        if (attachment) ws.serializeAttachment({ ...attachment, seek })
      },
    }
  }

  private async startGame(pairing: Pairing): Promise<string> {
    const seatOf = (seat: 'player1' | 'player2') => {
      const seek = pairing.seats[seat]
      const identity = this.personOf(seek.playerId)?.identity
      if (!identity) throw new Error('A paired player left.')
      return { ...identity, rating: seek.rating }
    }
    const player1 = seatOf('player1')
    const player2 = seatOf('player2')
    const record = createRecord({
      mode: 'online',
      settings: pairing.settings,
      seats: {
        player1: { kind: 'remote', name: player1.displayName },
        player2: { kind: 'remote', name: player2.displayName },
      },
    })
    const room = this.env.MATCHES.get(this.env.MATCHES.idFromName(record.config.id))
    const created = await room.create(record, { rated: true, accounts: { player1, player2 } })
    if (!created) throw new Error('That game id is taken.')
    return record.config.id
  }

  async fetch(request: Request): Promise<Response> {
    const identity = identityFrom(request)
    const network = request.headers.get('X-Open-Dam-Network')
    // Read fresh each time someone connects, so a rating just earned counts in the next search.
    const ratings = identity ? await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('accounts')).ratingMap(identity.id) : {}
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    const attachment: LobbyAttachment = { identity, ratings, seek: null, network }
    server.serializeAttachment(attachment)
    this.connections.set(server, this.lobby.accept(this.wrap(server), identity?.id ?? null, network))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string' && message.length <= MAX_FRAME_CHARS) this.connections.get(ws)?.receive(message)
  }

  private drop(ws: WebSocket) {
    const connection = this.connections.get(ws)
    this.connections.delete(ws)
    connection?.drop()
  }

  async webSocketClose(ws: WebSocket) {
    // The runtime answers the close handshake itself (compatibility date 2026-04-07 and later).
    this.drop(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.drop(ws)
  }

  /** Time to sweep the queue again, so waiting players' rating windows widen. */
  async alarm() {
    this.lobby.sweep()
  }
}
