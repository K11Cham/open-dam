import { applyAction as applyStep } from '../../game/engine'
import { getCaptures } from '../../game/moves'
import type { EngineAction, EngineState } from '../../game/types'
import { initialPosition, parseStep } from './script'
import type { ExampleSpec } from './script'

/**
 * Puzzles turn a lesson into something you do. The reader plays {p1} on a
 * small board and has to find the move the section is about. Like the
 * examples, every move goes through the real engine, and a test replays each
 * puzzle's answers, mistakes and punishments (tutorial.test.ts).
 */
export interface PuzzleTurn {
  /**
   * Moves that count as right, in step notation. With `test`, any move that
   * passes the test is right and these are only the answer "Show me" plays.
   */
  accept: string[]
  /**
   * 'safe': after the move, {p2} has nothing to capture.
   * 'wins': the move wins the game.
   */
  test?: 'safe' | 'wins'
  praise: string
  /** {p2}'s scripted answer, played after a short pause. */
  reply?: string
  /** What to tell the reader once {p2} has answered: the next turn's prompt. */
  then?: string
  /**
   * Why a particular right answer works, by its step notation, and the line
   * that shows it on the board. Used when there are several right answers
   * that each work for a different reason, like the openings.
   */
  explain?: Record<string, { text: string; line?: string[] }>
}

/** A tempting wrong move, what is wrong with it, and the moves that punish it. */
export interface PuzzleMistake {
  play: string
  why: string
  punish?: string[]
  /** A reasonable move that is just not the best: worded gently, not as a blunder. */
  playable?: boolean
}

export interface PuzzleSpec extends Pick<ExampleSpec, 'rows' | 'size' | 'settings' | 'toMove'> {
  /** Stable id: solved puzzles are remembered by it. */
  id: string
  /** Moves played before the reader takes over, such as {p2} skipping a capture. */
  setup?: string[]
  goal: string
  hint: string
  turns: PuzzleTurn[]
  mistakes?: PuzzleMistake[]
  /** Shown once the last turn is played. */
  solved: string
}

export const sameAction = (a: EngineAction, b: EngineAction): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Play a list of steps; throws on an illegal one, because puzzle data is checked by tests. */
export function playSteps(state: EngineState, steps: string[]): EngineState {
  let current = state
  for (const step of steps) {
    const action = parseStep(step, current)
    if (typeof action === 'string') throw new Error(action)
    const result = applyStep(current, action)
    if (result.error) throw new Error(`${step}: ${result.error}`)
    current = result.state
  }
  return current
}

/** The puzzle's board once its setup moves are played: the position the reader starts from. */
export const puzzleStart = (spec: PuzzleSpec): EngineState => playSteps(initialPosition(spec), spec.setup ?? [])

/** The explanation for the move just played, if the turn has one. */
export function explanationFor(turn: PuzzleTurn, before: EngineState, action: EngineAction) {
  const key = Object.keys(turn.explain ?? {}).find((step) => {
    const parsed = parseStep(step, before)
    return typeof parsed !== 'string' && sameAction(parsed, action)
  })
  return key ? turn.explain![key] : null
}

export type Verdict = { kind: 'right' } | { kind: 'mistake'; mistake: PuzzleMistake } | { kind: 'wrong' }

/**
 * Judge the reader's move. `before` is the position they moved from and
 * `after` the engine's result, so tests like 'safe' can look at the outcome.
 * A chain still in progress is judged only on the leg played so far.
 */
export function judge(
  spec: PuzzleSpec,
  turn: PuzzleTurn,
  before: EngineState,
  action: EngineAction,
  after: EngineState,
): Verdict {
  const listed = (step: string) => {
    const parsed = parseStep(step, before)
    return typeof parsed !== 'string' && sameAction(parsed, action)
  }
  if (turn.accept.some(listed)) return { kind: 'right' }
  if (turn.test && !after.chain.active) {
    if (turn.test === 'wins' && after.status.kind === 'win' && after.status.winner === 'player1') return { kind: 'right' }
    if (turn.test === 'safe' && after.status.kind === 'playing' && getCaptures(after.board, 'player2').length === 0) {
      return { kind: 'right' }
    }
  }
  const mistake = spec.mistakes?.find((m) => listed(m.play))
  return mistake ? { kind: 'mistake', mistake } : { kind: 'wrong' }
}
