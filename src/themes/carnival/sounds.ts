import type { ThemeSounds, Voice } from '../../audio/types'

/**
 * Carnival is a fairground: springy boings, bubbly pops, quick bright
 * arpeggios, a slide whistle when things go wrong, and a sparkle of high hiss
 * on a win, the way the board throws confetti.
 */
const note = (freq: number, at: number, decay = 0.12, gain = 0.4): Voice => ({
  wave: 'triangle',
  freq,
  at,
  attack: 0.003,
  decay,
  gain,
})

const sparkle = (at: number): Voice => ({ wave: 'noise', at, attack: 0.01, decay: 0.5, gain: 0.12, highpass: 6000 })

export const sounds: ThemeSounds = {
  move: {
    voices: [
      { wave: 'triangle', freq: [300, 620], attack: 0.003, decay: 0.1, gain: 0.5 },
      { wave: 'sine', freq: [600, 1240], attack: 0.003, decay: 0.06, gain: 0.15 },
    ],
  },
  capture: {
    voices: [
      { wave: 'sine', freq: [900, 140], attack: 0.002, decay: 0.12, gain: 0.6 },
      { wave: 'noise', attack: 0.001, decay: 0.04, gain: 0.3, highpass: 1500 },
    ],
  },
  crown: {
    voices: [note(523, 0), note(659, 0.05), note(784, 0.1), note(1047, 0.15), note(1319, 0.2, 0.35), sparkle(0.2)],
  },
  call: {
    voices: [
      { wave: 'sine', freq: [1200, 1900], attack: 0.01, decay: 0.16, gain: 0.45 },
      { wave: 'sine', freq: [1900, 1300], at: 0.16, attack: 0.005, decay: 0.2, gain: 0.45 },
    ],
  },
  illegal: {
    voices: [{ wave: 'saw', freq: [240, 150], attack: 0.01, decay: 0.28, gain: 0.5, lowpass: 900 }],
  },
  offer: { voices: [note(784, 0, 0.08), note(988, 0.07, 0.08), note(784, 0.14, 0.08), note(988, 0.21, 0.16)] },
  win: {
    voices: [
      note(523, 0, 0.14),
      note(659, 0.09, 0.14),
      note(784, 0.18, 0.14),
      note(1047, 0.27, 0.7, 0.45),
      { wave: 'saw', freq: 523, at: 0.27, attack: 0.01, decay: 0.7, gain: 0.15, lowpass: 2500 },
      sparkle(0.27),
      sparkle(0.5),
    ],
  },
  lose: {
    voices: [{ wave: 'sine', freq: [900, 180], attack: 0.02, decay: 0.9, gain: 0.5 }],
  },
  draw: {
    voices: [
      { wave: 'triangle', freq: [300, 520], attack: 0.003, decay: 0.14, gain: 0.45 },
      { wave: 'triangle', freq: [520, 300], at: 0.18, attack: 0.003, decay: 0.2, gain: 0.45 },
    ],
  },
}
