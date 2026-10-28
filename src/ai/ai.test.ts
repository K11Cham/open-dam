import { describe, expect, test } from 'vitest'
import { applyAction, createInitialState, legalActions } from '../game/engine'
import { positionFromAscii } from '../game/position'
import type { EngineAction, EngineState } from '../game/types'
import { DIFFICULTIES, DIFFICULTY_IDS } from './difficulty'
import type { DifficultyId } from './difficulty'
import { decideDrawOffer, decideUndoRequest } from './opponent'
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
  test('Master takes a free piece', () => {
    // Red's c2 can take c3 for nothing.
    const state = positionFromAscii(['b...b', '.....', '..b..', '..a..', 'a...a'], 'player1')
    const result = chooseAction(state, options('master', 400))
    expect(result?.action).toEqual({ type: 'move', from: { row: 3, col: 2 }, to: { row: 1, col: 2 } })
  })

  test('Master always calls a skipped capture first', () => {
    const state = positionFromAscii(['b...b', '.....', '..b..', '..a..', 'a...a'], 'player1')
    const skipped = applyAction(state, { type: 'move', from: { row: 4, col: 0 }, to: { row: 3, col: 0 } }).state
    expect(chooseAction(skipped, options('master'))?.action.type).toBe('call')
  })

  test('Master completes a two-piece chain instead of stopping', () => {
    const state = positionFromAscii(['b...b', '.....', '..b..', '.b...', '.a..a'], 'player1')
    const first = chooseAction(state, options('master', 400))!
    expect(first.action).toEqual({ type: 'move', from: { row: 4, col: 1 }, to: { row: 2, col: 1 } })
    const mid = applyAction(state, first.action).state
    expect(chooseAction(mid, options('master', 400))?.action).toEqual({
      type: 'move',
      from: { row: 2, col: 1 },
      to: { row: 2, col: 3 },
    })
  })

  test('a lost position returns null instead of throwing', () => {
    const over = applyAction(createInitialState({ boardSize: 5 }), { type: 'resign', player: 'player1' }).state
    expect(chooseAction(over, options('club'))).toBeNull()
  })
})

describe('time budget', () => {
  test('Master on an open 9×9 returns within its budget', () => {
    const state = createInitialState({ boardSize: 9 })
    const started = performance.now()
    chooseAction(state, { ...options('master'), timeBudgetMs: 500 })
    // Generous ceiling for slow CI machines; the search checks its deadline every node.
    expect(performance.now() - started).toBeLessThan(2500)
  })
})

describe('offers', () => {
  test('Novice accepts any undo; nothing to undo is declined', () => {
    const state = createInitialState({ boardSize: 5 })
    expect(decideUndoRequest({ difficulty: DIFFICULTIES.novice, aiSide: 'player2', current: state, target: state })).toBe(
      'accept',
    )
    expect(decideUndoRequest({ difficulty: DIFFICULTIES.master, aiSide: 'player2', current: state, target: null })).toBe(
      'decline',
    )
  })

  test('Master declines a draw when clearly winning and accepts when losing', () => {
    const winning = positionFromAscii(['....b', '.....', '.....', 'a.a.a', 'a.a.a'], 'player1')
    expect(decideDrawOffer(DIFFICULTIES.master, 'player1', winning)).toBe('decline')
    expect(decideDrawOffer(DIFFICULTIES.master, 'player2', winning)).toBe('accept')
  })
})
