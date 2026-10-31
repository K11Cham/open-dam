import { useSyncExternalStore } from 'react'
import { STORAGE_KEYS, storage } from './storage'

/**
 * Preferences from the Settings page that are not the theme or the sound
 * (those have their own stores). Saved on the device, and kept in step with
 * the account when signed in, like the theme.
 */
export interface Preferences {
  /** 'system' follows the device's reduce-motion setting; 'reduce' always keeps animation to a minimum. */
  motion: 'system' | 'reduce'
  /** Queue a move while the other side is thinking, in games against the computer or online. */
  premoves: boolean
  /** Play the result banner when a game ends, before the summary. */
  resultSplash: boolean
  /** Show where the selected piece can go. */
  moveHints: boolean
}

export const DEFAULT_PREFERENCES: Preferences = { motion: 'system', premoves: true, resultSplash: true, moveHints: true }

/** Saved preferences are untrusted (old versions, other devices): each field is checked and defaulted. */
export const readPreferences = (value: unknown): Preferences => {
  const saved = (typeof value === 'object' && value !== null ? value : {}) as Partial<Record<keyof Preferences, unknown>>
  const flag = (key: 'premoves' | 'resultSplash' | 'moveHints') =>
    typeof saved[key] === 'boolean' ? (saved[key] as boolean) : DEFAULT_PREFERENCES[key]
  return {
    motion: saved.motion === 'reduce' ? 'reduce' : 'system',
    premoves: flag('premoves'),
    resultSplash: flag('resultSplash'),
    moveHints: flag('moveHints'),
  }
}

export const preferences = (() => {
  let current = readPreferences(storage.get(STORAGE_KEYS.prefs))
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of [...listeners]) listener()
  }
  // The account's copy arriving from another device replaces this one.
  storage.subscribe((key, origin) => {
    if (key !== STORAGE_KEYS.prefs || origin !== 'remote') return
    current = readPreferences(storage.get(STORAGE_KEYS.prefs))
    notify()
  })
  return {
    get: (): Preferences => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (changes: Partial<Preferences>) => {
      current = { ...current, ...changes }
      storage.set(STORAGE_KEYS.prefs, current)
      notify()
    },
  }
})()

export const usePreferences = (): Preferences => useSyncExternalStore(preferences.subscribe, preferences.get, preferences.get)
