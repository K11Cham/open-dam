import { isNetMessage } from './protocol'
import type { NetMessage } from './protocol'

/**
 * A transport moves protocol messages between clients and nothing else: no
 * game logic, no ordering guarantees beyond what the medium gives. Swapping
 * BroadcastChannel for a WebSocket means writing one more class like these.
 */
export interface Transport {
  send(message: NetMessage): void
  /** Returns an unsubscribe function. */
  onMessage(handler: (message: NetMessage) => void): () => void
  close(): void
}

/** Same-browser transport: every tab on this origin that opens the channel. */
export class BroadcastChannelTransport implements Transport {
  private channel: BroadcastChannel
  private handlers = new Set<(message: NetMessage) => void>()

  constructor(name = 'open-dam:net') {
    this.channel = new BroadcastChannel(name)
    this.channel.onmessage = (event: MessageEvent<unknown>) => {
      // Anything on the channel is untrusted input: check the shape first.
      if (!isNetMessage(event.data)) return
      for (const handler of [...this.handlers]) handler(event.data)
    }
  }

  send(message: NetMessage) {
    this.channel.postMessage(message)
  }

  onMessage(handler: (message: NetMessage) => void) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  close() {
    this.handlers.clear()
    this.channel.close()
  }
}

/**
 * In-memory hub for tests and simulations: every transport created from one
 * hub hears every other one (but not itself), like tabs on a BroadcastChannel.
 * Delivery is asynchronous to mimic a real network.
 */
export class MemoryHub {
  private members = new Set<MemoryTransport>()

  connect(): MemoryTransport {
    const transport = new MemoryTransport(this)
    this.members.add(transport)
    return transport
  }

  /** @internal */
  deliver(sender: MemoryTransport, message: NetMessage) {
    const copy = JSON.parse(JSON.stringify(message)) as NetMessage
    for (const member of this.members) if (member !== sender) queueMicrotask(() => member.receive(copy))
  }

  /** @internal */
  leave(member: MemoryTransport) {
    this.members.delete(member)
  }
}

export class MemoryTransport implements Transport {
  private handlers = new Set<(message: NetMessage) => void>()
  private readonly hub: MemoryHub
  private open = true

  constructor(hub: MemoryHub) {
    this.hub = hub
  }

  send(message: NetMessage) {
    if (this.open) this.hub.deliver(this, message)
  }

  onMessage(handler: (message: NetMessage) => void) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  /** @internal */
  receive(message: NetMessage) {
    if (!this.open) return
    for (const handler of [...this.handlers]) handler(message)
  }

  close() {
    this.open = false
    this.handlers.clear()
    this.hub.leave(this)
  }
}

/** One id per browser tab, kept across reloads of that tab so a guest can reclaim its seat. */
export function getClientId(): string {
  const key = 'openDam.clientId'
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
    return id
  } catch {
    return `c-${Math.random().toString(36).slice(2)}`
  }
}
