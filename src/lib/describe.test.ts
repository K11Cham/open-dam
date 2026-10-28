import { describe, expect, test } from 'vitest'
import { makeSettings } from '../game/settings'
import type { MoveRecord } from '../game/types'
import { DEFAULT_SETUP, recordFromSetup, setupFromParams, setupToParams } from '../match/setup'
import { outcomeReason, outcomeTitle, spokenMove } from './describe'

const names = { player1: 'Red', player2: 'Blue' }
const record = (notation: string, kind: MoveRecord['kind'] = 'move'): MoveRecord => ({
  ply: 0,
  player: 'player1',
  notation,
  from: null,
  to: null,
  kind,
  capturedIds: [],
  promoted: false,
  continuesChain: false,
})

describe('outcome wording', () => {
  test('hot seat names the winner; a single player reads win or lose', () => {
    const status = { kind: 'win' as const, winner: 'player2' as const, reason: 'no-pieces' as const }
    expect(outcomeTitle(status, null, names)).toBe('Blue wins')
    expect(outcomeTitle(status, 'player2', names)).toBe('You win')
    expect(outcomeTitle(status, 'player1', names)).toBe('You lose')
  })

  test('the reason uses "you" with the right verb', () => {
    const status = { kind: 'win' as const, winner: 'player2' as const, reason: 'no-pieces' as const }
    expect(outcomeReason(status, makeSettings(), names, 'player1')).toBe('You have no pieces left.')
    expect(outcomeReason(status, makeSettings(), names)).toBe('Red has no pieces left.')
  })

  test('the no-capture draw quotes this game’s actual rule', () => {
    const status = { kind: 'draw' as const, reason: 'no-captures' as const }
    expect(outcomeReason(status, makeSettings({ draw: { threefoldRepetition: true, pliesWithoutCapture: 100 } }), names)).toBe(
      '50 moves each went by without a capture.',
    )
  })
})

describe('spoken moves', () => {
  test('quiet moves, chains, crowning and skipped captures read naturally', () => {
    expect(spokenMove(record('c2-c3'), names)).toBe('Red: c2 to c3')
    expect(spokenMove(record('b1xb3xd3', 'capture'), names)).toBe('Red: b1 jumps to b3, then d3, capturing')
    expect(spokenMove(record('c4-c5=K'), names)).toBe('Red: c4 to c5, and is crowned')
    expect(spokenMove(record('a1-a2 ?!'), names)).toBe('Red: a1 to a2, passing up a capture')
    expect(spokenMove(record('!c2', 'call'), names)).toBe('Red called c2')
  })
})

describe('game setup links', () => {
  test('a setup survives a round trip through the URL', () => {
    const setup = { ...DEFAULT_SETUP, opponent: 'maam' as const, side: 'player2' as const }
    expect(setupFromParams(setupToParams(setup))).toEqual(setup)
  })

  test('older ?ai= links still work and junk falls back to defaults', () => {
    const parsed = setupFromParams(new URLSearchParams('ai=master&size=99&nocap=-4&tc=bogus'))
    // Tiers were renamed; the old Master is now Seriñ.
    expect(parsed.opponent).toBe('serin')
    expect(parsed.settings.boardSize).toBe(5)
    expect(parsed.settings.draw.pliesWithoutCapture).toBeNull()
    expect(parsed.settings.timeControl).toBeNull()
  })

  test('the AI sits opposite the human', () => {
    const rec = recordFromSetup({ ...DEFAULT_SETUP, opponent: 'doff', side: 'player2' })
    expect(rec.config.seats.player1.kind).toBe('ai')
    expect(rec.config.seats.player2.kind).toBe('human')
  })
})
