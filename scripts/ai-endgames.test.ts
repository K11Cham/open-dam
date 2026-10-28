/**
 * Endgame conversion bench: random starting positions for a given material
 * balance, the strong tier on both sides, played out under the normal draw
 * rules. Reports how often the stronger side wins. Run with
 * `npx vitest run --config vitest.ai.config.ts ai-endgames`.
 */
import { test } from 'vitest'
import { applyAction } from '../src/game/engine'
import { positionFromAscii, positionToAscii } from '../src/game/position'
import { DIFFICULTIES } from '../src/ai/difficulty'
import { chooseAction } from '../src/ai/search'
import { getCaptures } from '../src/game/moves'
import type { EngineState } from '../src/game/types'

const out = (s: string) => process.stdout.write(`${s}\n`)

const randomPosition = (size: number, hunter: string, prey: string, seed: number): EngineState | null => {
  let value = seed
  const random = () => {
    value = (value * 1103515245 + 12345) % 2147483648
    return value / 2147483648
  }
  const cells = Array.from({ length: size * size }, () => '.')
  for (const char of hunter + prey) {
    let spot = Math.floor(random() * cells.length)
    // Men are never placed on their own promotion row.
    while (cells[spot] !== '.' || (char === 'a' && spot < size) || (char === 'b' && spot >= size * (size - 1)))
      spot = Math.floor(random() * cells.length)
    cells[spot] = char
  }
  const rows = Array.from({ length: size }, (_, r) => cells.slice(r * size, r * size + size).join(''))
  const state = positionFromAscii(rows, random() < 0.5 ? 'player1' : 'player2')
  // Skip starts where someone can capture at once; those test tactics, not technique.
  if (getCaptures(state.board, 'player1').length > 0 || getCaptures(state.board, 'player2').length > 0) return null
  return state
}

test('endgames', () => {
  const budget = Number(process.env.BUDGET ?? 250)
  const games = Number(process.env.GAMES ?? 10)
  const sets = (process.env.SETS ?? 'AA/B,Aa/B,aa/B').split(',')
  const sizes = (process.env.SIZES ?? '5,7').split(',').map(Number)
  const tier = DIFFICULTIES.serin
  for (const size of sizes) {
    for (const set of sets) {
      const [hunter, prey] = set.split('/')
      let wins = 0
      let losses = 0
      const reasons: string[] = []
      for (let g = 0; g < games; g++) {
        let seed = 1000 + g * 7919
        let start = randomPosition(size, hunter, prey, seed)
        while (!start) start = randomPosition(size, hunter, prey, ++seed)
        let state = start
        let ply = 0
        while (state.status.kind === 'playing' && ply < 160) {
          const r = chooseAction(state, {
            depth: 40,
            profile: tier.profile,
            timeBudgetMs: budget,
            quiescenceDepth: tier.quiescenceDepth,
            noise: 0,
            blunderChance: 0,
            callAware: true,
            forcingExtensions: tier.forcingExtensions,
          })
          if (!r) break
          const before = state
          state = applyAction(state, r.action).state
          if (
            process.env.VERBOSE &&
            ply < Number(process.env.VLIMIT ?? 12) &&
            (!process.env.VGAME || Number(process.env.VGAME) === g)
          )
            out(`  g${g} #${ply} ${before.currentPlayer} ${state.moves.at(-1)?.notation} score=${Math.round(r.score)} d=${r.depthReached}
${positionToAscii(state).replace(/^/gm, '    ')}`)
          ply++
        }
        if (state.status.kind === 'win') {
          if (state.status.winner === 'player1') wins++
          else losses++
        }
        reasons.push(
          state.status.kind === 'win' ? `W${ply}` : state.status.kind === 'draw' ? state.status.reason.slice(0, 5) : 'open',
        )
      }
      out(`ENDGAME ${size}x${size} ${set}: hunter won ${wins}/${games}, lost ${losses} [${reasons.join(' ')}]`)
    }
  }
})
