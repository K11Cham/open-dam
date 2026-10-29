import type { ThemeSounds } from '../../audio/types'

/**
 * Neobrutalist sounds like the screen looks: blunt, dry, square-wave blips
 * with hard edges and no reverb, like an old console's menu clicks.
 */
export const sounds: ThemeSounds = {
  move: {
    voices: [
      { wave: 'square', freq: [240, 190], attack: 0.002, decay: 0.07, gain: 0.5, lowpass: 3000 },
      { wave: 'noise', attack: 0.001, decay: 0.02, gain: 0.25, highpass: 2000 },
    ],
  },
  capture: {
    voices: [
      { wave: 'square', freq: [320, 80], attack: 0.002, decay: 0.16, gain: 0.6, lowpass: 2500 },
      { wave: 'noise', attack: 0.001, decay: 0.08, gain: 0.45, lowpass: 1800 },
    ],
  },
  crown: {
    voices: [
      { wave: 'square', freq: 523, at: 0, attack: 0.002, decay: 0.09, gain: 0.4 },
      { wave: 'square', freq: 659, at: 0.07, attack: 0.002, decay: 0.09, gain: 0.4 },
      { wave: 'square', freq: 784, at: 0.14, attack: 0.002, decay: 0.09, gain: 0.4 },
      { wave: 'square', freq: 1047, at: 0.21, attack: 0.002, decay: 0.2, gain: 0.4 },
    ],
  },
  call: {
    voices: [
      { wave: 'square', freq: 880, at: 0, attack: 0.002, decay: 0.1, gain: 0.45 },
      { wave: 'square', freq: 660, at: 0.11, attack: 0.002, decay: 0.1, gain: 0.45 },
      { wave: 'square', freq: 880, at: 0.22, attack: 0.002, decay: 0.14, gain: 0.45 },
    ],
  },
  illegal: {
    voices: [
      { wave: 'square', freq: 110, at: 0, attack: 0.002, decay: 0.09, gain: 0.5, lowpass: 1200 },
      { wave: 'square', freq: 104, at: 0.1, attack: 0.002, decay: 0.12, gain: 0.5, lowpass: 1200 },
    ],
  },
  offer: {
    voices: [
      { wave: 'square', freq: 660, attack: 0.002, decay: 0.12, gain: 0.4, lowpass: 4000 },
      { wave: 'square', freq: 990, at: 0.09, attack: 0.002, decay: 0.16, gain: 0.3, lowpass: 4000 },
    ],
  },
  win: {
    voices: [
      { wave: 'square', freq: 523, at: 0, attack: 0.002, decay: 0.12, gain: 0.4 },
      { wave: 'square', freq: 659, at: 0.1, attack: 0.002, decay: 0.12, gain: 0.4 },
      { wave: 'square', freq: 784, at: 0.2, attack: 0.002, decay: 0.12, gain: 0.4 },
      { wave: 'square', freq: 1047, at: 0.3, attack: 0.002, decay: 0.5, gain: 0.45 },
      { wave: 'square', freq: 523, at: 0.3, attack: 0.002, decay: 0.5, gain: 0.25 },
    ],
  },
  lose: {
    voices: [
      { wave: 'square', freq: 392, at: 0, attack: 0.002, decay: 0.16, gain: 0.4, lowpass: 2500 },
      { wave: 'square', freq: 330, at: 0.16, attack: 0.002, decay: 0.16, gain: 0.4, lowpass: 2500 },
      { wave: 'square', freq: 262, at: 0.32, attack: 0.002, decay: 0.16, gain: 0.4, lowpass: 2500 },
      { wave: 'square', freq: [196, 180], at: 0.48, attack: 0.002, decay: 0.6, gain: 0.45, lowpass: 2000 },
    ],
  },
  draw: {
    voices: [
      { wave: 'square', freq: 440, at: 0, attack: 0.002, decay: 0.18, gain: 0.4, lowpass: 3000 },
      { wave: 'square', freq: 440, at: 0.2, attack: 0.002, decay: 0.3, gain: 0.4, lowpass: 3000 },
    ],
  },
}
