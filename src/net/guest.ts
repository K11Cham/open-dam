import { DEFAULT_SETTINGS } from '../game/settings'
import type { PlayerId } from '../game/types'
import { applyMatchAction, replay } from '../match/reducer'
import { SessionBase } from '../match/session'
import type { Actor, MatchIntent, MatchRecord } from '../match/types'
import { HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, PROTOCOL_VERSION } from './protocol'
import type { GuestMessage, HostMessage } from './protocol'
import type { Transport } from './transport'

type GuestBody = GuestMessage extends infer M ? (M extends GuestMessage ? Omit<M, 'v' | 'matchId' | 'from'> : never) : never

const placeholderRecord = (matchId: string): MatchRecord => ({
  format: 'open-dam/match',
  version: 1,
  config: {
    id: matchId,
    mode: 'online',
    createdAt: 0,
    settings: DEFAULT_SETTINGS,
    seats: { player1: { kind: 'remote', name: 'Red' }, player2: { kind: 'remote', name: 'Blue' } },
  },
  actions: [],
})

/**
 * A guest mirrors a host's match. It never decides anything: intents go to the
 * host, and the guest only applies the stamped actions the host broadcasts.
 * If it misses one (a gap in sequence numbers) it asks for a fresh snapshot.
 */
export class MatchGuest extends SessionBase {
  private readonly matchId: string
  private readonly seat: PlayerId
  private readonly clientId: string
  private readonly now: () => number
  private transport: Transport | null = null
  private welcomed = false
  private lastHeardFromHost = 0
  private nonce = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private stopListening: (() => void) | undefined

  /** Creating a guest has no side effects; nothing is sent until `connect`. */
  constructor(options: { matchId: string; seat: PlayerId; clientId: string; now?: () => number }) {
    const record = placeholderRecord(options.matchId)
    super({ record, state: replay(record), connection: 'connecting', online: { player1: false, player2: false } })
    this.matchId = options.matchId
    this.seat = options.seat
    this.clientId = options.clientId
    this.now = options.now ?? Date.now
  }

  /** Start talking to the host over `transport`. Safe to call again after `disconnect`. */
  connect(transport: Transport) {
    this.disconnect()
    this.transport = transport
    this.stopListening = transport.onMessage((message) => {
      if (message.matchId !== this.matchId || message.from === this.clientId) return
      this.handle(message as HostMessage)
    })
    this.send({ type: 'join', seat: this.seat })
    this.timer = setInterval(() => this.tick(), HEARTBEAT_MS)
  }

  /** Stop talking to the host and tell it we left. The game state is kept. */
  disconnect() {
    if (!this.transport) return
    clearInterval(this.timer)
    this.send({ type: 'leave', seat: this.seat })
    this.stopListening?.()
    this.transport = null
    this.welcomed = false
  }

  private send(body: GuestBody) {
    this.transport?.send({ v: PROTOCOL_VERSION, matchId: this.matchId, from: this.clientId, ...body } as GuestMessage)
  }

  private tick() {
    if (this.welcomed) this.send({ type: 'ping', seat: this.seat })
    else this.send({ type: 'join', seat: this.seat })
    if (
      this.welcomed &&
      this.now() - this.lastHeardFromHost > PRESENCE_TIMEOUT_MS &&
      this.snapshot.connection !== 'disconnected'
    ) {
      this.publish({ snapshot: { ...this.snapshot, connection: 'disconnected' } })
      this.welcomed = false
    }
  }

  private adopt(record: MatchRecord) {
    try {
      const state = replay(record)
      this.publish({ snapshot: { ...this.snapshot, record, state, connection: 'connected' } })
    } catch {
      this.publish({ error: 'The game data from the host could not be read.' })
    }
  }

  private handle(message: HostMessage) {
    // Anything addressed to a different client is not ours.
    if ('to' in message && message.to !== this.clientId) return
    this.lastHeardFromHost = this.now()

    switch (message.type) {
      case 'welcome':
        this.welcomed = true
        this.adopt(message.record)
        return
      case 'snapshot':
        if (this.welcomed) this.adopt(message.record)
        else this.send({ type: 'join', seat: this.seat })
        return
      case 'seat-taken':
        this.publish({
          snapshot: { ...this.snapshot, connection: 'disconnected' },
          error: 'Someone else is already playing this side of the game.',
        })
        return
      case 'rejected':
        this.publish({ error: message.reason })
        return
      case 'presence':
        this.publish({
          snapshot: {
            ...this.snapshot,
            online: message.online,
            connection: this.welcomed ? 'connected' : this.snapshot.connection,
          },
        })
        return
      case 'closed':
        this.welcomed = false
        this.publish({ snapshot: { ...this.snapshot, connection: 'disconnected' } })
        return
      case 'action': {
        if (!this.welcomed) return
        const { state, record } = this.snapshot
        if (message.action.seq <= state.lastSeq) return // already have it
        if (message.action.seq !== state.lastSeq + 1) {
          // Missed something: rejoin to get a full snapshot.
          this.welcomed = false
          this.send({ type: 'join', seat: this.seat })
          return
        }
        const result = applyMatchAction(state, message.action)
        if (result.error) {
          this.welcomed = false
          this.send({ type: 'join', seat: this.seat })
          return
        }
        this.publish({
          snapshot: {
            ...this.snapshot,
            state: result.state,
            record: { ...record, actions: [...record.actions, message.action] },
          },
          step: { action: message.action, events: result.events, notices: result.notices },
        })
      }
    }
  }

  submit(by: Actor, intent: MatchIntent): string | null {
    if (by !== this.seat) return 'You can only act for your own side.'
    if (this.snapshot.connection !== 'connected') {
      const error = 'Not connected to the host right now.'
      this.publish({ error })
      return error
    }
    this.send({ type: 'intent', seat: this.seat, intent, nonce: `${this.clientId}:${this.nonce++}` })
    return null
  }

  dispose() {
    this.disconnect()
    super.dispose()
  }
}
