import { describe, expect, test } from 'vitest'
import { legalActions } from '../game/engine'
import { makeSettings } from '../game/settings'
import type { EngineState } from '../game/types'
import { remainingAt } from './clock'
import { createMatchState, replay, stepMatch, undoTargetIndex } from './reducer'
import { MatchHost, createRecord } from './session'
import { loadActiveMatch, parseRecord, resumeAfterGap, saveActiveMatch } from './storage'
import type { MatchConfig, MatchRecord } from './types'

const seats: MatchConfig['seats'] = {
  player1: { kind: 'human', name: 'Red' },
  player2: { kind: 'human', name: 'Blue' },
}

const newRecord = (overrides: Partial<MatchConfig> = {}): MatchRecord =>
  createRecord({ mode: 'local', settings: makeSettings({ boardSize: 5 }), seats, ...overrides })

/** A host whose clock is a variable the test controls. */
const hostAt = (record: MatchRecord, start = 1_000) => {
  const time = { now: start }
  const host = new MatchHost(record, { now: () => time.now })
  return { host, time }
}

const move = (fromRow: number, fromCol: number, toRow: number, toCol: number) => ({
  type: 'engine' as const,
  action: { type: 'move' as const, from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } },
})

/** Any legal board move for the side to move. */
const anyMove = (position: EngineState) => {
  const action = legalActions(position).find((a) => a.type === 'move')
  if (!action) throw new Error('no legal move in test position')
  return { type: 'engine' as const, action }
}

describe('turn ownership', () => {
  test('a player cannot move on the other side’s turn', () => {
    const state = createMatchState(newRecord().config)
    const result = stepMatch(state, 'player2', move(1, 2, 2, 2), 0)
    expect(result.error).toBe('It is not your turn.')
  })

  test('the side to move can move', () => {
    const state = createMatchState(newRecord().config)
    const result = stepMatch(state, 'player1', move(3, 2, 2, 2), 0)
    expect(result.error).toBeUndefined()
    expect(result.state.position.currentPlayer).toBe('player2')
    expect(result.state.timeline).toHaveLength(2)
  })

  test('nobody can resign for the opponent', () => {
    const state = createMatchState(newRecord().config)
    const result = stepMatch(state, 'player1', { type: 'engine', action: { type: 'resign', player: 'player2' } }, 0)
    expect(result.error).toBeTruthy()
  })

  test('players cannot claim a timeout or agree a draw directly', () => {
    const state = createMatchState(newRecord().config)
    expect(stepMatch(state, 'player1', { type: 'engine', action: { type: 'timeout', player: 'player2' } }, 0).error).toBeTruthy()
    expect(stepMatch(state, 'player1', { type: 'engine', action: { type: 'agree-draw' } }, 0).error).toBeTruthy()
  })
})

describe('offers', () => {
  test('undo rolls back to the requester’s last turn', () => {
    const { host } = hostAt(newRecord())
    host.submit('player1', move(3, 2, 2, 2))
    expect(host.submit('player2', anyMove(host.getSnapshot().state.position))).toBeNull()
    expect(host.getSnapshot().state.position.currentPlayer).toBe('player1')
    expect(host.submit('player1', { type: 'offer', kind: 'undo' })).toBeNull()
    expect(host.submit('player2', { type: 'answer-offer', accept: true })).toBeNull()
    const state = host.getSnapshot().state
    expect(state.position.currentPlayer).toBe('player1')
    expect(state.position.moves).toHaveLength(0)
    expect(state.timeline).toHaveLength(1)
  })

  test('only the other player can answer, and only the offerer can withdraw', () => {
    const { host } = hostAt(newRecord())
    host.submit('player1', move(3, 2, 2, 2))
    expect(host.submit('player2', { type: 'offer', kind: 'draw' })).toBeNull()
    expect(host.submit('player2', { type: 'answer-offer', accept: true })).toBeTruthy()
    expect(host.submit('player1', { type: 'cancel-offer' })).toBeTruthy()
    expect(host.submit('player2', { type: 'cancel-offer' })).toBeNull()
    expect(host.getSnapshot().state.offer).toBeNull()
  })

  test('an accepted draw ends the game', () => {
    const { host } = hostAt(newRecord())
    host.submit('player1', { type: 'offer', kind: 'draw' })
    host.submit('player2', { type: 'answer-offer', accept: true })
    expect(host.getSnapshot().state.position.status).toEqual({ kind: 'draw', reason: 'agreement' })
  })

  test('one draw offer per player per turn', () => {
    const { host } = hostAt(newRecord())
    host.submit('player1', { type: 'offer', kind: 'draw' })
    host.submit('player2', { type: 'answer-offer', accept: false })
    expect(host.submit('player1', { type: 'offer', kind: 'draw' })).toMatch(/already/)
  })

  test('moving answers a pending offer with no', () => {
    const { host } = hostAt(newRecord())
    host.submit('player2', { type: 'offer', kind: 'draw' })
    let declined = false
    host.subscribe((u) => {
      if (u.step?.notices.some((n) => n.type === 'offer-declined')) declined = true
    })
    host.submit('player1', move(3, 2, 2, 2))
    expect(host.getSnapshot().state.offer).toBeNull()
    expect(declined).toBe(true)
  })

  test('there is no undo before the requester has moved', () => {
    const state = createMatchState(newRecord().config)
    expect(undoTargetIndex(state, 'player1')).toBeNull()
  })
})

describe('clock', () => {
  const timed = () =>
    newRecord({ settings: makeSettings({ boardSize: 5, timeControl: { label: '1+2', initialMs: 60_000, incrementMs: 2_000 } }) })

  test('the first move is free and starts the opponent’s clock', () => {
    const { host, time } = hostAt(timed())
    time.now += 10_000
    host.submit('player1', move(3, 2, 2, 2))
    const clock = host.getSnapshot().state.clock!
    expect(clock.remaining.player1).toBe(62_000) // untouched + increment
    expect(clock.running).toBe('player2')
  })

  test('a turn charges the mover and adds the increment', () => {
    const { host, time } = hostAt(timed())
    host.submit('player1', move(3, 2, 2, 2))
    time.now += 5_000
    expect(host.submit('player2', anyMove(host.getSnapshot().state.position))).toBeNull()
    expect(host.getSnapshot().state.clock!.remaining.player2).toBe(60_000 - 5_000 + 2_000)
  })

  test('time is read from the running side at any moment', () => {
    const { host, time } = hostAt(timed())
    host.submit('player1', move(3, 2, 2, 2))
    const clock = host.getSnapshot().state.clock!
    expect(remainingAt(clock, 'player2', time.now + 7_000)).toBe(53_000)
    expect(remainingAt(clock, 'player1', time.now + 7_000)).toBe(62_000)
  })

  test('the clock can only flag a side that has actually run out', () => {
    const { host, time } = hostAt(timed())
    host.submit('player1', move(3, 2, 2, 2))
    time.now += 30_000
    expect(host.submit('system', { type: 'engine', action: { type: 'timeout', player: 'player2' } })).toBeTruthy()
    time.now += 30_000
    expect(host.submit('system', { type: 'engine', action: { type: 'timeout', player: 'player2' } })).toBeNull()
    expect(host.getSnapshot().state.position.status).toMatchObject({ kind: 'win', winner: 'player1', reason: 'timeout' })
  })

  test('closing a local game pauses the clock', () => {
    const { host, time } = hostAt(timed())
    host.submit('player1', move(3, 2, 2, 2))
    const savedAt = time.now + 1_000
    const reopened = resumeAfterGap(host.getSnapshot().record, host.getSnapshot().state, savedAt, savedAt + 3_600_000)
    const state = replay(reopened)
    expect(remainingAt(state.clock!, 'player2', savedAt + 3_600_000)).toBe(59_000)
  })
})

describe('records', () => {
  test('replaying a record reproduces the live state', () => {
    const { host, time } = hostAt(newRecord())
    host.submit('player1', move(3, 2, 2, 2))
    time.now += 1000
    host.submit('player2', { type: 'offer', kind: 'draw' })
    host.submit('player1', { type: 'answer-offer', accept: false })
    const { record, state } = host.getSnapshot()
    expect(JSON.stringify(replay(record))).toBe(JSON.stringify(state))
  })

  test('a saved game survives a round trip through storage', () => {
    const { host } = hostAt(newRecord())
    host.submit('player1', move(3, 2, 2, 2))
    saveActiveMatch(host.getSnapshot().record)
    const loaded = loadActiveMatch()
    expect(loaded?.state.position.moves).toHaveLength(1)
  })

  test('a corrupted record is rejected, not trusted', () => {
    const good = newRecord()
    expect(parseRecord({ ...good, version: 2 })).toBeNull()
    expect(parseRecord({ ...good, actions: [{ seq: 1, at: 0, by: 'player2', intent: move(1, 2, 2, 2) }] })).toBeNull()
    expect(parseRecord(JSON.parse(JSON.stringify(good)))).not.toBeNull()
  })

  test('review timeline covers every ply from the start, even after a reload', () => {
    const { host } = hostAt(newRecord())
    host.submit('player1', move(3, 2, 2, 2))
    const state = replay(host.getSnapshot().record)
    expect(state.timeline[0].moves).toHaveLength(0)
    expect(state.timeline).toHaveLength(2)
  })
})
