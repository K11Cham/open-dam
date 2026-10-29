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

/**
 * Tones are built from their harmonics, and only up to here. A square or saw
 * drawn as a hard-edged shape has overtones above what the sample rate can
 * hold; they fold back down between the real harmonics as gritty, off-key
 * noise (aliasing), which is exactly the sound of a bitcrusher. Stopping well
 * below that limit also keeps the brightest waves from sizzling.
 */
const HARMONIC_LIMIT = 10_000

/** Every voice is rolled off above this unless its recipe asks for less, so noise does not hiss at the very top. */
const AIR_CUTOFF = 9_000

/**
 * A two-pole (12 dB/octave) Butterworth filter, from the RBJ audio EQ
 * cookbook. Steeper and more accurate near the top of the range than a
 * one-pole, which barely cuts anything close to half the sample rate.
 */
function biquad(type: 'lowpass' | 'highpass', cutoff: number, sampleRate: number) {
  const w = (2 * Math.PI * Math.min(cutoff, sampleRate * 0.45)) / sampleRate
  const cos = Math.cos(w)
  const alpha = Math.sin(w) * Math.SQRT1_2 // Q = 1/√2: flat, no resonant bump
  const a0 = 1 + alpha
  const edge = type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2
  const b0 = edge / a0
  const b1 = (type === 'lowpass' ? 1 - cos : -(1 + cos)) / a0
  const b2 = edge / a0
  const a1 = (-2 * cos) / a0
  const a2 = (1 - alpha) / a0
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  return (x: number) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}

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

/**
 * One sample of a wave at `freq`, summed from its harmonics up to the limit
 * (Fourier series), so it can never alias. sin(kx) for each harmonic comes
 * from a recurrence rather than a call to Math.sin, which keeps it cheap.
 */
function oscillator(wave: Voice['wave'], phase: number, freq: number): number {
  const x = 2 * Math.PI * phase
  if (wave === 'sine') return Math.sin(x)
  if (wave === 'noise') return 0
  const twoCos = 2 * Math.cos(x)
  let previous = 0 // sin(0·x)
  let current = Math.sin(x) // sin(1·x)
  let sum = 0
  for (let k = 1; k * freq < HARMONIC_LIMIT; k++) {
    // The top harmonics fade out as they near the limit, so a glide does not click as one crosses it.
    const fade = Math.min(1, (HARMONIC_LIMIT - k * freq) / (HARMONIC_LIMIT * 0.15))
    if (wave === 'saw') sum += (current / k) * fade
    else if (k % 2 === 1) {
      if (wave === 'square') sum += (current / k) * fade
      else sum += ((((k - 1) / 2) % 2 === 0 ? 1 : -1) * current * fade) / (k * k)
    }
    const next = twoCos * current - previous
    previous = current
    current = next
  }
  // Scaled so each wave peaks near ±1, then square and saw (rich in harmonics)
  // are turned down to sit level with a sine of the same gain.
  if (wave === 'square') return sum * (4 / Math.PI) * 0.6
  if (wave === 'saw') return sum * (2 / Math.PI) * 0.7
  return sum * (8 / Math.PI ** 2)
}

function addVoice(out: Float32Array, voice: Voice, index: number, sampleRate: number) {
  const start = Math.round((voice.at ?? 0) * sampleRate)
  const attack = Math.max(voice.attack, MIN_ATTACK)
  const span = attack + voice.decay
  const count = Math.ceil(span * sampleRate)
  const [from, to] = Array.isArray(voice.freq) ? voice.freq : [voice.freq ?? 440, voice.freq ?? 440]
  const noise = noiseSource(0x9e3779b9 + index * 0x85ebca6b)
  const lowpass = biquad('lowpass', Math.min(voice.lowpass ?? AIR_CUTOFF, AIR_CUTOFF), sampleRate)
  const highpass = voice.highpass ? biquad('highpass', voice.highpass, sampleRate) : null
  let phase = 0

  for (let i = 0; i < count && start + i < out.length; i++) {
    const t = i / sampleRate
    // Glides are exponential, which is how pitch is heard: equal steps per octave.
    const freq = from * (to / from) ** Math.min(1, t / span)
    phase = (phase + freq / sampleRate) % 1
    let x = voice.wave === 'noise' ? noise() : oscillator(voice.wave, phase, freq)
    x = lowpass(x)
    if (highpass) x = highpass(x)
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
