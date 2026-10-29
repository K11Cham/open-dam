import { STORAGE_KEYS, storage } from '../services/storage'
import { renderRecipe } from './synth'
import { isRecorded } from './types'
import type { SoundRecipe, SoundSource } from './types'

/**
 * Plays sounds through Web Audio. Each sound is rendered (or downloaded and
 * decoded) once and kept, so a busy game costs nothing after the first move.
 * Browsers only allow audio after the person has interacted with the page;
 * until then `play` quietly does nothing.
 */

export interface SoundSettings {
  enabled: boolean
  /** 0–1. */
  volume: number
}

const DEFAULT_SETTINGS: SoundSettings = { enabled: true, volume: 0.6 }

const readSettings = (): SoundSettings => {
  const saved = storage.get<Partial<SoundSettings>>(STORAGE_KEYS.sound)
  const volume = typeof saved?.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : DEFAULT_SETTINGS.volume
  return { enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : DEFAULT_SETTINGS.enabled, volume }
}

/** The sound setting as a tiny external store, so every component reading it stays in step. */
export const soundSettings = (() => {
  let current = readSettings()
  const listeners = new Set<() => void>()
  return {
    get: (): SoundSettings => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (next: SoundSettings) => {
      current = next
      storage.set(STORAGE_KEYS.sound, next)
      for (const listener of [...listeners]) listener()
    },
  }
})()

type AudioContextConstructor = typeof AudioContext

class SoundPlayer {
  private context: AudioContext | null = null
  private buffers = new WeakMap<SoundSource, Promise<AudioBuffer | null>>()

  private audio(): AudioContext | null {
    if (this.context) return this.context
    const Context: AudioContextConstructor | undefined =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext)
    if (!Context) return null
    try {
      this.context = new Context()
    } catch {
      return null
    }
    return this.context
  }

  private fromRecipe(recipe: SoundRecipe, context: AudioContext): AudioBuffer {
    const samples = renderRecipe(recipe, context.sampleRate)
    const buffer = context.createBuffer(1, Math.max(1, samples.length), context.sampleRate)
    buffer.getChannelData(0).set(samples)
    return buffer
  }

  private async load(source: SoundSource, context: AudioContext): Promise<AudioBuffer | null> {
    if (!isRecorded(source)) return this.fromRecipe(source, context)
    try {
      const response = await fetch(source.file)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await context.decodeAudioData(await response.arrayBuffer())
    } catch {
      return source.fallback ? this.fromRecipe(source.fallback, context) : null
    }
  }

  private bufferFor(source: SoundSource, context: AudioContext) {
    let buffer = this.buffers.get(source)
    if (!buffer) {
      buffer = this.load(source, context)
      this.buffers.set(source, buffer)
    }
    return buffer
  }

  async play(source: SoundSource, volume: number) {
    const context = this.audio()
    if (!context) return
    try {
      // Succeeds once the page has had a click or key press; before that the sound is skipped.
      if (context.state === 'suspended') await context.resume()
      if (context.state !== 'running') return
      const buffer = await this.bufferFor(source, context)
      if (!buffer) return
      const node = context.createBufferSource()
      const gain = context.createGain()
      node.buffer = buffer
      gain.gain.value = volume
      node.connect(gain).connect(context.destination)
      node.start()
    } catch {
      // Sound is a nicety: a failure here must never interrupt a game.
    }
  }
}

export const soundPlayer = new SoundPlayer()
