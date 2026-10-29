import { describe, expect, test } from 'vitest'
import type { GameEvent } from '../game/types'
import { THEMES, THEME_KEYS } from '../themes/registry'
import { cueForStep } from './cues'
import { MAX_SOUND_SECONDS, encodeWav, recipeDuration, renderRecipe } from './synth'
import { SOUND_CUES, isRecorded } from './types'
import type { SoundRecipe } from './types'

const RATE = 8_000
/** Theme sounds are checked at a real playback rate: their high-pass hisses sit above what 8 kHz can hold. */
const PLAYBACK_RATE = 44_100

const peak = (samples: Float32Array) => samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0)

/** How strong one frequency is in a stretch of samples (Goertzel over a Hann window). */
const level = (samples: Float32Array, rate: number, freq: number) => {
  const w = (2 * Math.PI * freq) / rate
  const coeff = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < samples.length; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples.length - 1))
    const s0 = samples[i] * hann + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2)
}

const decibels = (ratio: number) => 20 * Math.log10(ratio)
const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / Math.max(1, samples.length))

describe('synth', () => {
  const blip: SoundRecipe = { voices: [{ wave: 'square', freq: [400, 200], attack: 0.01, decay: 0.2, gain: 1 }] }

  test('renders the recipe for exactly as long as its voices last', () => {
    expect(recipeDuration(blip)).toBeCloseTo(0.21)
    expect(renderRecipe(blip, RATE)).toHaveLength(Math.ceil(recipeDuration(blip) * RATE))
  })

  test('never clips, however many loud voices are stacked', () => {
    const loud: SoundRecipe = { voices: Array.from({ length: 8 }, () => ({ ...blip.voices[0], gain: 1 })), gain: 1 }
    expect(peak(renderRecipe(loud, RATE))).toBeLessThanOrEqual(0.9 + 1e-6)
  })

  test('renders the same samples every time, noise included', () => {
    const hiss: SoundRecipe = { voices: [{ wave: 'noise', attack: 0.001, decay: 0.1, gain: 0.5, highpass: 2000 }] }
    expect(renderRecipe(hiss, RATE)).toEqual(renderRecipe(hiss, RATE))
  })

  test('a voice starting later is silent until its time', () => {
    const late: SoundRecipe = { voices: [{ wave: 'sine', freq: 440, at: 0.1, attack: 0.01, decay: 0.1, gain: 0.5 }] }
    const samples = renderRecipe(late, RATE)
    expect(peak(samples.subarray(0, Math.floor(0.1 * RATE)))).toBe(0)
    expect(peak(samples.subarray(Math.floor(0.1 * RATE)))).toBeGreaterThan(0.1)
  })

  test('a runaway recipe is cut off', () => {
    const endless: SoundRecipe = { voices: [{ wave: 'sine', freq: 440, attack: 0.01, decay: 60, gain: 0.5 }] }
    expect(recipeDuration(endless)).toBe(MAX_SOUND_SECONDS)
  })

  // Aliasing is what makes a synthesised square or saw sound gritty and "bitcrushed": overtones
  // above what the sample rate can hold fold back down as tones between the real harmonics.
  test.each(['square', 'saw', 'triangle'] as const)('a %s wave has nothing between its harmonics', (wave) => {
    const f0 = 1234
    const tone = renderRecipe({ voices: [{ wave, freq: f0, attack: 0.001, decay: 10, gain: 0.5 }] }, PLAYBACK_RATE)
    const steady = tone.subarray(441, 441 + 8192)
    const fundamental = level(steady, PLAYBACK_RATE, f0)
    let worst = 0
    for (let f = 200; f < 9000; f += 37) {
      const nearestHarmonic = Math.round(f / f0) * f0
      if (Math.abs(f - nearestHarmonic) < 150) continue
      worst = Math.max(worst, level(steady, PLAYBACK_RATE, f))
    }
    expect(decibels(worst / fundamental)).toBeLessThan(-50)
  })

  test('nothing sizzles above 14 kHz', () => {
    const hiss: SoundRecipe = { voices: [{ wave: 'noise', attack: 0.001, decay: 1, gain: 0.5, highpass: 2000 }] }
    const samples = renderRecipe(hiss, PLAYBACK_RATE).subarray(441, 441 + 8192)
    const presence = level(samples, PLAYBACK_RATE, 4000)
    const sizzle = level(samples, PLAYBACK_RATE, 18000)
    expect(decibels(sizzle / presence)).toBeLessThan(-12)
  })

  test('encodes a playable 16-bit WAV', () => {
    const wav = encodeWav(renderRecipe(blip, RATE), RATE)
    const view = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE')
    expect(view.getUint32(24, true)).toBe(RATE)
    expect(view.getUint32(40, true)).toBe(wav.length - 44)
  })
})

describe('which sound a step makes', () => {
  const at = { row: 0, col: 0 }
  const piece = { id: 'p', player: 'player2' as const, isKing: false }
  const move: GameEvent = { type: 'move', player: 'player1', pieceId: 'a', from: at, to: at, isKing: false }
  const capture: GameEvent = { type: 'capture', player: 'player1', pieceId: 'a', captured: piece, at }
  const crown: GameEvent = { type: 'promotion', player: 'player1', pieceId: 'a', at, deferred: false }
  const won: GameEvent = { type: 'win', winner: 'player1', reason: 'no-pieces' }

  test('the most important event wins', () => {
    expect(cueForStep([move], [], ['player1'])).toBe('move')
    expect(cueForStep([move, capture], [], ['player1'])).toBe('capture')
    expect(cueForStep([move, capture, crown], [], ['player1'])).toBe('crown')
    expect(cueForStep([move, capture, won], [], ['player1'])).toBe('win')
    expect(cueForStep([{ type: 'call', caller: 'player2', removed: [] }, move], [], ['player1'])).toBe('call')
    expect(cueForStep([], [{ type: 'offer-made', kind: 'draw', by: 'player2' }], ['player1'])).toBe('offer')
    expect(cueForStep([{ type: 'turn-change', player: 'player2' }], [], ['player1'])).toBeNull()
  })

  test('a result is a win or a loss for whoever is listening', () => {
    expect(cueForStep([won], [], ['player1'])).toBe('win')
    expect(cueForStep([won], [], ['player2'])).toBe('lose')
    // Pass and play: nobody here lost.
    expect(cueForStep([won], [], ['player1', 'player2'])).toBe('win')
    expect(cueForStep([{ type: 'tie', reason: 'threefold' }], [], ['player1'])).toBe('draw')
  })

  test('endings can be left out (the analysis board)', () => {
    expect(cueForStep([capture, won], [], [], { endings: false })).toBe('capture')
  })
})

describe('theme sounds', () => {
  test.each(THEME_KEYS)('%s has a sound for every cue, audible and short', (key) => {
    for (const cue of SOUND_CUES) {
      const source = THEMES[key].sounds[cue]
      expect(source, `${key}.${cue}`).toBeDefined()
      if (isRecorded(source)) continue
      const samples = renderRecipe(source, PLAYBACK_RATE)
      expect(samples.length, `${key}.${cue} length`).toBeGreaterThan(0)
      expect(recipeDuration(source), `${key}.${cue} duration`).toBeLessThan(2.5)
      expect(rms(samples), `${key}.${cue} loudness`).toBeGreaterThan(0.005)
    }
  })

  test('recorded sounds say where they came from and under what licence', () => {
    for (const key of THEME_KEYS) {
      for (const cue of SOUND_CUES) {
        const source = THEMES[key].sounds[cue]
        if (!isRecorded(source)) continue
        expect(source.credit.url, `${key}.${cue}`).toMatch(/^https?:\/\//)
        expect(source.credit.author, `${key}.${cue}`).not.toBe('')
      }
    }
  })

  test('every theme sounds different', () => {
    const moves = THEME_KEYS.map((key) => {
      const source = THEMES[key].sounds.move
      return isRecorded(source) ? source.file : renderRecipe(source, RATE).join(',')
    })
    expect(new Set(moves).size).toBe(THEME_KEYS.length)
  })
})
