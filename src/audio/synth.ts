import type { SoundRecipe, Voice } from './types'

/**
 * Renders a sound recipe to samples, in plain arithmetic: no Web Audio, no
 * DOM. The browser copies the result into an AudioBuffer; the preview script
 * writes the same samples to WAV files; tests inspect them directly. The same
 * recipe therefore always sounds the same, everywhere.
 */

/** The longest any game sound may run, so a typo in a recipe cannot hold the speaker for minutes. */
export const MAX_SOUND_SECONDS = 3

/** Headroom below full scale, so layered voices never clip. */
const PEAK = 0.9

/** A short fade at the very end so the last sample does not click. */
const TAIL_FADE_SECONDS = 0.004

const MIN_ATTACK = 0.001

/** −60 dB, the usual "gone" point, reached at the end of `decay`. */
const DECAY_TO_SILENCE = Math.log(1000)

const voiceEnd = (voice: Voice) => (voice.at ?? 0) + Math.max(voice.attack, MIN_ATTACK) + voice.decay

export const recipeDuration = (recipe: SoundRecipe): number =>
  Math.min(MAX_SOUND_SECONDS, Math.max(0, ...recipe.voices.map(voiceEnd)))

/** One-pole filter coefficient for a cutoff frequency. Gentle (6 dB/octave), which suits these sounds. */
const onePole = (cutoff: number, sampleRate: number) => 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)

/** Small deterministic noise source, so a recipe renders the same every time. */
const noiseSource = (seed: number) => {
  let state = seed >>> 0 || 1
  return () => {
    // xorshift32
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return (state / 0xffffffff) * 2 - 1
  }
}

const oscillator = (wave: Voice['wave'], phase: number): number => {
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase)
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5)
    // Square and saw are full of harmonics; scaled down so they sit level with a sine of the same gain.
    case 'square':
      return phase < 0.5 ? 0.6 : -0.6
    case 'saw':
      return (2 * phase - 1) * 0.7
    case 'noise':
      return 0
  }
}

function addVoice(out: Float32Array, voice: Voice, index: number, sampleRate: number) {
  const start = Math.round((voice.at ?? 0) * sampleRate)
  const attack = Math.max(voice.attack, MIN_ATTACK)
  const span = attack + voice.decay
  const count = Math.ceil(span * sampleRate)
  const [from, to] = Array.isArray(voice.freq) ? voice.freq : [voice.freq ?? 440, voice.freq ?? 440]
  const noise = noiseSource(0x9e3779b9 + index * 0x85ebca6b)
  const low = voice.lowpass ? onePole(voice.lowpass, sampleRate) : 0
  const high = voice.highpass ? onePole(voice.highpass, sampleRate) : 0
  let phase = 0
  let lowState = 0
  let highState = 0

  for (let i = 0; i < count && start + i < out.length; i++) {
    const t = i / sampleRate
    // Glides are exponential, which is how pitch is heard: equal steps per octave.
    const freq = from * (to / from) ** Math.min(1, t / span)
    phase = (phase + freq / sampleRate) % 1
    let x = voice.wave === 'noise' ? noise() : oscillator(voice.wave, phase)
    if (voice.lowpass) {
      lowState += low * (x - lowState)
      x = lowState
    }
    if (voice.highpass) {
      highState += high * (x - highState)
      x -= highState
    }
    const envelope = t < attack ? t / attack : Math.exp((-DECAY_TO_SILENCE * (t - attack)) / voice.decay)
    out[start + i] += x * envelope * voice.gain
  }
}

export function renderRecipe(recipe: SoundRecipe, sampleRate = 44_100): Float32Array {
  const out = new Float32Array(Math.ceil(recipeDuration(recipe) * sampleRate))
  recipe.voices.forEach((voice, index) => addVoice(out, voice, index, sampleRate))

  let peak = 0
  for (const sample of out) peak = Math.max(peak, Math.abs(sample))
  const gain = recipe.gain ?? 1
  // Never louder than the headroom allows, however many voices pile up.
  const scale = peak * gain > PEAK ? PEAK / peak : gain
  const fadeFrom = out.length - Math.ceil(TAIL_FADE_SECONDS * sampleRate)
  for (let i = 0; i < out.length; i++) {
    const fade = i > fadeFrom ? (out.length - i) / (out.length - fadeFrom) : 1
    out[i] *= scale * fade
  }
  return out
}

/** 16-bit mono PCM WAV, for auditioning recipes outside the browser. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // bytes per second
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 0x7fff), true))
  return bytes
}
