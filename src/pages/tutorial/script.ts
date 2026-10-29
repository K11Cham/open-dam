import { applyAction, createInitialState } from '../../game/engine'
import { notationToCoord } from '../../game/notation'
import { positionFromAscii } from '../../game/position'
import type { EngineAction, EngineResult, EngineState, PlayerId, RuleSettings } from '../../game/types'

/**
 * Tutorial examples are scripts, not animations: each step is a real action
 * replayed through the engine, so an example can never show an illegal move.
 * A test replays every script (tutorial.test.ts).
 *
 * Step notation, using board squares (a1 is Red's bottom-left):
 *   'c2-c3'      a quiet move
 *   'c2xc4'      a capture (one leg of a chain)
 *   'end'        stop a chain and end the turn
 *   'call'       call the only offender
 *   'call c2'    call the piece on c2
 */
export interface ExampleStep {
  play: string
  caption: string
}

export interface ExampleSpec {
  /** Rows top to bottom (see positionFromAscii), or 'start' for the opening position. */
  rows: string[] | 'start'
  size?: 5 | 7
  toMove: PlayerId
  settings?: Partial<RuleSettings>
  intro: string
  steps: ExampleStep[]
}

export function initialPosition(spec: Pick<ExampleSpec, 'rows' | 'size' | 'settings' | 'toMove'>): EngineState {
  if (spec.rows === 'start') return createInitialState({ boardSize: spec.size ?? 5, ...spec.settings })
  return positionFromAscii(spec.rows, spec.toMove, spec.settings)
}

export function parseStep(step: string, state: EngineState): EngineAction | string {
  const size = state.settings.boardSize
  const text = step.trim()
  if (text === 'end') return { type: 'end-chain' }
  if (text.startsWith('call')) {
    const square = text.slice(4).trim()
    if (!square) return { type: 'call' }
    const at = notationToCoord(square, size)
    const piece = at ? state.board[at.row][at.col] : null
    return piece ? { type: 'call', pieceId: piece.id } : `No piece on ${square} to call.`
  }
  const match = /^([a-z]\d+)[-x]([a-z]\d+)$/.exec(text)
  if (!match) return `Cannot read step "${step}".`
  const from = notationToCoord(match[1], size)
  const to = notationToCoord(match[2], size)
  if (!from || !to) return `Square off the board in "${step}".`
  return { type: 'move', from, to }
}

/** Play one scripted step. Returns the engine result, or an error explaining what went wrong. */
export function playStep(state: EngineState, step: ExampleStep): EngineResult {
  const action = parseStep(step.play, state)
  if (typeof action === 'string') return { state, events: [], error: action }
  return applyAction(state, action)
}
