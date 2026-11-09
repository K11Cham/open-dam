import { DurableObject } from 'cloudflare:workers'
import type { MatchRecord } from '../src/match/types'
import { KEEPALIVE_REQUEST, keepaliveResponse } from '../src/net/protocol'
import { emptyMeta } from '../src/net/server'
import type { Identity, RoomMeta } from '../src/net/server'
import type { Env } from './index'
import { RoomCore } from './roomCore'
import type { RoomSocket, SocketAttachment } from './roomCore'

/** A frame bigger than this is not a game message (a long record is sent by the server, never to it). */
const MAX_FRAME_CHARS = 16_384

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
 * One online match. Cloudflare starts one of these per match id, and every
 * player of that match reaches the same one, so it can run `MatchServer`
 * exactly as the tests do. The logic is `RoomCore` (roomCore.ts); this class
 * only connects it to Cloudflare.
 *
 * Its sockets use the Hibernatable WebSockets API: between messages the
 * object can be evicted from memory while the sockets stay open, so a game
 * where both players are thinking costs nothing. Keepalives are answered by
 * the runtime without waking it (`setWebSocketAutoResponse`), the running
 * clock's flag is an alarm rather than a timer, and on waking `RoomCore.open`
 * rebuilds every connection from its socket's attachment.
 */
export class MatchRoom extends DurableObject<Env> {
  private core!: RoomCore
  private sockets = new WeakMap<WebSocket, RoomSocket>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Nothing else runs until the saved match is in memory, so the store can answer synchronously, as `MatchStore` requires.
    void ctx.blockConcurrencyWhile(async () => {
      const storage = ctx.storage
      this.core = await RoomCore.open(
        {
          storage: {
            get: (key) => storage.get(key),
            put: (entries) => storage.put(entries),
            delete: (keys) => storage.delete(keys),
            deleteAll: () => storage.deleteAll(),
            setAlarm: (at) => storage.setAlarm(at),
            deleteAlarm: () => storage.deleteAlarm(),
            getAlarm: () => storage.getAlarm(),
          },
          recordGame: (game) => this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('accounts')).recordGame(game),
        },
        ctx.getWebSockets().map((ws) => this.wrap(ws)),
      )
      this.answerKeepalives()
    })
  }

  /** Let the runtime answer keepalives itself, so a quiet game does not wake the object. */
  private answerKeepalives() {
    const matchId = this.core.matchId
    if (matchId)
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(KEEPALIVE_REQUEST, keepaliveResponse(matchId)))
  }

  private wrap(ws: WebSocket): RoomSocket {
    const known = this.sockets.get(ws)
    if (known) return known
    const socket: RoomSocket = {
      send: (text) => ws.send(text),
      close: () => ws.close(),
      attachment: () => (ws.deserializeAttachment() as SocketAttachment | null) ?? null,
      attach: (value) => ws.serializeAttachment(value),
      autoResponseAt: () => this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null,
    }
    this.sockets.set(ws, socket)
    return socket
  }

  /** Called once by the Worker or the lobby for a new match. False if this id is already taken. */
  async create(record: MatchRecord, meta: RoomMeta = emptyMeta()): Promise<boolean> {
    const created = await this.core.create(record, meta)
    if (created) this.answerKeepalives()
    return created
  }

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    this.core.connect(this.wrap(server), identityFrom(request))
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string' && message.length <= MAX_FRAME_CHARS) this.core.message(this.wrap(ws), message)
  }

  async webSocketClose(ws: WebSocket) {
    // The runtime answers the close handshake itself (compatibility date 2026-04-07 and later).
    await this.core.closed(this.wrap(ws))
  }

  async webSocketError(ws: WebSocket) {
    await this.core.closed(this.wrap(ws))
  }

  /** The one alarm: a clock's flag, a report to retry, or the clean-up of a game nobody opens. */
  async alarm() {
    await this.core.alarm()
  }
}
