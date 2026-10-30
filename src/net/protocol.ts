import type { PlayerId } from '../game/types'
import type { MatchAction, MatchIntent, MatchRecord } from '../match/types'

/**
 * The wire protocol for online play. It is deliberately small and
 * transport-agnostic: the same messages travel over a BroadcastChannel today
 * (two tabs in one browser) and over a WebSocket to a server tomorrow.
 *
 * The host is authoritative. Guests never change their own state directly;
 * they send an `intent`, the host validates it with the match reducer, and
 * every client (the sender included) applies the stamped `action` the host
 * broadcasts back. A guest that falls behind or reconnects asks to `join`
 * again and receives a full `snapshot`.
 *
 * Every message names the match and the sending client, so many matches can
 * share one channel and clients can ignore what is not for them.
 */

export const PROTOCOL_VERSION = 1

interface Envelope {
  v: typeof PROTOCOL_VERSION
  matchId: string
  /** Sender's client id (one per browser tab). */
  from: string
}

/** Guest → host. */
export type GuestMessage = Envelope &
  (
    | { type: 'join'; seat: PlayerId }
    | { type: 'intent'; seat: PlayerId; intent: MatchIntent; nonce: string }
    | { type: 'ping'; seat: PlayerId }
    | { type: 'leave'; seat: PlayerId }
  )

/** Host → guests. `to` targets one client; omitted means everyone. */
export type HostMessage = Envelope &
  (
    | { type: 'welcome'; to: string; seat: PlayerId; record: MatchRecord }
    | { type: 'seat-taken'; to: string; seat: PlayerId }
    | { type: 'snapshot'; record: MatchRecord }
    | { type: 'action'; action: MatchAction }
    | { type: 'rejected'; to: string; nonce: string; reason: string }
    | { type: 'presence'; online: Record<PlayerId, boolean> }
    | { type: 'closed' }
  )

export type NetMessage = GuestMessage | HostMessage

export const isNetMessage = (value: unknown): value is NetMessage =>
  typeof value === 'object' &&
  value !== null &&
  (value as { v?: unknown }).v === PROTOCOL_VERSION &&
  typeof (value as { matchId?: unknown }).matchId === 'string' &&
  typeof (value as { type?: unknown }).type === 'string'

/**
 * A transport moves protocol messages between clients and nothing else: no
 * game logic, no ordering guarantees beyond what the medium gives. It lives
 * here rather than in transport.ts so the server can use it without pulling
 * in the browser-only transports.
 */
export interface Transport {
  send(message: NetMessage): void
  /** Returns an unsubscribe function. */
  onMessage(handler: (message: NetMessage) => void): () => void
  close(): void
}

/** Match ids are short and URL safe; a server refuses anything else before it reaches storage. */
export const MATCH_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** How often clients announce themselves, and when silence means "gone". */
export const HEARTBEAT_MS = 2000
export const PRESENCE_TIMEOUT_MS = 6000
