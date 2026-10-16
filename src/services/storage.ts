/**
 * Thin persistence abstraction. Kept as a seam so a real backend can replace
 * localStorage later without touching callers.
 *
 * The previous version enumerated a fixed union of keys tied to the old
 * flattened game state (`openDamBoard`, `openDamChainStartIndex`, ...). The
 * engine state is now a single serialisable object, so one namespaced key per
 * concern is enough.
 */

export const STORAGE_KEYS = {
  theme: 'openDam.theme',
  resumeMatch: 'openDam.resumeMatch',
  lastSettings: 'openDam.lastSettings',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS] | string

export interface StorageService {
  get<T>(key: StorageKey): T | null
  set<T>(key: StorageKey, value: T): void
  remove(key: StorageKey): void
}

class LocalStorageService implements StorageService {
  get<T>(key: StorageKey): T | null {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  set<T>(key: StorageKey, value: T): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Quota or private-mode failures are not worth breaking a game over.
    }
  }

  remove(key: StorageKey): void {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  }
}

export const storage: StorageService = new LocalStorageService()
