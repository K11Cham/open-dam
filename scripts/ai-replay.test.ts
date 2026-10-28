/**
 * Watch the computer play a whole game and print every ply with the board,
 * the engine's score and how deep it searched. This is how endgame mistakes
 * are found: read the game, find the move where the score was wrong, and ask
 * which rule the evaluation did not understand.
 *
 *   RED=serin BLUE=maam SIZE=5 SEED=3 FROM=6 npm run replay
 *
 * FROM prints only once that many pieces or fewer are left (default: all).
 */
import { test } from 'vitest'
import { countPieces } from '../src/game/board'
import { applyAction, createInitialState, legalActions } from '../src/game/engine'
import { positionToAscii } from '../src/game/position'
import { DIFFICULTIES, isDifficultyId } from '../src/ai/difficulty'
import type { DifficultyId } from '../src/ai/difficulty'
import { chooseAction } from '../src/ai/search'
import type { BoardSize } from '../src/game/types'

const out = (text: string) => process.stdout.write(`${text}\n`)
const tierFrom = (value: string | undefined, fallback: DifficultyId): DifficultyId => (isDifficultyId(value) ? value : fallback)

test('replay one game', () => {
  const red = DIFFICULTIES[tierFrom(process.env.RED, 'serin')]
  const blue = DIFFICULTIES[tierFrom(process.env.BLUE, 'serin')]
  const size = Number(process.env.SIZE ?? 5) as BoardSize
  const from = Number(process.env.FROM ?? Infinity)
  const budget = Number(process.env.BUDGET ?? 600)
  let seed = Number(process.env.SEED ?? 1)
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }

  let state = createInitialState({ boardSize: size })
  // Two random opening plies, so different seeds give different games.
  for (let i = 0; i < 2; i++) {
    const options = legalActions(state)
    state = applyAction(state, options[Math.floor(random() * options.length)]).state
  }

  out(`${red.name} (Red, a) vs ${blue.name} (Blue, b), ${size}×${size}`)
  for (let ply = 0; ply < 300 && state.status.kind === 'playing'; ply++) {
    const tier = state.currentPlayer === 'player1' ? red : blue
    const result = chooseAction(state, {
      depth: tier.depth,
      profile: tier.profile,
      timeBudgetMs: Math.min(tier.timeBudgetMs, budget),
      quiescenceDepth: tier.quiescenceDepth,
      noise: tier.noise,
      blunderChance: tier.blunderChance,
      blunderMargin: tier.blunderMargin,
      missCallChance: tier.missCallChance,
      callAware: tier.callAware,
      forcingExtensions: tier.forcingExtensions,
      random,
    })
    if (!result) break
    const mover = state.currentPlayer === 'player1' ? 'Red ' : 'Blue'
    state = applyAction(state, result.action).state
    const pieces = countPieces(state.board, 'player1') + countPieces(state.board, 'player2')
    if (pieces <= from) {
      const record = state.moves.at(-1)
      out(
        `\n${ply + 1}. ${mover} ${record?.notation ?? ''}  score ${Math.round(result.score)}  depth ${result.depthReached}` +
          `  plies since capture ${state.pliesSinceCapture}${result.blundered ? '  (deliberate slip)' : ''}`,
      )
      out(positionToAscii(state))
    }
  }
  out(`\nResult: ${JSON.stringify(state.status)}`)
})
