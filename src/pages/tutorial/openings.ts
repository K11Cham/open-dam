import { OPENING_BOOK } from '../../ai/openings'

/**
 * The opening puzzle reads its answers from the computer's opening book, so
 * the lesson and the computer agree, and re-measuring the book updates both.
 * Openings scoring within a quarter of the best (and above even) count as right.
 */
const book = OPENING_BOOK[5] ?? {}
const best = Math.max(...Object.values(book))

export const OPENING_ANSWERS: string[] = Object.entries(book)
  .filter(([, score]) => score > 0 && score >= best - 0.25)
  .sort(([, a], [, b]) => b - a)
  .map(([square]) => `${square}-c3`)

export const OPENING_HINT = 'Leave row 1 alone, and keep b2 filled. The computer won every game it opened from a2 or e2.'
