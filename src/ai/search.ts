import { applyAction as applyEngineAction, applyCall, canCall, legalActions } from '../game/engine'
import type { EngineAction, EngineState } from '../game/types'
import { WIN_SCORE, evaluate, kingValue } from './evaluate'
import type { EvalProfile } from './evaluate'

/**
 * Negamax with alpha-beta over the real engine — every node is produced by
 * `applyMove`, so the search can never consider a move the rules would refuse.
 *
 * Two things here are not standard negamax:
 *
 *  1. The side to move does not always alternate. A chain capture keeps the
 *     same player on move, so each child is checked and only negated when the
 *     turn actually changed. Depth still decrements on every ply, which is what
 *     keeps a long chain from exploding the tree.
 *
 *  2. Calling is resolved greedily at node entry rather than branched on.
 *     A call removes an enemy piece and does not end your turn, so under these
 *     rules it is free material with no positional cost — there is no position
 *     where declining a call available to you is better. Branching on it would
 *     double the tree for a decision with one right answer. Under `choose-one`
 *     the greedy pick is the most valuable offender.
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
   * means any legal move — the Novice tier — while stronger tiers only slip
   * to moves that look nearly as good, the way a person misjudges rather than
   * throws a piece away.
   */
  blunderMargin?: number
  /** Defaults to Math.random; tests pass a seeded source. */
  random?: () => number
}

export interface SearchResult {
  action: AIAction
  score: number
  nodes: number
  depthReached: number
  /** True when the tier's blunder roll fired and the move was picked at random. */
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

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Cheap ordering so alpha-beta gets its cutoffs early: captures first, biggest
 * material gain first, then forward progress. Ending a chain is tried last,
 * because continuing is usually right.
 */
const orderingScore = (state: EngineState, action: AIAction): number => {
  if (action.type === 'end-chain') return -1000
  if (action.type === 'call') return 5000
  if (action.type !== 'move') return -5000
  const target = state.board[action.to.row]?.[action.to.col]
  const jumped = Math.abs(action.to.row - action.from.row) + Math.abs(action.to.col - action.from.col)
  const mover = state.board[action.from.row]?.[action.from.col]
  const size = state.settings.boardSize

  let score = 0
  if (jumped >= 2 || target) score += 900
  if (mover?.isKing) score += 40
  // Forward progress, normalised by board size.
  const goalRow = mover?.player === 'player1' ? 0 : size - 1
  score += (Math.abs(action.from.row - goalRow) - Math.abs(action.to.row - goalRow)) * 12
  return score
}

const sortActions = (state: EngineState, actions: AIAction[]): AIAction[] =>
  actions
    .map((action) => ({ action, score: orderingScore(state, action) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.action)

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface Context {
  profile: EvalProfile
  deadline: number
  quiescenceDepth: number
  nodes: number
  aborted: boolean
}

/**
 * Score of a finished game for the side to move at that node — negamax scores
 * are always relative to whoever is on move, never to the root player. Faster
 * wins and slower losses score better.
 */
const terminalScore = (state: EngineState, ply: number): number => {
  if (state.status.kind === 'win') {
    return state.status.winner === state.currentPlayer ? WIN_SCORE - ply : -WIN_SCORE + ply
  }
  return 0
}

/** Capture-only extension, so the search does not stop mid-exchange. */
function quiesce(
  state: EngineState,
  alpha: number,
  beta: number,
  depth: number,
  ply: number,
  ctx: Context,
): number {
  ctx.nodes++
  if (state.status.kind !== 'playing') return terminalScore(state, ply)

  const resolved = resolveCalls(state)
  // A call can end the game (it may leave one piece each, or none).
  if (resolved.status.kind !== 'playing') return terminalScore(resolved, ply)
  const standPat = evaluate(resolved, resolved.currentPlayer, ctx.profile)
  if (depth <= 0) return standPat
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  const captures = generateActions(resolved).filter((action) => {
    if (action.type !== 'move') return false
    const distance =
      Math.abs(action.to.row - action.from.row) + Math.abs(action.to.col - action.from.col)
    return distance >= 2 || resolved.board[action.to.row]?.[action.to.col] != null
  })
  if (captures.length === 0) return standPat

  for (const action of sortActions(resolved, captures)) {
    if (performance.now() > ctx.deadline) {
      ctx.aborted = true
      break
    }
    const child = applyAction(resolved, action)
    const sameSide = child.currentPlayer === resolved.currentPlayer
    const score = sameSide
      ? quiesce(child, alpha, beta, depth - 1, ply + 1, ctx)
      : -quiesce(child, -beta, -alpha, depth - 1, ply + 1, ctx)
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

function negamax(
  state: EngineState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: Context,
): number {
  ctx.nodes++
  if (state.status.kind !== 'playing') return terminalScore(state, ply)
  if (performance.now() > ctx.deadline) {
    ctx.aborted = true
    return evaluate(state, state.currentPlayer, ctx.profile)
  }

  const resolved = resolveCalls(state)
  // A call can end the game; without this check the empty action list below
  // would be misread as "stuck", i.e. a loss for the side to move.
  if (resolved.status.kind !== 'playing') return terminalScore(resolved, ply)

  if (depth <= 0) {
    return ctx.quiescenceDepth > 0
      ? quiesce(resolved, alpha, beta, ctx.quiescenceDepth, ply, ctx)
      : evaluate(resolved, resolved.currentPlayer, ctx.profile)
  }

  const actions = generateActions(resolved)
  if (actions.length === 0) {
    // No legal action at all: stuck, which under these rules means the position
    // is lost for the side to move in every practical sense.
    return -WIN_SCORE + ply
  }

  let best = -Infinity
  for (const action of sortActions(resolved, actions)) {
    const child = applyAction(resolved, action)
    const sameSide = child.currentPlayer === resolved.currentPlayer
    const score = sameSide
      ? negamax(child, depth - 1, alpha, beta, ply + 1, ctx)
      : -negamax(child, depth - 1, -beta, -alpha, ply + 1, ctx)

    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
    if (ctx.aborted) break
  }
  return best
}

/**
 * Root search. Iterative deepening so a time cut-off still returns a complete,
 * usable result from the last finished depth.
 */
export function chooseAction(state: EngineState, options: SearchOptions): SearchResult | null {
  if (state.status.kind !== 'playing') return null
  const random = options.random ?? Math.random

  // A call is decided before anything else and surfaced as its own action, so
  // the move list shows it the way a human's call would appear.
  if (canCall(state)) {
    return {
      action: { type: 'call', pieceId: bestCallTarget(state) },
      score: 0,
      nodes: 0,
      depthReached: 0,
      blundered: false,
    }
  }

  const actions = generateActions(state)
  if (actions.length === 0) return null

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
    nodes: 0,
    aborted: false,
  }

  let bestAction = actions[0]
  let bestScore = -Infinity
  let depthReached = 0
  let ordered = sortActions(state, actions)

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
        ? negamax(child, depth - 1, alpha, beta, 1, ctx)
        : -negamax(child, depth - 1, -beta, -alpha, 1, ctx)

      // Jitter is applied at the root only: it makes weaker tiers pick
      // plausible-but-not-best moves without corrupting the tree below.
      const score = options.noise > 0 ? raw + (random() - 0.5) * 2 * options.noise : raw

      scored.push({ action, score })
      if (score > iterationScore) {
        iterationScore = score
        iterationBest = action
      }
      if (!exactRoot && raw > alpha) alpha = raw
      if (ctx.aborted) break
    }

    if (!ctx.aborted || depth === 1) {
      bestAction = iterationBest
      bestScore = iterationScore
      depthReached = depth
      // Feed this depth's ordering into the next one.
      lastScored = scored.sort((a, b) => b.score - a.score)
      ordered = lastScored.map((entry) => entry.action)
    }
    if (ctx.aborted) break
    if (Math.abs(bestScore) >= WIN_SCORE - 100) break
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
