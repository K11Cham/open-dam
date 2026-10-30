import { DurableObject } from 'cloudflare:workers'
import type { MatchRecord } from '../src/match/types'
import { MatchServer } from '../src/net/server'
import type { ServerConnection } from '../src/net/server'
import type { Env } from './index'

const RECORD_KEY = 'record'

/** A frame bigger than this is not a game message (a long record is sent by the server, never to it). */
const MAX_FRAME_CHARS = 16_384

/** Games nobody has opened for this long are deleted, so storage does not grow forever. */
const KEEP_IDLE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * One online match. Cloudflare starts one of these per match id, wherever the
 * first player connects, and every player of that match reaches the same one,
 * so it can run `MatchServer` exactly as the tests do: in memory, single
 * threaded, with the record saved to this object's own storage after every
 * accepted action.
 */
export class MatchRoom extends DurableObject<Env> {
  private record: MatchRecord | null = null
  private readonly server: MatchServer

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Nothing else runs until the saved record is in memory, so the store
    // below can answer synchronously, as `MatchStore` requires.
    void ctx.blockConcurrencyWhile(async () => {
      this.record = (await ctx.storage.get<MatchRecord>(RECORD_KEY)) ?? null
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
      },
    })
  }

  /** Called once by the Worker for a new match. False if this id is already taken. */
  async create(record: MatchRecord): Promise<boolean> {
    if (this.record) return false
    this.record = record
    await this.ctx.storage.put(RECORD_KEY, record)
    await this.ctx.storage.setAlarm(Date.now() + KEEP_IDLE_MS)
    return true
  }

  async fetch(): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, socket] = [pair[0], pair[1]]
    socket.accept()
    let connection: ServerConnection | null = this.server.accept({
      send: (text) => {
        try {
          socket.send(text)
        } catch {
          // The socket closed under us; its close event drops the connection.
        }
      },
      close: () => socket.close(),
    })
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

  /** Nobody has opened this game for a month: forget it. */
  async alarm() {
    if (this.server.openRooms.length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + KEEP_IDLE_MS)
      return
    }
    this.record = null
    await this.ctx.storage.deleteAll()
  }
}
