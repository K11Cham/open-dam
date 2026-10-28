import type { PlayerId } from '../game/types'
import { applyMatchAction, createMatchState, replay, stepMatch } from './reducer'
import type {
  Actor,
  MatchAction,
  MatchConfig,
  MatchIntent,
  MatchNotice,
  MatchRecord,
  MatchState,
} from './types'
import type { GameEvent } from '../game/types'

/**
 * A session is the live, observable form of one match. React subscribes to it;
 * players, the AI, the clock and network links submit intents to it.
 *
 * There are two kinds:
 *  - `MatchHost` owns the log and is authoritative. Every local game (hot seat
 *    or vs the computer) is a host with nobody else attached; an online game's
 *    host also has a network link feeding it remote intents.
 *  - `MatchGuest` (src/net/guest.ts) mirrors a remote host's log.
 */

export type ConnectionStatus = 'local' | 'connecting' | 'waiting-for-opponent' | 'connected' | 'disconnected'

export interface SessionSnapshot {
  record: MatchRecord
  state: MatchState
  connection: ConnectionStatus
  /** Which seats currently have someone attached (online only). */
  online: Record<PlayerId, boolean>
}

export interface SessionStep {
  action: MatchAction
  events: GameEvent[]
  notices: MatchNotice[]
}

export interface SessionUpdate {
  snapshot: SessionSnapshot
  step?: SessionStep
  /** A refused intent from this device, explained for people. */
  error?: string
}

export type SessionListener = (update: SessionUpdate) => void

export interface MatchSession {
  getSnapshot(): SessionSnapshot
  subscribe(listener: SessionListener): () => void
  /** Ask for something. Returns the refusal reason when it is refused locally, else null. */
  submit(by: Actor, intent: MatchIntent): string | null
  dispose(): void
}

let fallbackCounter = 0
export const newMatchId = (): string => {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${(fallbackCounter++).toString(36)}`
  return random
}

export const createRecord = (config: Omit<MatchConfig, 'id' | 'createdAt'> & Partial<Pick<MatchConfig, 'id' | 'createdAt'>>): MatchRecord => {
  const full: MatchConfig = { ...config, id: config.id ?? newMatchId(), createdAt: config.createdAt ?? Date.now() }
  // Normalise the settings once, through the engine, so the record carries the
  // fully-resolved rule set (e.g. "match opponent" already resolved).
  const settings = createMatchState(full).config.settings
  return { format: 'open-dam/match', version: 1, config: { ...full, settings }, actions: [] }
}

/** Base class with the listener plumbing both session kinds share. */
export abstract class SessionBase implements MatchSession {
  protected snapshot: SessionSnapshot
  private listeners = new Set<SessionListener>()

  constructor(initial: SessionSnapshot) {
    this.snapshot = initial
  }

  getSnapshot = (): SessionSnapshot => this.snapshot

  subscribe = (listener: SessionListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  protected publish(update: Omit<SessionUpdate, 'snapshot'> & { snapshot?: SessionSnapshot }) {
    if (update.snapshot) this.snapshot = update.snapshot
    const full: SessionUpdate = { ...update, snapshot: this.snapshot }
    for (const listener of [...this.listeners]) listener(full)
  }

  abstract submit(by: Actor, intent: MatchIntent): string | null

  dispose() {
    this.listeners.clear()
  }
}

export interface HostOptions {
  /** Injectable clock for tests. */
  now?: () => number
  connection?: ConnectionStatus
}

/**
 * The authoritative session. `submit` validates through the reducer, stamps
 * the action with a sequence number and time, appends it to the log and tells
 * every subscriber — including any network link, which forwards it to peers.
 */
export class MatchHost extends SessionBase {
  private readonly now: () => number

  constructor(record: MatchRecord, options: HostOptions = {}) {
    super({
      record,
      state: replay(record),
      connection: options.connection ?? 'local',
      online: { player1: false, player2: false },
    })
    this.now = options.now ?? Date.now
  }

  submit(by: Actor, intent: MatchIntent): string | null {
    const { record, state } = this.snapshot
    const at = this.now()
    const result = stepMatch(state, by, intent, at)
    if (result.error) {
      this.publish({ error: result.error })
      return result.error
    }
    const action: MatchAction = { seq: state.lastSeq + 1, at, by, intent }
    const nextState = { ...result.state, lastSeq: action.seq }
    this.publish({
      snapshot: { ...this.snapshot, record: { ...record, actions: [...record.actions, action] }, state: nextState },
      step: { action, events: result.events, notices: result.notices },
    })
    return null
  }

  /** Network links report who is attached; it only affects display. */
  setPresence(online: Record<PlayerId, boolean>, connection: ConnectionStatus) {
    const same =
      online.player1 === this.snapshot.online.player1 &&
      online.player2 === this.snapshot.online.player2 &&
      connection === this.snapshot.connection
    if (!same) this.publish({ snapshot: { ...this.snapshot, online, connection } })
  }
}

/** Apply a stamped action from elsewhere (used by guests). */
export const followAction = (state: MatchState, action: MatchAction) => applyMatchAction(state, action)
