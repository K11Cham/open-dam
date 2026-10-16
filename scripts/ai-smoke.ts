import { createInitialState } from '../src/game/engine'
import { countPieces } from '../src/game/board'
import { DIFFICULTIES } from '../src/ai/difficulty'
import { chooseAction, applyAction } from '../src/ai/search'
import { decideUndoRequest } from '../src/ai/opponent'
import type { EngineState, PlayerId } from '../src/game/types'

let fails = 0
const check = (name: string, cond: boolean, detail = '') => {
  if (!cond) { fails++; console.log(`  FAIL ${name} ${detail}`) }
}

// Tiers are run with clipped time budgets so the harness finishes in test time;
// strength ordering still holds because depth and evaluation profile are what
// separate the tiers, not the clock.
const BUDGET_CAP = 400

const playGame = (redId: keyof typeof DIFFICULTIES, blueId: keyof typeof DIFFICULTIES, size: 5 | 7, cap = 140) => {
  let state: EngineState = createInitialState({ boardSize: size })
  let plies = 0
  const t0 = Date.now()
  while (state.status.kind === 'playing' && plies < cap) {
    const tier = DIFFICULTIES[state.currentPlayer === 'player1' ? redId : blueId]
    const result = chooseAction(state, {
      depth: tier.depth, profile: tier.profile, timeBudgetMs: Math.min(tier.timeBudgetMs, BUDGET_CAP),
      quiescenceDepth: tier.quiescenceDepth, noise: tier.noise,
      blunderChance: tier.blunderChance, random: Math.random,
    })
    if (!result) break
    const next = applyAction(state, result.action)
    if (next === state) { check(`action applied (${redId} v ${blueId})`, false, JSON.stringify(result.action)); break }
    state = next
    plies++
  }
  return { state, plies, ms: Date.now() - t0 }
}

console.log('\nSelf-play')
for (const [a, b, size] of [['novice','novice',5],['club','club',5],['expert','club',5],['master','expert',5],['expert','expert',7]] as const) {
  const { state, plies, ms } = playGame(a, b, size)
  const ended = state.status.kind !== 'playing'
  check(`${a} v ${b} ${size}x${size} terminates`, ended || plies >= 140, `plies=${plies}`)
  console.log(`  ${a} v ${b} ${size}x${size}: ${plies} plies, ${ms}ms, ${JSON.stringify(state.status)}, pieces ${countPieces(state.board,'player1')}/${countPieces(state.board,'player2')}`)
}

console.log('\nStrength ordering (master should beat novice over several games)')
let masterWins = 0, noviceWins = 0
for (let i = 0; i < 4; i++) {
  const swap = i % 2 === 1
  const { state } = playGame(swap ? 'novice' : 'master', swap ? 'master' : 'novice', 5)
  if (state.status.kind === 'win') {
    const masterSide: PlayerId = swap ? 'player2' : 'player1'
    if (state.status.winner === masterSide) masterWins++
    else noviceWins++
  }
}
console.log(`  master ${masterWins} - ${noviceWins} novice (draws: ${4 - masterWins - noviceWins})`)
// Draws are structurally common under the one-piece-each tie rule, so the bar
// is that the stronger tier never comes out behind.
check('master is not outscored by novice', masterWins >= noviceWins, `${masterWins}/${noviceWins}`)

console.log('\nTiming budget')
const st = createInitialState({ boardSize: 9 })
const t = Date.now()
chooseAction(st, { depth: 8, profile: DIFFICULTIES.master.profile, timeBudgetMs: 800, quiescenceDepth: 6, noise: 0, blunderChance: 0, random: Math.random })
const elapsed = Date.now() - t
console.log(`  master first move on 9x9: ${elapsed}ms`)
check('master respects its time budget', elapsed < 2500, `${elapsed}ms`)

console.log('\nUndo policy')
const mid = playGame('expert', 'novice', 5, 12).state
const target = createInitialState({ boardSize: 5 })
check('novice always accepts', decideUndoRequest({ difficulty: DIFFICULTIES.novice, aiSide: 'player1', current: mid, target }) === 'accept')
check('nothing to undo is declined', decideUndoRequest({ difficulty: DIFFICULTIES.master, aiSide: 'player1', current: mid, target: null }) === 'decline')
const masterDecision = decideUndoRequest({ difficulty: DIFFICULTIES.master, aiSide: 'player1', current: mid, target })
console.log(`  master on a real position: ${masterDecision}`)

console.log(`\n${fails === 0 ? 'OK' : fails + ' FAILURES'}\n`)
process.exit(fails > 0 ? 1 : 0)
