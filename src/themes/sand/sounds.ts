import type { ThemeSounds, Voice } from '../../audio/types'

/**
 * Sand is a game scratched into the ground with stones and sticks: soft thuds
 * of a stone pressed into sand, the dry clack of stone on stone, the hollow
 * knock of a stick, a seed shaker, and a thumb piano (a sine with a quick,
 * plucked decay) for the end of the game.
 */
const kalimba = (freq: number, at: number, decay = 0.7, gain = 0.4): Voice[] => [
  { wave: 'sine', freq, at, attack: 0.002, decay, gain },
  { wave: 'sine', freq: freq * 2, at, attack: 0.002, decay: decay * 0.2, gain: gain * 0.3 },
]

const shaker = (at: number, gain = 0.25): Voice => ({ wave: 'noise', at, attack: 0.012, decay: 0.07, gain, highpass: 3500 })

export const sounds: ThemeSounds = {
  move: {
    voices: [
      { wave: 'noise', attack: 0.004, decay: 0.08, gain: 0.6, lowpass: 450 },
      { wave: 'sine', freq: [130, 80], attack: 0.002, decay: 0.08, gain: 0.35 },
    ],
  },
  capture: {
    voices: [
      { wave: 'noise', attack: 0.001, decay: 0.025, gain: 0.5, highpass: 1200, lowpass: 5000 },
      { wave: 'noise', at: 0.035, attack: 0.001, decay: 0.02, gain: 0.35, highpass: 1500, lowpass: 5000 },
      { wave: 'noise', at: 0.02, attack: 0.004, decay: 0.1, gain: 0.5, lowpass: 400 },
    ],
  },
  crown: {
    voices: [
      { wave: 'sine', freq: 520, at: 0, attack: 0.001, decay: 0.08, gain: 0.35 },
      { wave: 'sine', freq: 1340, at: 0, attack: 0.001, decay: 0.03, gain: 0.15 },
      { wave: 'sine', freq: 620, at: 0.1, attack: 0.001, decay: 0.08, gain: 0.35 },
      { wave: 'sine', freq: 1600, at: 0.1, attack: 0.001, decay: 0.03, gain: 0.15 },
      ...kalimba(784, 0.2, 0.6),
    ],
  },
  call: {
    voices: [
      { wave: 'noise', attack: 0.001, decay: 0.03, gain: 0.5, highpass: 900, lowpass: 3000 },
      { wave: 'sine', freq: 700, attack: 0.001, decay: 0.05, gain: 0.25 },
      { wave: 'noise', at: 0.12, attack: 0.001, decay: 0.03, gain: 0.5, highpass: 900, lowpass: 3000 },
      { wave: 'sine', freq: 700, at: 0.12, attack: 0.001, decay: 0.05, gain: 0.25 },
    ],
  },
  illegal: {
    voices: [{ wave: 'noise', attack: 0.006, decay: 0.14, gain: 0.6, lowpass: 220 }],
  },
  offer: { voices: [shaker(0), shaker(0.09, 0.2)] },
  win: {
    voices: [
      shaker(0),
      shaker(0.12),
      ...kalimba(523, 0.12),
      ...kalimba(659, 0.26),
      ...kalimba(784, 0.4),
      ...kalimba(1047, 0.54, 1),
    ],
  },
  lose: {
    voices: [...kalimba(659, 0, 0.8, 0.35), ...kalimba(587, 0.22, 0.8, 0.35), ...kalimba(440, 0.44, 1.2, 0.35)],
  },
  draw: { voices: [...kalimba(587, 0, 0.9), ...kalimba(587, 0.24, 1.1)] },
}
