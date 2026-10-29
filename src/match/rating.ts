import type { PlayerId, RuleSettings } from '../game/types'
import { isOver } from './reducer'
import type { MatchState } from './types'

/**
 * Ratings for online play: plain Elo, kept separately per pool so a blitz
 * rating on 5×5 says nothing about a slow game on 9×9. This is pure
 * arithmetic; the server decides when a game counts and stores the numbers.
 */

export interface Rating {
  rating: number
  /** Rated games played in this pool. */
  games: number
}

export const INITIAL_RATING = 1500

/** A new player's rating moves fast until it has settled. */
const PROVISIONAL_GAMES = 20
const K_PROVISIONAL = 40
const K_SETTLED = 20

export const newRating = (): Rating => ({ rating: INITIAL_RATING, games: 0 })

/** Games in different pools are rated separately: same board size and time control. */
export const ratingPool = (settings: RuleSettings): string =>
  `${settings.boardSize}x${settings.boardSize}:${settings.timeControl?.label ?? 'untimed'}`

/** The chance `a` scores against `b`, between 0 and 1. */
export const expectedScore = (a: number, b: number): number => 1 / (1 + 10 ** ((b - a) / 400))

const kFactor = (r: Rating) => (r.games < PROVISIONAL_GAMES ? K_PROVISIONAL : K_SETTLED)

/** New ratings after one game. `scoreA` is 1 for a win by `a`, 0.5 for a draw, 0 for a loss. */
export const rateGame = (a: Rating, b: Rating, scoreA: number): [Rating, Rating] => {
  const expectedA = expectedScore(a.rating, b.rating)
  return [
    { rating: Math.round(a.rating + kFactor(a) * (scoreA - expectedA)), games: a.games + 1 },
    { rating: Math.round(b.rating + kFactor(b) * (1 - scoreA - (1 - expectedA))), games: b.games + 1 },
  ]
}

/**
 * Player 1's score in a finished game, or null when it should not be rated:
 * still playing, or one side never made a move (a game abandoned or flagged
 * before it began says nothing about strength).
 */
export const ratedScore = (state: MatchState): number | null => {
  if (!isOver(state)) return null
  // Calls, resignations and flags are in the move list too; only board moves count here.
  const moved = (player: PlayerId) =>
    state.position.moves.some((m) => m.player === player && (m.kind === 'move' || m.kind === 'capture' || m.kind === 'chain'))
  if (!moved('player1') || !moved('player2')) return null
  const { status } = state.position
  if (status.kind === 'draw') return 0.5
  return status.kind === 'win' && status.winner === 'player1' ? 1 : 0
}
