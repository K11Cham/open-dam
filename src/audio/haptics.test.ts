import { afterEach, describe, expect, test, vi } from 'vitest'
import { readPreferences } from '../services/preferences'
import { HAPTIC_PATTERNS, MAX_BUZZ_MS, buzz } from './haptics'
import { SOUND_CUES } from './types'

describe('haptics', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate')
  })

  test('every cue has a pattern, short enough to feel like a tap and not an alarm', () => {
    for (const cue of SOUND_CUES) {
      const pattern = HAPTIC_PATTERNS[cue]
      expect(pattern.length, cue).toBeGreaterThan(0)
      expect(
        pattern.reduce((sum, ms) => sum + ms, 0),
        cue,
      ).toBeLessThanOrEqual(MAX_BUZZ_MS)
    }
  })

  test('a step is felt on a device that can vibrate', () => {
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate })
    buzz('capture')
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.capture)
  })

  test('a device without vibration is left alone, and a refusing one does not throw', () => {
    expect(() => buzz('win')).not.toThrow()
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: () => {
        throw new Error('blocked')
      },
    })
    expect(() => buzz('win')).not.toThrow()
  })

  test('preferences saved before vibration existed turn it on', () => {
    expect(readPreferences({ motion: 'reduce', premoves: false, resultSplash: true, moveHints: true }).haptics).toBe(true)
    expect(readPreferences({ haptics: false }).haptics).toBe(false)
  })
})
