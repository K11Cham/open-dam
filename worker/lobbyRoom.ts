import { DurableObject } from 'cloudflare:workers'
import { createRecord } from '../src/match/session'
import { Lobby } from '../src/net/lobby'
import type { Pairing } from '../src/net/matchmaking'
import type { Identity, ServerConnection } from '../src/net/server'
import type { Env } from './index'
import { identityFrom } from './room'

/** A seek is a few hundred bytes. */
const MAX_FRAME_CHARS = 4096

/**
 * Matchmaking, as one Durable Object that every seeker reaches, running the
 * `Lobby` from src/net. Only signed-in players may seek, since every game it
 * makes is rated. Each player's ratings are read from the Accounts object when
 * they connect, so the browser never says how strong it is; each pairing
 * becomes a match room whose two seats belong to the two accounts.
 */
export class LobbyRoom extends DurableObject<Env> {
  private readonly lobby: Lobby
  /** For each connected account: who they are, and their rating in each pool they have played. */
  private people = new Map<string, { identity: Identity; ratings: Record<string, number> }>()
  private connections = new Map<string, number>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.lobby = new Lobby({
      requireAccount: true,
      ratingOf: (playerId, pool) => this.people.get(playerId)?.ratings[pool],
      createMatch: (pairing) => this.startGame(pairing),
    })
  }

  private async startGame(pairing: Pairing): Promise<string> {
    const seatOf = (seat: 'player1' | 'player2') => {
      const seek = pairing.seats[seat]
      const person = this.people.get(seek.playerId)
      if (!person) throw new Error('A paired player left.')
      return { ...person.identity, rating: seek.rating }
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
    if (identity) {
      // Read fresh each time someone connects, so a rating just earned counts in the next search.
      const ratings = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('accounts')).ratingMap(identity.id)
      this.people.set(identity.id, { identity, ratings })
      this.connections.set(identity.id, (this.connections.get(identity.id) ?? 0) + 1)
    }
    const pair = new WebSocketPair()
    const [client, socket] = [pair[0], pair[1]]
    socket.accept()
    let connection: ServerConnection | null = this.lobby.accept(
      {
        send: (text) => {
          try {
            socket.send(text)
          } catch {
            // Closed under us; the close event cleans up.
          }
        },
        close: () => socket.close(),
      },
      identity?.id ?? null,
    )
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string' && event.data.length <= MAX_FRAME_CHARS) connection?.receive(event.data)
    })
    const drop = () => {
      if (!connection) return
      connection.drop()
      connection = null
      if (!identity) return
      const left = (this.connections.get(identity.id) ?? 1) - 1
      if (left > 0) this.connections.set(identity.id, left)
      else {
        this.connections.delete(identity.id)
        this.people.delete(identity.id)
      }
    }
    socket.addEventListener('close', drop)
    socket.addEventListener('error', drop)
    return new Response(null, { status: 101, webSocket: client })
  }
}
