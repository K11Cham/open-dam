import { describe, expect, test } from 'vitest'
import { applyAction, createInitialState, legalActions } from '../game/engine'
import { positionFromAscii } from '../game/position'
import type { EngineAction, EngineState } from '../game/types'
import { DIFFICULTIES, DIFFICULTY_IDS } from './difficulty'
import type { DifficultyId } from './difficulty'
import { decideDrawOffer, decideUndoRequest } from './opponent'
import { WIN_SCORE } from './evaluate'
import { chooseAction } from './search'

/** Deterministic random source so these tests never flake. */
const seeded = (seed: number) => {
  let value = seed
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648
    return value / 2147483648
  }
}

const options = (id: DifficultyId, budgetMs = 150) => {
  const d = DIFFICULTIES[id]
  return {
    depth: d.depth,
    profile: d.profile,
    timeBudgetMs: Math.min(d.timeBudgetMs, budgetMs),
    quiescenceDepth: d.quiescenceDepth,
    noise: d.noise,
    blunderChance: d.blunderChance,
    blunderMargin: d.blunderMargin,
    missCallChance: d.missCallChance,
    callAware: d.callAware,
    forcingExtensions: d.forcingExtensions,
    random: seeded(7),
  }
}

/** Legal means: the engine accepts it, and (for moves) it is one of the listed moves. */
const isLegal = (state: EngineState, action: EngineAction) =>
  !applyAction(state, action).error &&
  (action.type !== 'move' || legalActions(state).some((legal) => JSON.stringify(legal) === JSON.stringify(action)))

describe('every tier only plays legal actions', () => {
  for (const id of DIFFICULTY_IDS) {
    test(id, () => {
      let state = createInitialState({ boardSize: 5 })
      for (let ply = 0; ply < 16 && state.status.kind === 'playing'; ply++) {
        const result = chooseAction(state, options(id, 60))
        expect(result).not.toBeNull()
        expect(isLegal(state, result!.action), JSON.stringify(result!.action)).toBe(true)
        state = applyAction(state, result!.action).state
      }
    })
  }
})

describe('tactics', () => {
  test('Seriñ takes a free piece', () => {
    // Red's c2 can take c3 for nothing.
    const state = positionFromAscii(['b...b', '.....', '..b..', '..a..', 'a...a'], 'player1')
    const result = chooseAction(state, options('serin', 400))
    expect(result?.action).toEqual({ type: 'move', from: { row: 3, col: 2 }, to: { row: 1, col: 2 } })
  })

  test('Seriñ always calls a skipped capture first', () => {
    const state = positionFromAscii(['b...b', '.....', '..b..', '..a..', 'a...a'], 'player1')
    const skipped = applyAction(state, { type: 'move', from: { row: 4, col: 0 }, to: { row: 3, col: 0 } }).state
    expect(chooseAction(skipped, options('serin'))?.action.type).toBe('call')
  })

  test('Seriñ completes a two-piece chain instead of stopping', () => {
    const state = positionFromAscii(['b...b', '.....', '..b..', '.b...', '.a..a'], 'player1')
    const first = chooseAction(state, options('serin', 400))!
    expect(first.action).toEqual({ type: 'move', from: { row: 4, col: 1 }, to: { row: 2, col: 1 } })
    const mid = applyAction(state, first.action).state
    expect(chooseAction(mid, options('serin', 400))?.action).toEqual({
      type: 'move',
      from: { row: 2, col: 1 },
      to: { row: 2, col: 3 },
    })
  })

  test('Seriñ sacrifices a man to win a king: take it, or have the king called', () => {
    // Red's c3 steps up to c4. Blue's king on c5 must jump it (landing on c3,
    // the only empty square) or be called; either way c2 then takes the king.
    const state = positionFromAscii(['b.B.b', '.....', '..a..', '..a..', 'a.a.a'], 'player1')
    const result = chooseAction(state, options('serin', 800))
    expect(result?.action).toEqual({ type: 'move', from: { row: 2, col: 2 }, to: { row: 1, col: 2 } })
  })

  test('Seriñ offers a king so the lone king must capture into a recapture', () => {
    // Two kings against one: the sacrifice on c5 is a forced win in three plies.
    const state = positionFromAscii(['B...A', '.....', '..A..', '.....', '.....'], 'player1')
    const result = chooseAction(state, options('serin', 800))!
    expect(result.score).toBeGreaterThan(WIN_SCORE - 100)
  })

  test('Seriñ closes the corner net on a lone king', () => {
    // Blue's king is in the a5 corner; a king on e5 covers the fifth rank and
    // the one on a1 covers the a-file, so every move it has walks into a capture.
    const state = positionFromAscii(['B....', '.....', '....A', '.....', 'A....'], 'player1')
    const result = chooseAction(state, options('serin', 800))!
    expect(result.score).toBeGreaterThan(WIN_SCORE - 100)
  })

  test('Seriñ converts two kings against one on 7×7', () => {
    let state = positionFromAscii(['.......', '.......', '.......', '...B...', '.......', '.......', 'A.....A'], 'player2')
    for (let ply = 0; ply < 80 && state.status.kind === 'playing'; ply++) {
      // Depth-limited with a generous clock, so the result does not depend on machine speed.
      const result = chooseAction(state, { ...options('serin', 5000), depth: 4 })!
      state = applyAction(state, result.action).state
    }
    expect(state.status).toEqual({ kind: 'win', winner: 'player1', reason: 'no-pieces' })
  })

  test('a tier that misses calls sometimes plays on instead', () => {
    const state = positionFromAscii(['b...b', '.....', '..b..', '..a..', 'a...a'], 'player1')
    const skipped = applyAction(state, { type: 'move', from: { row: 4, col: 0 }, to: { row: 3, col: 0 } }).state
    const result = chooseAction(skipped, { ...options('doff'), missCallChance: 1 })
    expect(result?.action.type).toBe('move')
  })

  test('a lost position returns null instead of throwing', () => {
    const over = applyAction(createInitialState({ boardSize: 5 }), { type: 'resign', player: 'player1' }).state
    expect(chooseAction(over, options('ndo'))).toBeNull()
  })
})

describe('time budget', () => {
  test('Seriñ on an open 9×9 returns within its budget', () => {
    const state = createInitialState({ boardSize: 9 })
    const started = performance.now()
    chooseAction(state, { ...options('serin'), timeBudgetMs: 500 })
    // Generous ceiling for slow CI machines; the search checks its deadline every node.
    expect(performance.now() - started).toBeLessThan(2500)
  })
})

describe('offers', () => {
  test('Döff accepts any undo; nothing to undo is declined', () => {
    const state = createInitialState({ boardSize: 5 })
    expect(decideUndoRequest({ difficulty: DIFFICULTIES.doff, aiSide: 'player2', current: state, target: state })).toBe('accept')
    expect(decideUndoRequest({ difficulty: DIFFICULTIES.serin, aiSide: 'player2', current: state, target: null })).toBe('decline')
  })

  test('Seriñ declines a draw when clearly winning and accepts when losing', () => {
    const winning = positionFromAscii(['....b', '.....', '.....', 'a.a.a', 'a.a.a'], 'player1')
    expect(decideDrawOffer(DIFFICULTIES.serin, 'player1', winning)).toBe('decline')
    expect(decideDrawOffer(DIFFICULTIES.serin, 'player2', winning)).toBe('accept')
  })
})
