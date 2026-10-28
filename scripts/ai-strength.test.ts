/**
 * Slow AI strength check: tiers play each other and the results are printed.
 * Not part of `npm test` (it takes minutes). Run with `npm run check:ai`,
 * which uses vitest.ai.config.ts.
 *
 * Results are reported rather than asserted tightly: draws are common under
 * these rules (the one-piece-each tie), so a stronger tier should score at
 * least as well as a weaker one, and should win some games outright.
 */
import { expect, test } from 'vitest'
import { applyAction, createInitialState } from '../src/game/engine'
import { countPieces } from '../src/game/board'
import { DIFFICULTIES } from '../src/ai/difficulty'
import type { DifficultyId } from '../src/ai/difficulty'
import { chooseAction } from '../src/ai/search'
import type { EngineState, PlayerId } from '../src/game/types'

const BUDGET_CAP_MS = 400
const PLY_CAP = 200

function play(red: DifficultyId, blue: DifficultyId, size: 5 | 7, seed: number): EngineState {
  let state = createInitialState({ boardSize: size })
  let value = seed
  const random = () => {
    value = (value * 1103515245 + 12345) % 2147483648
    return value / 2147483648
  }
  for (let ply = 0; ply < PLY_CAP && state.status.kind === 'playing'; ply++) {
    const tier = DIFFICULTIES[state.currentPlayer === 'player1' ? red : blue]
    const result = chooseAction(state, {
      depth: tier.depth,
      profile: tier.profile,
      timeBudgetMs: Math.min(tier.timeBudgetMs, BUDGET_CAP_MS),
      quiescenceDepth: tier.quiescenceDepth,
      noise: tier.noise,
      blunderChance: tier.blunderChance,
      blunderMargin: tier.blunderMargin,
      random,
    })
    if (!result) break
    const next = applyAction(state, result.action)
    if (next.error) throw new Error(`${tier.name} chose an illegal action: ${next.error}`)
    state = next.state
  }
  return state
}

function match(strong: DifficultyId, weak: DifficultyId, games: number) {
  let strongWins = 0
  let weakWins = 0
  let unfinished = 0
  for (let i = 0; i < games; i++) {
    const strongSide: PlayerId = i % 2 === 0 ? 'player1' : 'player2'
    const state = strongSide === 'player1' ? play(strong, weak, 5, i + 1) : play(weak, strong, 5, i + 1)
    if (state.status.kind === 'win') {
      if (state.status.winner === strongSide) strongWins++
      else weakWins++
    } else if (state.status.kind === 'playing') unfinished++
    const p1 = countPieces(state.board, 'player1')
    const p2 = countPieces(state.board, 'player2')
    console.log(`  game ${i + 1}: ${JSON.stringify(state.status)} pieces ${p1}/${p2}`)
  }
  console.log(`${strong} ${strongWins} – ${weakWins} ${weak} (${games - strongWins - weakWins - unfinished} draws, ${unfinished} unfinished)`)
  return { strongWins, weakWins }
}

test('stronger tiers outscore weaker ones', () => {
  const problems: string[] = []
  for (const [strong, weak] of [
    ['club', 'novice'],
    ['expert', 'club'],
    ['master', 'novice'],
    ['master', 'expert'],
  ] as Array<[DifficultyId, DifficultyId]>) {
    console.log(`
${strong} vs ${weak}`)
    const { strongWins, weakWins } = match(strong, weak, 6)
    if (strongWins < weakWins) problems.push(`${strong} was outscored by ${weak}`)
    if (strong === 'master' && strongWins === 0) problems.push('Master did not win a single game against Novice')
  }
  expect(problems).toEqual([])
}, 15 * 60_000)
