import type { ThemeSounds, Voice } from '../../audio/types'

/**
 * Atelier is quiet and considered: a wooden piece set down on a board, soft
 * glass bells for the moments that matter. Sine tones, short filtered noise
 * for the wood, and bell partials (a tone plus a faint one 2.76× higher, the
 * ratio a struck bar rings at).
 */
const bell = (freq: number, at: number, decay = 0.9, gain = 0.4): Voice[] => [
  { wave: 'sine', freq, at, attack: 0.003, decay, gain },
  { wave: 'sine', freq: freq * 2.76, at, attack: 0.002, decay: decay * 0.35, gain: gain * 0.25 },
]

export const sounds: ThemeSounds = {
  move: {
    voices: [
      { wave: 'noise', attack: 0.001, decay: 0.035, gain: 0.5, lowpass: 1400, highpass: 300 },
      { wave: 'sine', freq: [820, 700], attack: 0.001, decay: 0.05, gain: 0.25 },
    ],
    gain: 0.7,
  },
  capture: {
    voices: [
      { wave: 'noise', attack: 0.001, decay: 0.06, gain: 0.55, lowpass: 900, highpass: 120 },
      { wave: 'sine', freq: [420, 300], attack: 0.001, decay: 0.09, gain: 0.35 },
      { wave: 'noise', at: 0.05, attack: 0.001, decay: 0.03, gain: 0.25, lowpass: 1600, highpass: 400 },
    ],
    gain: 0.75,
  },
  crown: { voices: [...bell(1047, 0, 0.8), ...bell(1568, 0.09, 1.1, 0.3)], gain: 0.6 },
  call: { voices: [...bell(880, 0, 0.5), ...bell(698, 0.14, 0.7)], gain: 0.6 },
  illegal: {
    voices: [{ wave: 'sine', freq: [180, 150], attack: 0.004, decay: 0.18, gain: 0.5, lowpass: 600 }],
    gain: 0.5,
  },
  offer: { voices: bell(1319, 0, 0.6, 0.35), gain: 0.5 },
  win: {
    voices: [...bell(523, 0, 1.6), ...bell(659, 0.12, 1.5), ...bell(784, 0.24, 1.4), ...bell(1047, 0.36, 1.6)],
    gain: 0.65,
  },
  lose: {
    voices: [...bell(587, 0, 1.2, 0.35), ...bell(523, 0.22, 1.2, 0.35), ...bell(440, 0.44, 1.6, 0.35)],
    gain: 0.55,
  },
  draw: { voices: [...bell(523, 0, 1.4), ...bell(784, 0.18, 1.4)], gain: 0.55 },
}
