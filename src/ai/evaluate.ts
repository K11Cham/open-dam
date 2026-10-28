import { ORTHOGONAL, cloneBoard, forwardDir, inBounds, opponentOf, piecesOf, promotionRow } from '../game/board'
import { getCaptures, getSimpleMoves } from '../game/moves'
import type { Board, EngineState, PlayerId, RuleSettings } from '../game/types'

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
  /**
   * Weight of lone-king technique: hunting an opponent who is down to one
   * king (take away its safe squares, drive it to a corner) and, when you are
   * the one with a lone king, keeping your escape squares. Zero disables it.
   */
  endgameTechnique: number
}

export const PIECE_VALUE = 100

/** Kings gain value with board size, because their reach does. */
export const kingValue = (boardSize: number): number => PIECE_VALUE * (2.1 + 0.18 * (boardSize - 5))

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

/**
 * Whether `attacker` could capture the piece standing on (row, col) right now.
 * Looks outward from the target instead of generating every capture, which
 * matters because the lone-king term asks this for every square a king can
 * reach.
 */
export const isCapturable = (board: Board, attacker: PlayerId, row: number, col: number): boolean => {
  for (const { dr, dc } of ORTHOGONAL) {
    // The attacker travels in (dr, dc): it comes from behind the target and
    // lands on the square beyond it, which must be empty.
    const landRow = row + dr
    const landCol = col + dc
    if (!inBounds(board, landRow, landCol) || board[landRow][landCol] !== null) continue

    let r = row - dr
    let c = col - dc
    let adjacent = true
    while (inBounds(board, r, c)) {
      const piece = board[r][c]
      if (piece) {
        if (piece.player === attacker) {
          if (piece.isKing) return true
          // A man only captures from the next square, forward or sideways.
          if (adjacent && (dr === 0 || dr === forwardDir(attacker))) return true
        }
        break
      }
      adjacent = false
      r -= dr
      c -= dc
    }
  }
  return false
}

/**
 * What the side to move loses by not capturing at all: the opponent calls the
 * piece that could have captured (the most valuable one under `choose-one`,
 * all of them under `all`). Captures are optional, but this is why they are not
 * free to ignore, and why the quiescence search cannot assume "doing nothing"
 * is safe when a capture is on the board.
 */
export const declineCost = (state: EngineState): number => {
  const captures = getCaptures(state.board, state.currentPlayer)
  if (captures.length === 0) return 0
  const size = state.settings.boardSize
  const seen = new Set<string>()
  let total = 0
  let highest = 0
  for (const capture of captures) {
    if (seen.has(capture.pieceId)) continue
    seen.add(capture.pieceId)
    const piece = state.board[capture.from.row][capture.from.col]
    const value = piece?.isKing ? kingValue(size) : PIECE_VALUE
    total += value
    highest = Math.max(highest, value)
  }
  // Losing the last piece to the call loses the game, whatever it was worth.
  const removed = state.settings.call.scope === 'all' ? seen.size : 1
  if (piecesOf(state.board, state.currentPlayer).length <= removed) return WIN_SCORE
  return state.settings.call.scope === 'all' ? total : highest
}

/**
 * How well `hunter` is doing against an opponent reduced to a single king.
 *
 * One king cannot be cornered by force of numbers alone: it slides the whole
 * board and takes anything that stands alone on its line. The technique is to
 * remove its safe squares. A square is unsafe when, after the king stops
 * there, one of the hunter's pieces could capture it. When none are left, the
 * king must step into a capture (or capture into one), so the game is won.
 * The usual finish is the lone king in a corner with hunting kings on the two
 * edges that meet there, which this term reaches naturally because corners
 * have the fewest lines to escape along.
 *
 * The score is never negative: it only adds credit for progress, measured
 * against a king with every square still open. A version that subtracted for
 * open squares made reducing the opponent to one piece look worse than
 * leaving them two, and the engine stopped taking winning captures.
 */
const loneKingPressure = (state: EngineState, hunter: PlayerId): number => {
  const prey = opponentOf(hunter)
  const preyPieces = piecesOf(state.board, prey)
  if (preyPieces.length !== 1) return 0
  const { piece, at } = preyPieces[0]
  const size = state.settings.boardSize
  const board = cloneBoard(state.board)

  // A lone king that can capture must: declining gets its last piece called.
  // So when a capture is on offer, its only escapes are capture landings that
  // the hunter cannot take back. Offering a piece so that every landing is
  // covered is the classic finish (the "kill or be called" sacrifice).
  const captures = getCaptures(board, prey)
  let safeLandings = 0
  for (const capture of captures) {
    const taken = board[capture.captured.row][capture.captured.col]
    board[capture.captured.row][capture.captured.col] = null
    board[at.row][at.col] = null
    board[capture.to.row][capture.to.col] = piece
    // It may keep capturing from there, which is an escape in itself.
    const continues = getCaptures(board, prey).some((c) => c.from.row === capture.to.row && c.from.col === capture.to.col)
    if (continues || !isCapturable(board, hunter, capture.to.row, capture.to.col)) safeLandings++
    board[capture.to.row][capture.to.col] = null
    board[at.row][at.col] = piece
    board[capture.captured.row][capture.captured.col] = taken
  }

  let safe = 0
  if (captures.length === 0) {
    board[at.row][at.col] = null
    for (const { dr, dc } of piece.isKing ? ORTHOGONAL : []) {
      let r = at.row + dr
      let c = at.col + dc
      while (inBounds(board, r, c) && board[r][c] === null) {
        board[r][c] = piece
        if (!isCapturable(board, hunter, r, c)) safe++
        board[r][c] = null
        r += dr
        c += dc
      }
    }
    board[at.row][at.col] = piece
  } else {
    safe = safeLandings
  }

  // A king sees at most 2(size - 1) squares; that is "no progress".
  const open = 2 * (size - 1)
  const fromEdge = Math.min(at.row, size - 1 - at.row) + Math.min(at.col, size - 1 - at.col)
  const farthest = 2 * Math.floor((size - 1) / 2)
  let score = (open - Math.min(open, safe)) * 18 + (farthest - fromEdge) * 8
  if (safe === 0) score += state.currentPlayer === prey ? 600 : 260
  return score
}

/**
 * Men against a lone king. Men cannot hunt (they never move backward), so the
 * job is to crown one, after which the king-and-piece technique takes over.
 * The lone king guards the promotion row: it captures a man that arrives on
 * it whenever the square beyond is empty. The way through is a square it
 * cannot take, most often a corner, where there is no square beyond. This
 * rewards each man's progress and, above all, a crowning move that is safe
 * right now.
 */
const promotionPush = (state: EngineState, hunter: PlayerId): number => {
  const prey = opponentOf(hunter)
  const size = state.settings.boardSize
  const goal = promotionRow(hunter, size)
  const board = cloneBoard(state.board)
  let score = 0
  let safeCrowning = false
  for (const { piece, at } of piecesOf(state.board, hunter)) {
    if (piece.isKing) continue
    const progress = 1 - Math.abs(at.row - goal) / Math.max(1, size - 1)
    score += progress * progress * 60
    for (const { dr, dc } of [
      { dr: forwardDir(hunter), dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ]) {
      const r = at.row + dr
      const c = at.col + dc
      if (r !== goal || !inBounds(board, r, c) || board[r][c] !== null) continue
      board[at.row][at.col] = null
      board[r][c] = piece
      if (!isCapturable(board, prey, r, c)) safeCrowning = true
      board[r][c] = null
      board[at.row][at.col] = piece
    }
  }
  if (safeCrowning) score += state.currentPlayer === hunter ? 160 : 70
  return score
}

export function evaluate(state: EngineState, perspective: PlayerId, profile: EvalProfile): number {
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
    score += (me.advancement - them.advancement) * profile.advancement * advancementScale(settings) * 10
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
  if (profile.exposure !== 0 && state.chain.active && settings.call.abandonedChainCallable && state.chain.at) {
    const remaining = getCaptures(state.board, state.currentPlayer).filter(
      (capture) => capture.from.row === state.chain.at!.row && capture.from.col === state.chain.at!.col,
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
      // A king plus anything against a lone king is a technical win (trap it,
      // or sacrifice the extra piece so it must capture into a recapture), not
      // a near-draw, for an engine that knows the technique below. Men alone
      // cannot do it: they never move backward, and the lone king guards the
      // whole promotion row.
      const hunterKings = me.pieces > them.pieces ? me.kings : them.kings
      const huntable = profile.endgameTechnique > 0 && Math.min(me.pieces, them.pieces) === 1 && hunterKings >= 1
      const damping = edge >= 2 || huntable ? 0.85 : total <= 2 ? 0.15 : 0.5
      score *= damping
    }
    if (me.pieces === 1 && them.pieces === 1 && me.captures + them.captures === 0) return 0
  }

  if (profile.endgameTechnique !== 0) {
    // Only a side with a king can carry out the hunt; with men alone the
    // pressure is mostly illusory, so it counts for little.
    // With a king, hunt; a man that can still crown is worth pushing too,
    // because two kings finish the job far faster than king and man.
    const technique = (hunter: PlayerId, kings: number, men: number) =>
      kings > 0
        ? loneKingPressure(state, hunter) + (men > 0 ? promotionPush(state, hunter) * 0.5 : 0)
        : promotionPush(state, hunter)
    if (them.pieces === 1 && me.pieces >= 2) {
      score += technique(perspective, me.kings, me.pieces - me.kings) * profile.endgameTechnique
    }
    if (me.pieces === 1 && them.pieces >= 2) {
      score -= technique(foe, them.kings, them.pieces - them.kings) * profile.endgameTechnique
    }
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
