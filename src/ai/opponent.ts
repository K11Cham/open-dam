import { opponentOf } from '../game/board'
import type { EngineState, PlayerId } from '../game/types'
import type { OfferDecision } from '../hooks/useMatchOffers'
import type { Difficulty } from './difficulty'
import { evaluate } from './evaluate'

/**
 * Non-move decisions: what the AI does when asked for an undo or a draw.
 *
 * This replaces the auto-accept placeholder. The decision is priced, not
 * guessed: the AI evaluates the position it is in now against the position an
 * undo would put it back into, and compares the swing against its tier's
 * tolerance. A Master hands back almost nothing; a Novice hands back anything.
 */

export interface UndoContext {
  difficulty: Difficulty
  aiSide: PlayerId
  current: EngineState
  /** Where the undo would rewind to. `null` means there is nothing to undo. */
  target: EngineState | null
}

export function decideUndoRequest({
  difficulty,
  aiSide,
  current,
  target,
}: UndoContext): OfferDecision {
  if (!target) return 'decline'
  if (current.moves.length <= difficulty.undo.graceUntilPly) return 'accept'
  if (difficulty.undo.maxSwing === Infinity) return 'accept'

  const now = evaluate(current, aiSide, difficulty.profile)
  const before = evaluate(target, aiSide, difficulty.profile)
  const swing = now - before

  // Positive swing means the AI is better off now than it would be after the
  // rollback — that is exactly the initiative an undo would cost it.
  if (swing > difficulty.undo.maxSwing) return 'decline'
  return 'accept'
}

export function decideDrawOffer(
  difficulty: Difficulty,
  aiSide: PlayerId,
  state: EngineState,
): OfferDecision {
  const score = evaluate(state, aiSide, difficulty.profile)
  // Accept when the position is level or worse for the AI, within tolerance.
  if (score <= difficulty.drawAcceptWithin) return 'accept'
  return 'decline'
}

/** Human-readable side label for the AI's bar. */
export const aiSideLabel = (aiSide: PlayerId): string =>
  aiSide === 'player1' ? 'Red' : 'Blue'

export const humanSideOf = (aiSide: PlayerId): PlayerId => opponentOf(aiSide)

/** Simulated thinking time, so a one-ply reply does not land instantly. */
export const thinkingDelay = (difficulty: Difficulty, random: () => number): number => {
  const [min, max] = difficulty.thinkMs
  return min + random() * (max - min)
}
