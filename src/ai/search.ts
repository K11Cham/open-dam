import { applyAction as applyEngineAction, applyCall, canCall, legalActions } from '../game/engine'
import { getCaptures } from '../game/moves'
import type { EngineAction, EngineState } from '../game/types'
import { WIN_SCORE, declineCost, evaluate, kingValue } from './evaluate'
import type { EvalProfile } from './evaluate'
import { hashPosition } from './hash'
import { pickOpening } from './openings'

/**
 * Negamax with alpha-beta over the real engine. Every node is produced by the
 * engine's own `applyAction`, so the search can never consider a move the
 * rules would refuse.
 *
 * What is specific to dam:
 *
 *  1. The side to move does not always alternate. A chain capture keeps the
 *     same player on move, so a child is only negated when the turn changed.
 *     Chain legs also cost no depth: a chain is one decision spread over
 *     several plies, and every leg removes a piece, so it always ends. Without
 *     this, a three-leg chain would eat three plies of lookahead and the
 *     engine could not see a sacrifice that sets one up.
 *
 *  2. Calls are resolved greedily at node entry instead of being branched on.
 *     A call removes an enemy piece and does not end your turn, so it is free
 *     material; there is no position where declining one is better.
 *
 *  3. Captures are optional but not free to ignore: skipping one gets the
 *     capturing piece called. The quiescence search therefore charges the side
 *     to move for "standing pat" while a capture is on the board. Without that
 *     charge, a forced capture into a trap looks avoidable, and the engine
 *     misses the classic sacrifice that says "take this, or lose that piece".
 *
 *  4. Replies that are forced in this sense (the opponent must capture or be
 *     called) can be searched one ply deeper, the way chess engines extend
 *     checks. The budget per line is a search option, so weaker tiers cannot
 *     see as far through a combination.
 *
 * Standard machinery on top: iterative deepening inside a time budget, a
 * transposition table keyed by Zobrist hashes, killer and history move
 * ordering, and mate-distance scores so a faster win is always preferred.
 */

/** The AI speaks the same action vocabulary as everyone else. */
export type AIAction = EngineAction

export interface SearchOptions {
  depth: number
  profile: EvalProfile
  /** Hard wall-clock ceiling; the best completed depth is returned. */
  timeBudgetMs: number
  /** Extra capture-only plies past the horizon. 0 disables quiescence. */
  quiescenceDepth: number
  /** Centipiece jitter added to root scores, making weak tiers inconsistent. */
  noise: number
  /** Chance of deliberately playing a worse move than the best one found. */
  blunderChance: number
  /**
   * How much worse (in centipieces) a deliberate mistake may be. `Infinity`
   * means any legal move, while stronger tiers only slip to moves that look
   * nearly as good, the way a person misjudges rather than throws a piece away.
   */
  blunderMargin?: number
  /** Chance of not noticing that a call is available. Beginners forget to call. */
  missCallChance?: number
  /**
   * Whether quiescence knows that declining a capture gets the piece called
   * (see point 3 above). Off for the weakest tiers, which is exactly the blind
   * spot a beginner has.
   */
  callAware?: boolean
  /** Extra plies allowed per line for forced replies (see point 4 above). */
  forcingExtensions?: number
  /**
   * How loosely the first move follows the opening book (see openings.ts).
   * Lower is sharper. Left out, the search picks the first move itself.
   */
  openingTemperature?: number
  /** Remember scored positions between branches (default on; off is for measuring). */
  transpositionTable?: boolean
  /** Defaults to Math.random; tests pass a seeded source. */
  random?: () => number
}

export interface SearchResult {
  action: AIAction
  score: number
  nodes: number
  depthReached: number
  /** True when the tier's blunder roll fired and a weaker move was played on purpose. */
  blundered: boolean
}

// ---------------------------------------------------------------------------
// Action generation
// ---------------------------------------------------------------------------

/** Moves and chain decisions. Calls are resolved greedily, so they are left out. */
export function generateActions(state: EngineState): AIAction[] {
  return legalActions(state).filter((action) => action.type !== 'call')
}

export function applyAction(state: EngineState, action: AIAction): EngineState {
  return applyEngineAction(state, action).state
}

/** Best offender to call on: the most valuable piece still on the board. */
export function bestCallTarget(state: EngineState): string | undefined {
  if (state.offenders.length === 0) return undefined
  const size = state.settings.boardSize
  let best = state.offenders[0]
  let bestValue = -1
  for (const offender of state.offenders) {
    const piece = state.board[offender.at.row]?.[offender.at.col]
    if (!piece) continue
    const value = piece.isKing ? kingValue(size) : 100
    if (value > bestValue) {
      bestValue = value
      best = offender
    }
  }
  return best.pieceId
}

/** Take any call that is on offer before deciding on a move. */
const resolveCalls = (state: EngineState): EngineState => {
  if (!canCall(state)) return state
  const result = applyCall(state, bestCallTarget(state))
  return result.error ? state : result.state
}

/** The square a move captures on, or null for a plain slide or `end-chain`. */
const capturedSquare = (state: EngineState, action: AIAction): { row: number; col: number } | null => {
  if (action.type !== 'move') return null
  const dr = Math.sign(action.to.row - action.from.row)
  const dc = Math.sign(action.to.col - action.from.col)
  let r = action.from.row + dr
  let c = action.from.col + dc
  while (r !== action.to.row || c !== action.to.col) {
    if (state.board[r][c]) return { row: r, col: c }
    r += dr
    c += dc
  }
  return null
}

const isCapture = (state: EngineState, action: AIAction): boolean => capturedSquare(state, action) !== null

/**
 * Small integer key for a move, used by the history table and the TT. 0 means
 * "no move" and 1 is ending a chain.
 */
const moveKey = (action: AIAction): number => {
  if (action.type === 'end-chain') return 1
  if (action.type !== 'move') return 0
  return (((action.from.row * 16 + action.from.col) * 16 + action.to.row) * 16 + action.to.col) | 0x10000
}

const hasCapture = (state: EngineState): boolean => getCaptures(state.board, state.currentPlayer).length > 0

// ---------------------------------------------------------------------------
// Transposition table
// ---------------------------------------------------------------------------

const EXACT = 0
const LOWER = 1
const UPPER = 2
const TABLE_LIMIT = 1 << 18
const MATE_BOUND = WIN_SCORE - 1000

interface Entry {
  check: number
  depth: number
  score: number
  flag: number
  move: number
}

/** Mate scores are stored relative to the node, so they stay true at any ply. */
const toTable = (score: number, ply: number) => (score > MATE_BOUND ? score + ply : score < -MATE_BOUND ? score - ply : score)
const fromTable = (score: number, ply: number) => (score > MATE_BOUND ? score - ply : score < -MATE_BOUND ? score + ply : score)

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

interface Context {
  profile: EvalProfile
  deadline: number
  quiescenceDepth: number
  callAware: boolean
  useTable: boolean
  nodes: number
  aborted: boolean
  table: Map<number, Entry>
  killers: Int32Array
  history: Int32Array
}

const MAX_PLY = 128

/**
 * Captures first (most valuable victim, then the cheapest capturer), then the
 * remembered best move, killers and history, then forward progress. Ending a
 * chain goes last, because continuing is usually right.
 */
const orderActions = (state: EngineState, actions: AIAction[], ctx: Context, ply: number, ttMove: number): AIAction[] => {
  const size = state.settings.boardSize
  const king = kingValue(size)
  const scored = actions.map((action) => {
    const key = moveKey(action)
    if (key !== 0 && key === ttMove) return { action, score: 1e9 }
    if (action.type !== 'move') return { action, score: -1e6 }
    const mover = state.board[action.from.row][action.from.col]
    const victimAt = capturedSquare(state, action)
    if (victimAt) {
      const victim = state.board[victimAt.row][victimAt.col]
      return { action, score: 1e7 + (victim?.isKing ? king : 100) * 10 - (mover?.isKing ? 50 : 0) }
    }
    let score = 0
    if (ply < MAX_PLY && (ctx.killers[ply * 2] === key || ctx.killers[ply * 2 + 1] === key)) score += 5e5
    score += ctx.history[key & 0xffff]
    const goalRow = mover?.player === 'player1' ? 0 : size - 1
    if (mover && !mover.isKing) score += (Math.abs(action.from.row - goalRow) - Math.abs(action.to.row - goalRow)) * 12
    return { action, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.map((entry) => entry.action)
}

const rememberCutoff = (ctx: Context, action: AIAction, ply: number, depth: number) => {
  const key = moveKey(action)
  if (key <= 1) return
  if (ply < MAX_PLY && ctx.killers[ply * 2] !== key) {
    ctx.killers[ply * 2 + 1] = ctx.killers[ply * 2]
    ctx.killers[ply * 2] = key
  }
  const slot = key & 0xffff
  ctx.history[slot] = Math.min(4e5, ctx.history[slot] + depth * depth)
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Score of a finished game for the side to move at that node. Negamax scores
 * are always relative to whoever is on move, never to the root player. Faster
 * wins and slower losses score better.
 */
const terminalScore = (state: EngineState, ply: number): number => {
  if (state.status.kind === 'win') {
    return state.status.winner === state.currentPlayer ? WIN_SCORE - ply : -WIN_SCORE + ply
  }
  return 0
}

const outOfTime = (ctx: Context): boolean => {
  // Reading the clock on every node is measurable; every 256th is plenty.
  if ((ctx.nodes & 255) === 0 && performance.now() > ctx.deadline) ctx.aborted = true
  return ctx.aborted
}

/** Capture-only extension, so the search does not stop mid-exchange. */
function quiesce(state: EngineState, alpha: number, beta: number, depth: number, ply: number, ctx: Context): number {
  ctx.nodes++
  if (state.status.kind !== 'playing') return terminalScore(state, ply)

  const resolved = resolveCalls(state)
  // A call can end the game (it may leave one piece each, or none).
  if (resolved.status.kind !== 'playing') return terminalScore(resolved, ply)

  // Mid-chain, "doing nothing" is not an option: the choice is to continue or
  // to stop, and stopping has its own consequences. Search both.
  if (resolved.chain.active) {
    if (depth <= 0 || outOfTime(ctx)) return evaluate(resolved, resolved.currentPlayer, ctx.profile)
    let best = -Infinity
    for (const action of orderActions(resolved, generateActions(resolved), ctx, ply, 0)) {
      const child = applyAction(resolved, action)
      const sameSide = child.currentPlayer === resolved.currentPlayer
      const score = sameSide
        ? quiesce(child, alpha, beta, depth, ply + 1, ctx)
        : -quiesce(child, -beta, -alpha, depth - 1, ply + 1, ctx)
      if (score > best) best = score
      if (best > alpha) alpha = best
      if (alpha >= beta || ctx.aborted) break
    }
    return best
  }

  let standPat = evaluate(resolved, resolved.currentPlayer, ctx.profile)
  // Standing pat while a capture is available means declining it, and a
  // declined capture gets called.
  if (ctx.callAware) standPat -= declineCost(resolved)
  if (depth <= 0) return standPat
  if (standPat >= beta) return standPat
  if (standPat > alpha) alpha = standPat

  const captures = generateActions(resolved).filter((action) => isCapture(resolved, action))
  if (captures.length === 0) return standPat

  let best = standPat
  for (const action of orderActions(resolved, captures, ctx, ply, 0)) {
    if (outOfTime(ctx)) break
    const child = applyAction(resolved, action)
    const sameSide = child.currentPlayer === resolved.currentPlayer
    // Chain legs do not use up the quiescence budget: a chain always ends.
    const score = sameSide
      ? quiesce(child, alpha, beta, depth, ply + 1, ctx)
      : -quiesce(child, -beta, -alpha, depth - 1, ply + 1, ctx)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

function negamax(
  state: EngineState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  extensions: number,
  ctx: Context,
): number {
  ctx.nodes++
  if (state.status.kind !== 'playing') return terminalScore(state, ply)
  if (outOfTime(ctx)) return evaluate(state, state.currentPlayer, ctx.profile)

  const resolved = resolveCalls(state)
  // A call can end the game; without this check the empty action list below
  // would be misread as "stuck", i.e. a loss for the side to move.
  if (resolved.status.kind !== 'playing') return terminalScore(resolved, ply)

  // Forced reply: the side to move must capture or be called. Look one ply
  // further, within this line's extension budget.
  if (extensions > 0 && !resolved.chain.active && depth <= 2 && hasCapture(resolved)) {
    depth++
    extensions--
  }

  if (depth <= 0) {
    return ctx.quiescenceDepth > 0
      ? quiesce(resolved, alpha, beta, ctx.quiescenceDepth, ply, ctx)
      : evaluate(resolved, resolved.currentPlayer, ctx.profile)
  }

  const key = hashPosition(resolved)
  const entry = ctx.useTable ? ctx.table.get(key.slot) : undefined
  let ttMove = 0
  if (entry && entry.check === key.check) {
    ttMove = entry.move
    if (entry.depth >= depth) {
      const score = fromTable(entry.score, ply)
      if (entry.flag === EXACT) return score
      if (entry.flag === LOWER && score >= beta) return score
      if (entry.flag === UPPER && score <= alpha) return score
    }
  }

  const actions = generateActions(resolved)
  if (actions.length === 0) {
    // The engine settles a blocked side as a loss before we get here; this is
    // only a guard.
    return -WIN_SCORE + ply
  }

  const alphaAtEntry = alpha
  let best = -Infinity
  let bestMove = 0
  for (const action of orderActions(resolved, actions, ctx, ply, ttMove)) {
    const child = applyAction(resolved, action)
    const sameSide = child.currentPlayer === resolved.currentPlayer
    const score = sameSide
      ? negamax(child, depth, alpha, beta, ply + 1, extensions, ctx)
      : -negamax(child, depth - 1, -beta, -alpha, ply + 1, extensions, ctx)
    if (ctx.aborted) return best === -Infinity ? score : best

    if (score > best) {
      best = score
      bestMove = moveKey(action)
    }
    if (best > alpha) alpha = best
    if (alpha >= beta) {
      if (!isCapture(resolved, action)) rememberCutoff(ctx, action, ply, depth)
      break
    }
  }

  if (!ctx.useTable) return best
  if (ctx.table.size >= TABLE_LIMIT) ctx.table.clear()
  ctx.table.set(key.slot, {
    check: key.check,
    depth,
    score: toTable(best, ply),
    flag: best <= alphaAtEntry ? UPPER : best >= beta ? LOWER : EXACT,
    move: bestMove,
  })
  return best
}

/**
 * Root search. Iterative deepening, so a time cut-off still returns a complete,
 * usable result from the last finished depth.
 */
export function chooseAction(state: EngineState, options: SearchOptions): SearchResult | null {
  if (state.status.kind !== 'playing') return null
  const random = options.random ?? Math.random

  // A call is decided before anything else and surfaced as its own action, so
  // the move list shows it the way a human's call would appear. A weak tier
  // may simply not notice it, and then the chance is gone once it moves.
  if (canCall(state)) {
    const missed = (options.missCallChance ?? 0) > 0 && random() < (options.missCallChance ?? 0)
    if (!missed) {
      return {
        action: { type: 'call', pieceId: bestCallTarget(state) },
        score: 0,
        nodes: 0,
        depthReached: 0,
        blundered: false,
      }
    }
  }

  // The opening comes from the book: the search sees every opening as even.
  // It runs before the blunder roll, so on move one the temperature alone sets
  // how often a tier picks a weak opening.
  if (options.openingTemperature !== undefined) {
    const opening = pickOpening(state, options.openingTemperature, random)
    if (opening) return { action: opening, score: 0, nodes: 0, depthReached: 0, blundered: false }
  }

  const actions = generateActions(state)
  if (actions.length === 0) return null
  if (actions.length === 1) return { action: actions[0], score: 0, nodes: 0, depthReached: 0, blundered: false }

  const margin = options.blunderMargin ?? Infinity
  const blunder = options.blunderChance > 0 && random() < options.blunderChance
  if (blunder && margin === Infinity) {
    const pick = actions[Math.floor(random() * actions.length)] ?? actions[0]
    return { action: pick, score: 0, nodes: 0, depthReached: 0, blundered: true }
  }

  const ctx: Context = {
    profile: options.profile,
    deadline: performance.now() + options.timeBudgetMs,
    quiescenceDepth: options.quiescenceDepth,
    callAware: options.callAware ?? true,
    useTable: options.transpositionTable ?? true,
    nodes: 0,
    aborted: false,
    table: new Map(),
    killers: new Int32Array(MAX_PLY * 2),
    history: new Int32Array(0x10000),
  }
  const extensions = options.forcingExtensions ?? 0

  let bestAction = actions[0]
  let bestScore = -Infinity
  let depthReached = 0
  let ordered = orderActions(state, actions, ctx, 0, 0)

  // With noise or a bounded blunder, every root move needs an exact score, so
  // the root window stays fully open (no alpha narrowing at the root). Without
  // this, noise added to one move's score would tighten the bound and corrupt
  // the scores of every move searched after it.
  const exactRoot = options.noise > 0 || blunder

  let lastScored: Array<{ action: AIAction; score: number }> = []
  for (let depth = 1; depth <= options.depth; depth++) {
    let alpha = -Infinity
    const beta = Infinity
    let iterationBest = ordered[0]
    let iterationScore = -Infinity
    const scored: Array<{ action: AIAction; score: number }> = []

    for (const action of ordered) {
      const child = applyAction(state, action)
      const sameSide = child.currentPlayer === state.currentPlayer
      const raw = sameSide
        ? negamax(child, depth, alpha, beta, 1, extensions, ctx)
        : -negamax(child, depth - 1, -beta, -alpha, 1, extensions, ctx)
      if (ctx.aborted && depth > 1) break

      // Jitter is applied at the root only: it makes weaker tiers pick
      // plausible-but-not-best moves without corrupting the tree below.
      const score = options.noise > 0 ? raw + (random() - 0.5) * 2 * options.noise : raw

      scored.push({ action, score })
      if (score > iterationScore) {
        iterationScore = score
        iterationBest = action
      }
      if (!exactRoot && raw > alpha) alpha = raw
    }

    if (!ctx.aborted || depth === 1) {
      bestAction = iterationBest
      bestScore = iterationScore
      depthReached = depth
      // Feed this depth's ordering into the next one. Moves that failed low
      // only have an upper bound, but their relative order is still a good guess.
      lastScored = scored.sort((a, b) => b.score - a.score)
      ordered = [...lastScored.map((entry) => entry.action), ...ordered.filter((a) => !lastScored.some((s) => s.action === a))]
    } else if (scored.length > 0 && scored[0].action === ordered[0] && iterationScore > bestScore) {
      // The interrupted iteration finished the previous best move and found
      // it even better; that result is still sound.
      bestScore = iterationScore
    }
    if (ctx.aborted) break
    if (Math.abs(bestScore) >= MATE_BOUND) break
  }

  if (blunder && lastScored.length > 1) {
    const plausible = lastScored.filter((entry, index) => index > 0 && bestScore - entry.score <= margin)
    if (plausible.length > 0) {
      const pick = plausible[Math.floor(random() * plausible.length)]
      return { action: pick.action, score: pick.score, nodes: ctx.nodes, depthReached, blundered: true }
    }
  }

  return { action: bestAction, score: bestScore, nodes: ctx.nodes, depthReached, blundered: false }
}
