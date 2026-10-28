import { describe, expect, test } from 'vitest'
import { CHAPTERS } from './chapters'
import { initialPosition, playStep } from './script'

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

test('chapter ids are unique', () => {
  expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTERS.length)
})
