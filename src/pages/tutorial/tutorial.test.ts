import { describe, expect, test } from 'vitest'
import { legalActions } from '../../game/engine'
import { getCaptures } from '../../game/moves'
import { coordToNotation } from '../../game/notation'
import { CHAPTERS } from './chapters'
import { judge, playSteps, puzzleStart } from './puzzle'
import { initialPosition, parseStep, playStep } from './script'

// Every scripted step in every chapter must be legal, and must not end the
// game unless the step's caption says so — the bug the first tutorial had.
describe('tutorial examples replay through the engine', () => {
  for (const chapter of CHAPTERS) {
    for (const section of chapter.sections) {
      if (!section.example) continue
      const example = section.example
      test(`${chapter.id} / ${section.heading}`, () => {
        let state = initialPosition(example)
        example.steps.forEach((step, index) => {
          const result = playStep(state, step)
          expect(result.error, `step ${index + 1} "${step.play}"`).toBeUndefined()
          state = result.state
          const isLast = index === example.steps.length - 1
          if (!isLast) expect(state.status.kind, `game ended early at step ${index + 1}`).toBe('playing')
        })
      })
    }
  }
})

// Puzzles are checked the same way: every answer is legal and judged right,
// every listed mistake is legal and judged a mistake, and every punishment
// and reply is a legal move. A puzzle that cannot be solved is worse than none.
describe('tutorial puzzles', () => {
  const puzzles = CHAPTERS.flatMap((c) => c.sections.flatMap((s) => (s.puzzle ? [{ chapter: c.id, puzzle: s.puzzle }] : [])))

  test('there are puzzles, and their ids are unique', () => {
    expect(puzzles.length).toBeGreaterThan(5)
    expect(new Set(puzzles.map((p) => p.puzzle.id)).size).toBe(puzzles.length)
  })

  for (const { chapter, puzzle } of puzzles) {
    test(`${chapter} / ${puzzle.id}`, () => {
      const start = puzzleStart(puzzle)
      expect(start.currentPlayer, 'the reader always plays the first side').toBe('player1')

      // Every accepted answer of every turn, along the first answer's line.
      let state = start
      puzzle.turns.forEach((turn, index) => {
        expect(turn.accept.length, `turn ${index + 1} has an answer`).toBeGreaterThan(0)
        for (const answer of turn.accept) {
          const action = parseStep(answer, state)
          expect(typeof action, answer).not.toBe('string')
          const after = playSteps(state, [answer])
          expect(judge(puzzle, turn, state, action as Exclude<typeof action, string>, after).kind, answer).toBe('right')
        }
        // Every explained answer's line replays from that answer.
        for (const [answer, { line }] of Object.entries(turn.explain ?? {})) {
          expect(turn.accept, `${answer} is explained but not accepted`).toContain(answer)
          playSteps(state, [answer, ...(line ?? [])])
        }
        state = playSteps(state, [turn.accept[0]])
        if (index < puzzle.turns.length - 1 || turn.reply) {
          expect(state.status.kind, `game ended early at turn ${index + 1}`).toBe('playing')
        }
        if (turn.reply) {
          expect(state.currentPlayer, `turn ${index + 1} ends the reader's turn`).toBe('player2')
          state = playSteps(state, [turn.reply])
          expect(state.currentPlayer, `the reply to turn ${index + 1} hands the move back`).toBe('player1')
        }
      })
      expect(state.chain.active, 'the solution finishes its chain').toBe(false)

      for (const mistake of puzzle.mistakes ?? []) {
        const action = parseStep(mistake.play, start)
        expect(typeof action, mistake.play).not.toBe('string')
        const after = playSteps(start, [mistake.play])
        expect(judge(puzzle, puzzle.turns[0], start, action as Exclude<typeof action, string>, after).kind, mistake.play).toBe(
          'mistake',
        )
        playSteps(after, mistake.punish ?? [])
      }
    })
  }
})

// A solution that hands the opponent a capture straight back teaches the wrong
// lesson. Two puzzles did: the chain crowned a king that the last enemy piece,
// crowned in turn, could jump at once.
test('no puzzle solution leaves the opponent an immediate capture', () => {
  for (const { puzzle } of CHAPTERS.flatMap((c) => c.sections).flatMap((s) => (s.puzzle ? [{ puzzle: s.puzzle }] : []))) {
    let state = puzzleStart(puzzle)
    for (const turn of puzzle.turns) {
      const line = turn.explain?.[turn.accept[0]]?.line ?? (turn.reply ? [turn.reply] : [])
      state = playSteps(state, [turn.accept[0], ...line])
    }
    if (state.status.kind !== 'playing' || state.currentPlayer !== 'player2') continue
    expect(getCaptures(state.board, 'player2'), puzzle.id).toEqual([])
  }
})

// The opening puzzle's answers come from the AI's book, so a re-measured book
// could accept a move nobody explained. Every first move must say why.
test('every 5×5 first move is explained in the opening puzzle', () => {
  const puzzle = CHAPTERS.flatMap((c) => c.sections).find((s) => s.puzzle?.id === 'plans-opening')!.puzzle!
  const start = puzzleStart(puzzle)
  const covered = [...Object.keys(puzzle.turns[0].explain ?? {}), ...(puzzle.mistakes ?? []).map((m) => m.play)]
  for (const action of legalActions(start)) {
    if (action.type !== 'move') continue
    const name = `${coordToNotation(action.from.row, action.from.col, 5)}-${coordToNotation(action.to.row, action.to.col, 5)}`
    expect(covered, name).toContain(name)
  }
  for (const answer of puzzle.turns[0].accept) expect(Object.keys(puzzle.turns[0].explain ?? {}), answer).toContain(answer)
})

test('chapter ids are unique', () => {
  expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTERS.length)
})
