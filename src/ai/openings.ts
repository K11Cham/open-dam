import { legalActions } from '../game/engine'
import { coordToNotation } from '../game/notation'
import type { BoardSize, EngineAction, EngineState } from '../game/types'

/**
 * Opening book for the yin/yang first move.
 *
 * On an odd board player one may send any piece to the empty centre. The board
 * is packed, so whichever square is emptied decides player two's reply, which
 * is usually forced. The consequences show up dozens of plies later, far past
 * what the search can see on move one, so the engine cannot rank these moves
 * by itself: every opening scores about even at the root.
 *
 * The scores below were measured instead: Seriñ played itself from every
 * opening (`npm run openings`), and each score is (wins - losses) / games for
 * player one, from -1 to 1. Squares are named by where the piece came from.
 * Measured 2026-10-28 over 16 games per opening on 5×5, 12 on 7×7 and 8 on
 * 9×9. The 5×5 results are clear-cut; on 9×9 most openings sit within the
 * noise of each other, which the weighted pick tolerates. Re-measure when the
 * rules or the evaluation change.
 */
export const OPENING_BOOK: Partial<Record<BoardSize, Record<string, number>>> = {
  // Emptying a1 hands over a king at once; emptying b2 lets a piece settle
  // where a2 and c2 block each other's jumps. Both lost every game.
  5: { a2: 1, e2: 1, e3: 0.88, d2: 0.81, d3: 0.38, b1: 0.25, c2: -0.06, a1: -1, b2: -1 },
  7: {
    a3: 0.92,
    b3: 0.75,
    c3: 0.67,
    d3: 0.5,
    a2: 0.33,
    e3: 0.25,
    c2: 0.17,
    e4: 0.17,
    g3: 0,
    g4: -0.08,
    b2: -0.25,
    f3: -0.25,
    f4: -0.5,
  },
  9: {
    g5: 0.38,
    d4: 0.25,
    e4: 0.25,
    b3: 0.12,
    b4: 0.12,
    c4: 0.12,
    h5: 0.12,
    f4: 0,
    i4: 0,
    i5: 0,
    c3: -0.12,
    h4: -0.12,
    a4: -0.25,
    a3: -0.38,
    f5: -0.38,
    g4: -0.38,
    d3: -0.75,
  },
}

/**
 * Pick a first move from the book, or return null to let the search decide.
 *
 * The choice is weighted, not greedy: an opening scoring `s` gets weight
 * e^(s / temperature). A low temperature makes the stronger openings very
 * likely without making the computer predictable; a high one is close to
 * picking at random, the way a beginner does.
 */
export function pickOpening(state: EngineState, temperature: number, random: () => number): EngineAction | null {
  if (!state.isFirstMove || state.currentPlayer !== 'player1' || state.settings.boardType !== 'yinyang') return null
  const size = state.settings.boardSize
  const book = OPENING_BOOK[size]
  if (!book) return null

  const centre = Math.floor(size / 2)
  const candidates = legalActions(state).flatMap((action) => {
    if (action.type !== 'move' || action.to.row !== centre || action.to.col !== centre) return []
    const score = book[coordToNotation(action.from.row, action.from.col, size)]
    return score === undefined ? [] : [{ action, weight: Math.exp(score / Math.max(temperature, 0.01)) }]
  })
  if (candidates.length === 0) return null

  const total = candidates.reduce((sum, c) => sum + c.weight, 0)
  let roll = random() * total
  for (const c of candidates) {
    roll -= c.weight
    if (roll <= 0) return c.action
  }
  return candidates[candidates.length - 1].action
}
