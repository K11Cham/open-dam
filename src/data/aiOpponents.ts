import { DIFFICULTIES, DIFFICULTY_IDS } from '../ai/difficulty'
import type { Difficulty, DifficultyId } from '../ai/difficulty'
import { LEADERBOARDS } from './leaderboards'
import { RANKED_POOLS } from './ranked'

/**
 * Pairs each AI tier against the existing mock elo bands so a vs-computer game
 * reads as sitting somewhere on the same (fictional) ladder as ranked play.
 *
 * Still mock data: no rating is computed, nothing is recorded, and beating
 * Master does not move a number anywhere.
 */

export interface AIOpponent {
  difficulty: Difficulty
  /** Nearest mock ranked pool by average rating. */
  poolLabel: string
  /** Where this rating would land on a sample leaderboard. */
  bandLabel: string
}

const nearestPool = (elo: number): string => {
  let best = RANKED_POOLS[0]
  for (const pool of RANKED_POOLS) {
    if (Math.abs(pool.averageRating - elo) < Math.abs(best.averageRating - elo)) best = pool
  }
  return `${best.modeLabel} ${best.boardSize}×${best.boardSize} ${best.timeControlLabel}`
}

const bandFor = (elo: number): string => {
  const board = LEADERBOARDS[0]
  const above = board.entries.filter((entry) => entry.rating > elo).length
  if (above === 0) return `above the top of the ${board.modeLabel} ${board.boardSize}×${board.boardSize} board`
  if (above >= board.entries.length) {
    return `below the ${board.modeLabel} ${board.boardSize}×${board.boardSize} top ${board.entries.length}`
  }
  return `around rank ${above + 1} on ${board.modeLabel} ${board.boardSize}×${board.boardSize}`
}

export const AI_OPPONENTS: AIOpponent[] = DIFFICULTY_IDS.map((id: DifficultyId) => {
  const difficulty = DIFFICULTIES[id]
  return {
    difficulty,
    poolLabel: nearestPool(difficulty.elo),
    bandLabel: bandFor(difficulty.elo),
  }
})
