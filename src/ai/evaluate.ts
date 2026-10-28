import { opponentOf, piecesOf, promotionRow } from '../game/board'
import { getCaptures, getSimpleMoves } from '../game/moves'
import type { EngineState, PlayerId, RuleSettings } from '../game/types'

/**
 * Evaluation for dam, written for *this* rule set rather than adapted from
 * draughts theory.
 *
 * The differences that matter:
 *
 *  - Captures are optional, so a threat is not the same as a forced win of
 *    material — but declining one is punishable by a call, which turns "I have
 *    a capture available against you" into a real positional asset.
 *  - Pieces move forward, left and right, never backward, so advancement is
 *    one-way and permanent. Tempo is worth more here than in a game where you
 *    can retreat.
 *  - Kings slide the whole board and choose their landing square, so a king is
 *    worth proportionally more on a bigger board.
 *  - Your own back row is your opponent's promotion row. Holding it is a
 *    blocking asset, not the passive habit it is in draughts.
 *  - A player down to one piece gets it crowned for free, and one-piece-each
 *    with nothing available is a tie. Material advantages therefore collapse
 *    toward a draw at the very bottom of the board, which the evaluation has to
 *    know or it will trade into a drawn ending while "winning".
 *
 * Scores are in centipieces, always from `perspective`'s point of view.
 */

export interface EvalProfile {
  name: string
  /** Weight multipliers. Zero disables the term entirely. */
  mobility: number
  advancement: number
  backRow: number
  exposure: number
  threats: number
  kingActivity: number
  /** Recognise that tiny material edges do not convert near the auto-king rule. */
  endgameDamping: boolean
  /** Steer away from the no-capture and repetition draw counters when ahead. */
  drawClockAwareness: boolean
}

export const PIECE_VALUE = 100

/** Kings gain value with board size, because their reach does. */
export const kingValue = (boardSize: number): number =>
  PIECE_VALUE * (2.1 + 0.18 * (boardSize - 5))

export const WIN_SCORE = 1_000_000

/**
 * How much a piece's march up the board is worth, given the promotion policy in
 * force. Under `end-turn-on-promotion`, crowning costs you the remainder of your
 * turn, so pushing a piece to the brink is worth distinctly less than it is
 * under `promote-and-continue`, where a crowning mid-chain is a tempo *gain*.
 */
const advancementScale = (settings: RuleSettings): number => {
  switch (settings.promotionPolicy) {
    case 'promote-and-continue':
      return 1.25
    case 'promote-after-chain':
      return 1.0
    case 'end-turn-on-promotion':
      return 0.7
    default:
      return 1.0
  }
}

/**
 * What it costs to be caught having declined a capture. Under `all` every piece
 * that could have captured comes off, so the exposure is the sum; under
 * `choose-one` the caller takes the best single piece, so it is the maximum.
 */
const exposureCost = (state: EngineState, offendingSide: PlayerId): number => {
  if (state.offenders.length === 0) return 0
  const size = state.settings.boardSize
  const values = state.offenders.map((offender) => {
    const piece = state.board[offender.at.row]?.[offender.at.col]
    if (!piece || piece.player !== offendingSide) return 0
    return piece.isKing ? kingValue(size) : PIECE_VALUE
  })
  if (state.settings.call.scope === 'all') {
    return values.reduce((sum, value) => sum + value, 0)
  }
  return Math.max(0, ...values)
}

interface Side {
  pieces: number
  kings: number
  material: number
  advancement: number
  backRow: number
  mobility: number
  captures: number
  kingReach: number
}

const measure = (state: EngineState, player: PlayerId): Side => {
  const size = state.settings.boardSize
  const ownBackRow = promotionRow(opponentOf(player), size)
  const goalRow = promotionRow(player, size)
  const kv = kingValue(size)

  let pieces = 0
  let kings = 0
  let material = 0
  let advancement = 0
  let backRow = 0
  let kingReach = 0

  for (const { piece, at } of piecesOf(state.board, player)) {
    pieces++
    if (piece.isKing) {
      kings++
      material += kv
      // A king on an open line is worth more than one boxed in by its own army.
      kingReach += openLines(state, at.row, at.col)
    } else {
      material += PIECE_VALUE
      // 0 at the home row, 1 on the brink of promotion.
      const distance = Math.abs(at.row - goalRow)
      advancement += 1 - distance / Math.max(1, size - 1)
    }
    if (at.row === ownBackRow) backRow++
  }

  return {
    pieces,
    kings,
    material,
    advancement,
    backRow,
    mobility: getSimpleMoves(state.board, player).length,
    captures: getCaptures(state.board, player).length,
    kingReach,
  }
}

/** Empty squares a king can see in the four orthogonal directions. */
const openLines = (state: EngineState, row: number, col: number): number => {
  const size = state.settings.boardSize
  let total = 0
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    let r = row + dr
    let c = col + dc
    while (r >= 0 && r < size && c >= 0 && c < size && state.board[r][c] === null) {
      total++
      r += dr
      c += dc
    }
  }
  return total
}

export function evaluate(
  state: EngineState,
  perspective: PlayerId,
  profile: EvalProfile,
): number {
  if (state.status.kind === 'win') {
    return state.status.winner === perspective ? WIN_SCORE : -WIN_SCORE
  }
  if (state.status.kind === 'draw') return 0

  const settings = state.settings
  const foe = opponentOf(perspective)
  const me = measure(state, perspective)
  const them = measure(state, foe)

  let score = me.material - them.material

  if (profile.mobility !== 0) {
    score += (me.mobility - them.mobility) * profile.mobility
  }

  if (profile.advancement !== 0) {
    score +=
      (me.advancement - them.advancement) * profile.advancement * advancementScale(settings) * 10
  }

  if (profile.backRow !== 0) {
    // Holding your own back row denies the opponent their promotion squares.
    score += (me.backRow - them.backRow) * profile.backRow
  }

  if (profile.kingActivity !== 0) {
    score += (me.kingReach - them.kingReach) * profile.kingActivity
  }

  if (profile.threats !== 0) {
    // Optional captures: a threat is leverage, not a guaranteed win of material.
    score += (me.captures - them.captures) * profile.threats
  }

  if (profile.exposure !== 0) {
    // `offenders` always belongs to whoever just moved — the side the player to
    // move may call on.
    const offendingSide = opponentOf(state.currentPlayer)
    const cost = exposureCost(state, offendingSide)
    if (cost > 0) {
      const signed = offendingSide === perspective ? -cost : cost
      score += signed * profile.exposure
    }
  }

  // Walking away from a chain is legal but callable, so a chain still holding
  // continuations is a small liability for the side that has to decide.
  if (
    profile.exposure !== 0 &&
    state.chain.active &&
    settings.call.abandonedChainCallable &&
    state.chain.at
  ) {
    const remaining = getCaptures(state.board, state.currentPlayer).filter(
      (capture) =>
        capture.from.row === state.chain.at!.row && capture.from.col === state.chain.at!.col,
    ).length
    if (remaining > 0) {
      const liability = 14 * profile.exposure
      score += state.currentPlayer === perspective ? -liability : liability
    }
  }

  if (profile.endgameDamping) {
    // Auto-king plus the one-piece-each tie rule make the bottom of the board
    // far drawer than raw material suggests — but only when the edge is thin.
    // Winning here means total elimination, not "being ahead", so a two-piece
    // lead with three pieces on the board is still convertible while a
    // one-piece lead is a tie waiting to happen. Damping the two cases equally
    // makes the engine indifferent between trading into a win and trading into
    // a draw, which is exactly the mistake it was making.
    const total = me.pieces + them.pieces
    if (total <= 4) {
      const edge = Math.abs(me.pieces - them.pieces)
      const damping = edge >= 2 ? 0.85 : total <= 2 ? 0.15 : 0.5
      score *= damping
    }
    if (me.pieces === 1 && them.pieces === 1 && me.captures + them.captures === 0) return 0
  }

  if (profile.drawClockAwareness) {
    // Being ahead while the no-capture counter runs down is worth less than
    // being ahead with the counter reset — the draw is closing in.
    const limit = settings.draw.pliesWithoutCapture
    if (limit !== null && limit > 0) {
      const progress = Math.min(1, state.pliesSinceCapture / limit)
      score *= 1 - 0.55 * progress * progress
    }
    if (settings.draw.threefoldRepetition) {
      const highest = Math.max(0, ...Object.values(state.positionCounts))
      if (highest >= 2) score *= 0.82
    }
  }

  // Small side-to-move bonus: with no forced captures, having the move is a
  // genuine asset rather than a formality.
  score += state.currentPlayer === perspective ? 6 : -6

  return score
}
