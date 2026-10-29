import { isNetMessage } from './protocol'
import type { NetMessage } from './protocol'
import type { Transport } from './transport'

/** The part of the browser's WebSocket this transport uses, so tests can pass a fake. */
export type SocketLike = Pick<WebSocket, 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose'> & { readonly readyState: number }

export interface WebSocketTransportOptions {
  /** Opens the socket. Defaults to the browser's `WebSocket`. */
  createSocket?: (url: string) => SocketLike
  /** Wait before the first reconnect; it doubles after each failed attempt. */
  minDelayMs?: number
  maxDelayMs?: number
}

const OPEN = 1

/**
 * Messages sent while the socket is down wait here and go out when it opens
 * again. The cap keeps a long outage from piling up heartbeats; dropping the
 * oldest is safe because guests rejoin on their own and the host judges any
 * late intent against the game as it is now.
 */
const MAX_QUEUED = 32

/**
 * Transport over a WebSocket to a match server. It reconnects by itself, with
 * exponential backoff, until `close` is called. It knows nothing about the
 * game: after a reconnect the guest's own heartbeat and the server's snapshot
 * bring the game back in step.
 */
export class WebSocketTransport implements Transport {
  private readonly url: string
  private readonly createSocket: (url: string) => SocketLike
  private readonly minDelayMs: number
  private readonly maxDelayMs: number
  private socket: SocketLike | null = null
  private handlers = new Set<(message: NetMessage) => void>()
  private outbox: string[] = []
  private failures = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(url: string, options: WebSocketTransportOptions = {}) {
    this.url = url
    this.createSocket = options.createSocket ?? ((target) => new WebSocket(target))
    this.minDelayMs = options.minDelayMs ?? 500
    this.maxDelayMs = options.maxDelayMs ?? 15_000
    this.open()
  }

  private open() {
    let socket: SocketLike
    try {
      socket = this.createSocket(this.url)
    } catch {
      this.reconnectLater()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      this.failures = 0
      for (const text of this.outbox.splice(0)) socket.send(text)
    }
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      let message: unknown
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      // Anything from the network is untrusted input: check the shape first.
      if (!isNetMessage(message)) return
      for (const handler of [...this.handlers]) handler(message)
    }
    socket.onclose = () => {
      // A socket replaced or closed on purpose says nothing about the link.
      if (this.socket !== socket) return
      this.socket = null
      if (!this.closed) this.reconnectLater()
    }
  }

  private reconnectLater() {
    const delay = Math.min(this.maxDelayMs, this.minDelayMs * 2 ** this.failures)
    this.failures++
    this.retry = setTimeout(() => this.open(), delay)
  }

  /** Whether the socket is open right now (for display; sending works either way). */
  get connected(): boolean {
    return this.socket?.readyState === OPEN
  }

  send(message: NetMessage) {
    if (this.closed) return
    const text = JSON.stringify(message)
    if (this.socket?.readyState === OPEN) {
      this.socket.send(text)
      return
    }
    this.outbox.push(text)
    if (this.outbox.length > MAX_QUEUED) this.outbox.shift()
  }

  onMessage(handler: (message: NetMessage) => void) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close() {
    this.closed = true
    clearTimeout(this.retry)
    this.handlers.clear()
    this.outbox = []
    const socket = this.socket
    this.socket = null
    socket?.close()
  }
}
