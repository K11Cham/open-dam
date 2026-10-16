/**
 * Core type vocabulary for the dam rules engine.
 *
 * Everything in `src/game` is pure: no React, no localStorage, no DOM. The
 * engine takes a state and an intent and returns a new state plus a list of
 * events. That keeps the same code usable by the match screen, the analysis
 * board, the tutorial, and (later) the AI opponent.
 */

export type PlayerId = 'player1' | 'player2'

export interface PieceData {
  player: PlayerId
  isKing: boolean
  id: string
}

export type Piece = PieceData | null
export type Board = Piece[][]

export type BoardType = 'yinyang' | 'even'
export type BoardSize = 5 | 6 | 7 | 8 | 9

export interface Coord {
  row: number
  col: number
}

/**
 * Promotion-during-a-chain behaviour. This is a subjective rule, so it is a
 * per-match setting rather than a hardcoded behaviour.
 *
 * - `promote-and-continue` (default): the piece becomes a king the instant it
 *   lands on the far row and may keep capturing in the same chain using king
 *   movement.
 * - `promote-after-chain`: the piece is flagged, finishes the chain with
 *   normal-piece movement, and is crowned when the chain ends.
 * - `end-turn-on-promotion`: crowning ends the turn immediately, chain or not.
 * - `match-opponent`: resolves to whatever the opponent picked. Meaningless
 *   offline, so it resolves to the default locally — see `resolvePromotionPolicy`.
 */
export type PromotionPolicy =
  | 'promote-and-continue'
  | 'promote-after-chain'
  | 'end-turn-on-promotion'
  | 'match-opponent'

/** A promotion policy with `match-opponent` already resolved away. */
export type ResolvedPromotionPolicy = Exclude<PromotionPolicy, 'match-opponent'>

/** What a successful call takes from the offender. */
export type CallScope = 'all' | 'choose-one'

export interface CallSettings {
  scope: CallScope
  /**
   * Whether abandoning a chain capture partway through exposes the *remaining*
   * captures to a call, or whether only a completely skipped capture counts.
   */
  abandonedChainCallable: boolean
}

export interface DrawSettings {
  /** Same position (board + side to move) reached three times. */
  threefoldRepetition: boolean
  /**
   * Plies (half-moves) without a capture before the game is drawn. `null`
   * disables the rule. 50 plies == 25 moves each.
   */
  pliesWithoutCapture: number | null
}

export interface TimeControl {
  /** Starting clock for each player, in milliseconds. */
  initialMs: number
  /** Fischer increment added on move completion, in milliseconds. */
  incrementMs: number
  /** Human label, e.g. "5+3". */
  label: string
}

export interface RuleSettings {
  boardSize: BoardSize
  boardType: BoardType
  promotionPolicy: PromotionPolicy
  call: CallSettings
  draw: DrawSettings
  /** `null` means untimed. */
  timeControl: TimeControl | null
}

/** One entry in the move list, already rendered to notation. */
export interface MoveRecord {
  /** Ply index, 0-based. */
  ply: number
  player: PlayerId
  /** Algebraic-ish notation, e.g. `c3`, `c3xc5`, `c3xc5xe5+`, `!b2`. */
  notation: string
  from: Coord | null
  to: Coord | null
  kind: 'move' | 'capture' | 'chain' | 'call' | 'resign' | 'draw-agreed'
  capturedIds: string[]
  promoted: boolean
  /** Set when this ply continues a chain begun by the previous ply. */
  continuesChain: boolean
}

/**
 * Animation-ready events. The engine never touches the DOM; it emits these and
 * the UI layer decides what to draw. Every state change produces at least one.
 */
export type GameEvent =
  | { type: 'move'; player: PlayerId; pieceId: string; from: Coord; to: Coord; isKing: boolean }
  | { type: 'capture'; player: PlayerId; pieceId: string; captured: PieceData; at: Coord }
  | { type: 'chain-continue'; player: PlayerId; pieceId: string; at: Coord }
  | { type: 'chain-end'; player: PlayerId; pieceId: string; at: Coord }
  | { type: 'promotion'; player: PlayerId; pieceId: string; at: Coord; deferred: boolean }
  | { type: 'auto-king'; player: PlayerId; pieceId: string; at: Coord }
  | { type: 'call'; caller: PlayerId; removed: Array<{ piece: PieceData; at: Coord }> }
  | { type: 'call-available'; caller: PlayerId; offenders: Offender[] }
  | { type: 'turn-change'; player: PlayerId }
  | { type: 'win'; winner: PlayerId; reason: WinReason }
  | { type: 'tie'; reason: DrawReason }
  | { type: 'illegal'; reason: string }

export type WinReason = 'no-pieces' | 'resignation' | 'timeout'
export type DrawReason = 'one-each-stalemate' | 'threefold' | 'no-captures' | 'agreement'

export type GameStatus =
  | { kind: 'playing' }
  | { kind: 'win'; winner: PlayerId; reason: WinReason }
  | { kind: 'draw'; reason: DrawReason }

/** A piece that had a capture available and whose owner declined it. */
export interface Offender {
  pieceId: string
  at: Coord
  /** True when this came from abandoning a chain rather than never starting one. */
  fromAbandonedChain: boolean
}

export interface ChainState {
  active: boolean
  /** Where the capturing piece currently sits. */
  at: Coord | null
  /** Set under `promote-after-chain` when the piece has earned but not received its crown. */
  pendingPromotionPieceId: string | null
  /** Captures made so far this chain, for notation. */
  legs: Coord[]
}

export interface ClockState {
  player1Ms: number
  player2Ms: number
  /** Which clock is counting down; `null` when both are paused. */
  running: PlayerId | null
  /** `performance.now()`-style timestamp of the last tick applied. */
  lastTickAt: number | null
}

export interface EngineState {
  settings: RuleSettings
  board: Board
  currentPlayer: PlayerId
  status: GameStatus
  chain: ChainState
  /** Offenders the *current* player may call on. */
  offenders: Offender[]
  moves: MoveRecord[]
  /** Serialized position -> times seen, for threefold. */
  positionCounts: Record<string, number>
  pliesSinceCapture: number
  /** Yin/yang opening: player one's very first move may be into the centre. */
  isFirstMove: boolean
  clock: ClockState | null
  /** Incrementing id source so new kings/pieces never collide. */
  nextPieceId: number
}

export interface EngineResult {
  state: EngineState
  events: GameEvent[]
  /** Set when the intent was rejected; `state` is then returned unchanged. */
  error?: string
}
