import type { DifficultyId } from '../ai/difficulty'
import type { EngineAction, EngineState, GameEvent, PlayerId, RuleSettings } from '../game/types'

/**
 * The match layer sits between the pure rules engine and everything that
 * drives a game: people at the keyboard, the AI, and (later) the network.
 *
 * A match is a CONFIG (rules + who sits where) plus an ordered ACTION LOG.
 * Everything else — the board, the move list, the clocks, pending offers — is
 * derived by replaying that log. That one decision is what makes the game
 * saveable, reviewable, undoable and sendable over a wire with the same code.
 */

/** Who is operating a side. `remote` is a person on another device or tab. */
export type SeatKind = 'human' | 'ai' | 'remote'

export interface Seat {
  kind: SeatKind
  /** Display name. AI seats use the tier name. */
  name: string
  /** Set for `ai` seats. */
  difficulty?: DifficultyId
}

export type MatchMode = 'local' | 'online'

export interface MatchConfig {
  id: string
  mode: MatchMode
  settings: RuleSettings
  seats: Record<PlayerId, Seat>
  /** Epoch ms. */
  createdAt: number
}

export type OfferKind = 'undo' | 'draw'

/**
 * What a participant asks for. Intents are validated by the reducer — the same
 * check runs for a click, the AI, and a message from a peer.
 */
export type MatchIntent =
  | { type: 'engine'; action: EngineAction }
  | { type: 'offer'; kind: OfferKind }
  | { type: 'answer-offer'; accept: boolean }
  | { type: 'cancel-offer' }
  /** Clock bookkeeping for local games: the app was closed, then reopened. */
  | { type: 'pause' }
  | { type: 'resume' }

/** `system` is the match itself: clock flags and pause/resume bookkeeping. */
export type Actor = PlayerId | 'system'

/** One accepted entry in the log. `seq` is 1-based and gap-free. */
export interface MatchAction {
  seq: number
  /** Epoch ms when the action was accepted. Drives the clock. */
  at: number
  by: Actor
  intent: MatchIntent
}

/** The portable form of a game: what is saved, archived and sent to peers. */
export interface MatchRecord {
  format: 'open-dam/match'
  version: 1
  config: MatchConfig
  actions: MatchAction[]
}

export interface PendingOffer {
  kind: OfferKind
  by: PlayerId
}

/**
 * Clock model: one side runs at a time. `since` is when the running side's
 * current stretch began; `remaining` is what each side had at that moment.
 * Reading the time "now" is `remaining - (now - since)` for the running side.
 */
export interface MatchClock {
  remaining: Record<PlayerId, number>
  running: PlayerId | null
  since: number | null
  paused: boolean
}

export interface MatchState {
  config: MatchConfig
  /** Position after every accepted engine action; index 0 is the start. */
  timeline: EngineState[]
  /** The live position (last timeline entry). */
  position: EngineState
  offer: PendingOffer | null
  /** One undo request and one draw offer per player per turn. */
  undoAskedThisTurn: Record<PlayerId, boolean>
  drawOfferedThisTurn: Record<PlayerId, boolean>
  clock: MatchClock | null
  lastSeq: number
}

/** Something the UI may want to tell people about, beyond board events. */
export type MatchNotice =
  | { type: 'offer-made'; kind: OfferKind; by: PlayerId }
  | { type: 'offer-accepted'; kind: OfferKind; by: PlayerId }
  | { type: 'offer-declined'; kind: OfferKind; by: PlayerId }
  | { type: 'offer-cancelled'; kind: OfferKind; by: PlayerId }
  | { type: 'undo-applied'; for: PlayerId }

export interface MatchStepResult {
  state: MatchState
  /** Board events from the engine, for animation. */
  events: GameEvent[]
  notices: MatchNotice[]
  /** Set when the intent was refused; `state` is then unchanged. */
  error?: string
}
