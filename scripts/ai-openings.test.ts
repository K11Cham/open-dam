/**
 * Measure every yin/yang first move by letting Seriñ play itself from it.
 * This is where the numbers in `src/ai/openings.ts` come from.
 *
 *   SIZE=7 GAMES=8 npm run openings
 *
 * Each opening is played GAMES times. A little noise in the first plies makes
 * the games differ; after that both sides play their best. Games are needed
 * because the search scores every opening about even: their consequences
 * show up far past its horizon. Each line printed is: size, square, wins,
 * losses, draws for player one, then (wins - losses) / games.
 * SHARD=i SHARDS=n splits the openings so several processes can share a board,
 * and OFFSET starts from other seeds so a second round adds new games.
 */
import { test } from 'vitest'
import { DIFFICULTIES } from '../src/ai/difficulty'
import { chooseAction } from '../src/ai/search'
import type { SearchOptions } from '../src/ai/search'
import { applyAction, createInitialState, legalActions } from '../src/game/engine'
import { coordToNotation } from '../src/game/notation'
import type { BoardSize, EngineState } from '../src/game/types'

const out = (text: string) => process.stdout.write(`${text}\n`)

test('measure the openings', () => {
  const size = Number(process.env.SIZE ?? 5) as BoardSize
  const games = Number(process.env.GAMES ?? 6)
  const budget = Number(process.env.BUDGET ?? 250)
  const shard = Number(process.env.SHARD ?? 0)
  const shards = Number(process.env.SHARDS ?? 1)
  // A different OFFSET plays different games, so rounds can be pooled.
  const offset = Number(process.env.OFFSET ?? 0)
  const serin = DIFFICULTIES.serin
  const options = (noise: number, random: () => number): SearchOptions => ({
    depth: serin.depth,
    profile: serin.profile,
    timeBudgetMs: budget,
    quiescenceDepth: serin.quiescenceDepth,
    noise,
    blunderChance: 0,
    callAware: true,
    forcingExtensions: serin.forcingExtensions,
    random,
  })

  const start = createInitialState({ boardSize: size })
  const openings = legalActions(start).filter((_, i) => i % shards === shard)
  for (const opening of openings) {
    if (opening.type !== 'move') continue
    const name = coordToNotation(opening.from.row, opening.from.col, size)
    const after = applyAction(start, opening).state
    let wins = 0
    let losses = 0
    let plies = 0
    for (let game = 0; game < games; game++) {
      let seed = (game + offset) * 7919 + 13
      const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return seed / 2147483648
      }
      let state: EngineState = after
      let ply = 1
      for (; ply < 400 && state.status.kind === 'playing'; ply++) {
        const result = chooseAction(state, options(ply < 8 ? 20 : 0, random))
        if (!result) break
        state = applyAction(state, result.action).state
      }
      plies += ply
      if (state.status.kind === 'win') {
        if (state.status.winner === 'player1') wins++
        else losses++
      }
    }
    const draws = games - wins - losses
    out(
      `OPENING ${size} ${name} ${wins} ${losses} ${draws} ${((wins - losses) / games).toFixed(2)} avg-plies ${Math.round(plies / games)}`,
    )
  }
})
