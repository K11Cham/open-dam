/**
 * The vocabulary of the game's sound. A theme gives one sound for every cue;
 * each sound is either a synthesis recipe (made here, in code, so nobody else
 * owns it) or a recorded file with its credit and licence written next to it.
 */

/** Everything the game makes a sound for. */
export type SoundCue = 'move' | 'capture' | 'crown' | 'call' | 'illegal' | 'offer' | 'win' | 'lose' | 'draw'

export const SOUND_CUES: SoundCue[] = ['move', 'capture', 'crown', 'call', 'illegal', 'offer', 'win', 'lose', 'draw']

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise'

/**
 * One layer of a synthesised sound: an oscillator (or noise) with a sharp
 * rise and an exponential fall, optionally filtered. Stacking a few of these
 * covers taps, thuds, bells, blips and little fanfares.
 */
export interface Voice {
  wave: Wave
  /** Pitch in Hz, or [start, end] for a glide. Noise ignores it. */
  freq?: number | [number, number]
  /** When this layer starts, in seconds from the start of the sound. */
  at?: number
  /** Seconds to reach full volume. */
  attack: number
  /** Seconds to fade from full volume to silence (−60 dB). */
  decay: number
  /** 0–1. */
  gain: number
  /** Cut everything above this many Hz (softens; turns noise into a thud). */
  lowpass?: number
  /** Cut everything below this many Hz (thins; turns noise into a hiss or a click). */
  highpass?: number
}

export interface SoundRecipe {
  voices: Voice[]
  /** Overall volume, 0–1. The renderer never lets the result clip. */
  gain?: number
}

/**
 * Licences a recorded sound may carry. The repository is public, so every
 * file in it is redistributed: only sounds anyone may copy without conditions
 * qualify. "Royalty-free" packs that forbid redistributing the raw files (the
 * GDC bundles, most stock sites) cannot go in here. See docs/SOUNDS.md.
 */
export type SoundLicence = 'CC0-1.0' | 'Own recording'

export interface SoundCredit {
  title: string
  author: string
  /** Where it was downloaded from, so the licence can be checked again later. */
  url: string
  licence: SoundLicence
}

/** A recorded sound file shipped with the app. */
export interface RecordedSound {
  /** The file's URL, from a Vite import (`import url from './sounds/move.ogg'`). */
  file: string
  credit: SoundCredit
  /** Played if the file cannot be loaded or decoded. */
  fallback?: SoundRecipe
}

export type SoundSource = SoundRecipe | RecordedSound

export type ThemeSounds = Record<SoundCue, SoundSource>

export const isRecorded = (source: SoundSource): source is RecordedSound => 'file' in source
