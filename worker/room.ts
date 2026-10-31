import { DurableObject } from 'cloudflare:workers'
import { ratedScore, ratingPool } from '../src/match/rating'
import type { MatchRecord, MatchState, SeatAccounts } from '../src/match/types'
import { MatchServer, emptyMeta } from '../src/net/server'
import type { Identity, RoomMeta, ServerConnection } from '../src/net/server'
import type { Env } from './index'

const RECORD_KEY = 'record'
const META_KEY = 'meta'

/** A frame bigger than this is not a game message (a long record is sent by the server, never to it). */
const MAX_FRAME_CHARS = 16_384

/** Games nobody has opened for this long are deleted, so storage does not grow forever. */
const KEEP_IDLE_MS = 30 * 24 * 60 * 60 * 1000

/** The account the Worker checked for this connection, or null for a guest. */
export const identityFrom = (request: Request): Identity | null => {
  const header = request.headers.get('X-Open-Dam-Identity')
  if (!header) return null
  try {
    const value = JSON.parse(decodeURIComponent(header)) as Identity
    return typeof value?.id === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * One online match. Cloudflare starts one of these per match id, wherever the
 * first player connects, and every player of that match reaches the same one,
 * so it can run `MatchServer` exactly as the tests do: in memory, single
 * threaded, with the record saved to this object's own storage after every
 * accepted action. Beside the record it keeps the seats' accounts (`RoomMeta`),
 * and when a game with accounts ends it reports it to the Accounts object,
 * which stores it and, for a rated game, moves both ratings.
 */
export class MatchRoom extends DurableObject<Env> {
  private record: MatchRecord | null = null
  private meta: RoomMeta | null = null
  private readonly server: MatchServer

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Nothing else runs until the saved record is in memory, so the store
    // below can answer synchronously, as `MatchStore` requires.
    void ctx.blockConcurrencyWhile(async () => {
      this.record = (await ctx.storage.get<MatchRecord>(RECORD_KEY)) ?? null
      this.meta = (await ctx.storage.get<RoomMeta>(META_KEY)) ?? null
    })
    this.server = new MatchServer({
      store: {
        // A room only ever serves the match it was created for.
        load: (matchId) => (this.record?.config.id === matchId ? this.record : null),
        save: (record) => {
          this.record = record
          // Not awaited: Cloudflare holds back this object's outgoing messages
          // until the write is durable, so nobody sees a move that was not saved.
          void ctx.storage.put(RECORD_KEY, record)
        },
        loadMeta: () => this.meta,
        saveMeta: (_matchId, meta) => {
          this.meta = meta
          void ctx.storage.put(META_KEY, meta)
        },
      },
      onFinished: (record, state, meta) => this.report(record, state, meta),
    })
  }

  /** Called once by the Worker or the lobby for a new match. False if this id is already taken. */
  async create(record: MatchRecord, meta: RoomMeta = emptyMeta()): Promise<boolean> {
    if (this.record) return false
    this.record = record
    this.meta = meta
    await this.ctx.storage.put({ [RECORD_KEY]: record, [META_KEY]: meta })
    await this.ctx.storage.setAlarm(Date.now() + KEEP_IDLE_MS)
    return true
  }

  /** Store a finished game for the accounts that played it; return their new ratings to show. */
  private async report(record: MatchRecord, state: MatchState, meta: RoomMeta): Promise<SeatAccounts | void> {
    const { player1, player2 } = meta.accounts
    if (!player1 && !player2) return
    const status = state.position.status
    if (status.kind === 'playing') return
    // A game one side never moved in says nothing about strength; it is kept, unrated.
    const counts = ratedScore(state) !== null
    const changes = await this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('accounts')).recordGame({
      id: record.config.id,
      pool: ratingPool(record.config.settings),
      rated: meta.rated && counts,
      finishedAt: record.actions.at(-1)?.at ?? Date.now(),
      players: { player1: player1?.id ?? null, player2: player2?.id ?? null },
      winner: status.kind === 'win' ? status.winner : null,
      reason: status.reason,
      // Counted as the result summary counts them: moves and captures, not calls or resignations.
      plies: state.position.moves.filter((m) => m.kind === 'move' || m.kind === 'capture').length,
      record: JSON.stringify(record),
    })
    if (!changes.player1 && !changes.player2) return
    const withRating = (seat: 'player1' | 'player2') => {
      const account = meta.accounts[seat]
      const change = changes[seat]
      return account && change ? { ...account, rating: change.after, change: change.after - change.before } : account
    }
    return { player1: withRating('player1'), player2: withRating('player2') }
  }

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, socket] = [pair[0], pair[1]]
    socket.accept()
    let connection: ServerConnection | null = this.server.accept(
      {
        send: (text) => {
          try {
            socket.send(text)
          } catch {
            // The socket closed under us; its close event drops the connection.
          }
        },
        close: () => socket.close(),
      },
      identityFrom(request),
    )
    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string' && event.data.length <= MAX_FRAME_CHARS) connection?.receive(event.data)
    })
    const drop = () => {
      connection?.drop()
      connection = null
      // Each visit pushes the clean-up back.
      void this.ctx.storage.setAlarm(Date.now() + KEEP_IDLE_MS)
    }
    socket.addEventListener('close', drop)
    socket.addEventListener('error', drop)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Nobody has opened this game for a month: forget it. A finished game with accounts lives on in their history. */
  async alarm() {
    if (this.server.openRooms.length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + KEEP_IDLE_MS)
      return
    }
    this.record = null
    this.meta = null
    await this.ctx.storage.deleteAll()
  }
}
