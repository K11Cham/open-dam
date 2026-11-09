import { KEEPALIVE_REQUEST, isNetMessage } from './protocol'
import type { NetMessage, Transport } from './protocol'

/** The part of the browser's WebSocket this transport uses, so tests can pass a fake. */
export type SocketLike = Pick<WebSocket, 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose'> & { readonly readyState: number }

export interface WebSocketTransportOptions {
  /** Opens the socket. Defaults to the browser's `WebSocket`. */
  createSocket?: (url: string) => SocketLike
  /** Wait before the first reconnect; it doubles after each failed attempt. */
  minDelayMs?: number
  maxDelayMs?: number
  /** Picks each delay's spread; injectable for tests. */
  random?: () => number
  /**
   * Where to hear that trying again now is worth it: the browser coming back
   * online, or the page becoming visible again. Defaults to `window` and
   * `document`; tests pass their own.
   */
  wakeups?: { subscribe(retry: () => void): () => void }
}

/** The parts of `window` and `document` the wakeups use; this file also runs in Node (the online checks), which has neither. */
interface BrowserScope {
  addEventListener?(type: string, listener: () => void): void
  removeEventListener?(type: string, listener: () => void): void
  document?: {
    visibilityState: string
    addEventListener(type: string, listener: () => void): void
    removeEventListener(type: string, listener: () => void): void
  }
}

/** The browser's own signals that a connection may work again. */
const browserWakeups = {
  subscribe(retry: () => void) {
    const scope = globalThis as unknown as BrowserScope
    const page = scope.document
    if (!scope.addEventListener || !page) return () => {}
    const onVisible = () => page.visibilityState === 'visible' && retry()
    scope.addEventListener('online', retry)
    page.addEventListener('visibilitychange', onVisible)
    return () => {
      scope.removeEventListener?.('online', retry)
      page.removeEventListener('visibilitychange', onVisible)
    }
  },
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
 * exponential backoff and jitter (each wait is between half and all of the
 * backoff, so a server restart is not met by every client at the same
 * instant), and at once when the browser comes back online or the page is
 * shown again, until `close` is called. It knows nothing about the
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
  private outbox: NetMessage[] = []
  /** Whether the current socket has carried a full message yet, which tells the server who is on it. */
  private introduced = false
  private failures = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private closed = false
  private readonly random: () => number
  private readonly stopWakeups: () => void

  constructor(url: string, options: WebSocketTransportOptions = {}) {
    this.url = url
    this.createSocket = options.createSocket ?? ((target) => new WebSocket(target))
    this.minDelayMs = options.minDelayMs ?? 500
    this.maxDelayMs = options.maxDelayMs ?? 15_000
    this.random = options.random ?? Math.random
    this.stopWakeups = (options.wakeups ?? browserWakeups).subscribe(() => this.retryNow())
    this.open()
  }

  /** A reason to think the network is back: if we are waiting to reconnect, do it now. */
  private retryNow() {
    if (this.closed || this.socket !== null || this.retry === undefined) return
    clearTimeout(this.retry)
    this.retry = undefined
    this.failures = 0
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
      this.introduced = false
      for (const message of this.outbox.splice(0)) socket.send(this.encode(message))
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
    const backoff = Math.min(this.maxDelayMs, this.minDelayMs * 2 ** this.failures)
    const delay = backoff / 2 + (backoff / 2) * this.random()
    this.failures++
    this.retry = setTimeout(() => {
      this.retry = undefined
      this.open()
    }, delay)
  }

  /** Whether the socket is open right now (for display; sending works either way). */
  get connected(): boolean {
    return this.socket?.readyState === OPEN
  }

  /**
   * A heartbeat ping becomes the shared keepalive once this socket has told
   * the server who it is, so a server that can answer keepalives without
   * waking (a hibernating Durable Object) does. The first message on every new
   * socket goes in full, so a server that restarted learns the client and its
   * seat again.
   */
  private encode(message: NetMessage): string {
    if (message.type === 'ping' && this.introduced) return KEEPALIVE_REQUEST
    this.introduced = true
    return JSON.stringify(message)
  }

  send(message: NetMessage) {
    if (this.closed) return
    if (this.socket?.readyState === OPEN) {
      this.socket.send(this.encode(message))
      return
    }
    this.outbox.push(message)
    if (this.outbox.length > MAX_QUEUED) this.outbox.shift()
  }

  onMessage(handler: (message: NetMessage) => void) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close() {
    this.closed = true
    this.stopWakeups()
    clearTimeout(this.retry)
    this.handlers.clear()
    this.outbox = []
    const socket = this.socket
    this.socket = null
    socket?.close()
  }
}
