import { describe, expect, test } from 'vitest'
import { searchOptionsFor } from '../ai/client'
import { DIFFICULTIES, DIFFICULTY_IDS } from '../ai/difficulty'
import { chooseAction } from '../ai/search'
import { applyAction, canCall, createInitialState, legalActions } from '../game/engine'
import { makeSettings } from '../game/settings'
import type { BoardSize, EngineAction, EngineState, PlayerId, PromotionPolicy, RuleSettings } from '../game/types'
import { replay } from '../match/reducer'
import { MatchHost, createRecord } from '../match/session'

/**
 * Properties of the rules engine, checked over seeded random games on every
 * board size and rule setting, rather than on hand-picked positions:
 *
 *  - every action `legalActions` offers is accepted;
 *  - moves it does not offer, and calls when there is nothing to call, are refused;
 *  - neither side ever gains pieces;
 *  - replaying a game's record reproduces its state exactly;
 *  - under the default draw rules every game ends within a bound;
 *  - the computer, at every tier, only ever plays legal actions.
 *
 * Seeded, so a failure names a game that can be played again.
 */

/** A small seeded generator (mulberry32): the same seed gives the same game. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SIZES: BoardSize[] = [5, 6, 7, 8, 9]
const POLICIES: PromotionPolicy[] = ['promote-and-continue', 'promote-after-chain', 'end-turn-on-promotion']

/** Every board size with each promotion rule, call scope and abandoned-chain rule. */
const SETTINGS: RuleSettings[] = SIZES.flatMap((boardSize) =>
  POLICIES.flatMap((promotionPolicy, i) =>
    makeSettings({
      boardSize,
      promotionPolicy,
      call: { scope: i % 2 === 0 ? 'choose-one' : 'all', abandonedChainCallable: i !== 1 },
    }),
  ),
)

const label = (s: RuleSettings) =>
  `${s.boardSize}x${s.boardSize} ${s.promotionPolicy} call:${s.call.scope}${s.call.abandonedChainCallable ? '' : ' free-abandon'}`

const count = (state: EngineState, player: PlayerId) => state.board.flat().filter((p) => p?.player === player).length

/** With pieces on the board and a capture-free limit, a game cannot last longer than this many plies. */
const bound = (s: RuleSettings) => (s.boardSize * s.boardSize + 1) * ((s.draw.pliesWithoutCapture ?? 50) + 2)

const sameMove = (a: EngineAction, b: EngineAction) =>
  a.type === 'move' &&
  b.type === 'move' &&
  a.from.row === b.from.row &&
  a.from.col === b.from.col &&
  a.to.row === b.to.row &&
  a.to.col === b.to.col

describe('rules engine properties', () => {
  test.each(SETTINGS.map((s, i) => [label(s), s, i] as const))('%s: random games keep every rule', (_name, settings, index) => {
    const random = seeded(1000 + index)
    for (let game = 0; game < 2; game++) {
      const record = createRecord({
        mode: 'local',
        settings,
        seats: { player1: { kind: 'human', name: '' }, player2: { kind: 'human', name: '' } },
        createdAt: 0,
      })
      const host = new MatchHost(record, { now: () => 0 })
      let plies = 0
      while (host.getSnapshot().state.position.status.kind === 'playing') {
        const position = host.getSnapshot().state.position
        const actions = legalActions(position)
        expect(
          actions.length,
          `no legal action in a game still being played (seed ${1000 + index}, game ${game})`,
        ).toBeGreaterThan(0)

        // Everything offered is accepted.
        for (const action of actions) expect(applyAction(position, action).error, JSON.stringify(action)).toBeUndefined()

        // A handful of moves not offered are refused.
        const size = settings.boardSize
        for (let i = 0; i < 6; i++) {
          const from = { row: Math.floor(random() * size), col: Math.floor(random() * size) }
          const to = { row: Math.floor(random() * size), col: Math.floor(random() * size) }
          const move: EngineAction = { type: 'move', from, to }
          if (actions.some((a) => sameMove(a, move))) continue
          expect(applyAction(position, move).error, `offered nothing like ${JSON.stringify(move)}`).toBeDefined()
        }
        if (!canCall(position)) expect(applyAction(position, { type: 'call' }).error).toBeDefined()

        const action = actions[Math.floor(random() * actions.length)]
        const before = { player1: count(position, 'player1'), player2: count(position, 'player2') }
        expect(host.submit(position.currentPlayer, { type: 'engine', action })).toBeNull()
        const after = host.getSnapshot().state.position
        expect(count(after, 'player1')).toBeLessThanOrEqual(before.player1)
        expect(count(after, 'player2')).toBeLessThanOrEqual(before.player2)

        plies++
        expect(plies, 'the game should have ended by now').toBeLessThanOrEqual(bound(settings))
      }
      // The record replays to exactly the same game.
      const { record: finished, state } = host.getSnapshot()
      expect(replay(finished)).toEqual(state)
      host.dispose()
    }
  })

  test.each(DIFFICULTY_IDS)('the computer at %s only plays legal actions', (id) => {
    const difficulty = DIFFICULTIES[id]
    // A short look ahead is enough to exercise every tier's move choice, calls and mistakes included.
    const options = { ...searchOptionsFor(difficulty), timeBudgetMs: 20, depth: Math.min(difficulty.depth, 3) }
    const random = seeded(7 + DIFFICULTY_IDS.indexOf(id))
    for (const boardSize of [5, 7, 9] as BoardSize[]) {
      let position = createInitialState(makeSettings({ boardSize }))
      for (let ply = 0; ply < 24 && position.status.kind === 'playing'; ply++) {
        const result = chooseAction(position, { ...options, random })
        expect(result).not.toBeNull()
        const legal = legalActions(position)
        const action = result!.action
        // A call may name any piece that can be called; anything else must be on the list.
        const offered =
          action.type === 'move'
            ? legal.some((a) => sameMove(a, action))
            : action.type === 'call'
              ? canCall(position) &&
                (action.pieceId === undefined || position.offenders.some((o) => o.pieceId === action.pieceId))
              : legal.some((a) => a.type === action.type)
        expect(offered, `${id} on ${boardSize}x${boardSize} chose ${JSON.stringify(action)}`).toBe(true)
        const applied = applyAction(position, action)
        expect(applied.error).toBeUndefined()
        // Alternate the computer with random play, so it meets positions it did not steer towards.
        position = applied.state
        if (position.status.kind !== 'playing') break
        const replies = legalActions(position)
        position = applyAction(position, replies[Math.floor(random() * replies.length)]).state
      }
    }
  })
})
