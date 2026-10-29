/**
 * Thin persistence abstraction over localStorage. Every call is wrapped,
 * because storage can be missing or throw (private windows, blocked site data,
 * a full quota) and none of those should break a game.
 *
 * Keys in use:
 *   openDam.theme          theme choice
 *   openDam.sound          sound effects on or off, and their volume
 *   openDam.lastSetup      the last New Game form (rules, opponent, side)
 *   openDam.activeMatch    the unfinished match, as a replayable record
 *   openDam.archive        the last 20 finished matches
 *   openDam.clientId       (sessionStorage) this tab's id for online play
 */

export const STORAGE_KEYS = {
  theme: 'openDam.theme',
  sound: 'openDam.sound',
  lastSetup: 'openDam.lastSetup',
  puzzles: 'openDam.puzzles',
} as const

export interface StorageService {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): void
  remove(key: string): void
}

const safeLocalStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

class LocalStorageService implements StorageService {
  get<T>(key: string): T | null {
    try {
      const raw = safeLocalStorage()?.getItem(key) ?? null
      return raw === null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): void {
    try {
      safeLocalStorage()?.setItem(key, JSON.stringify(value))
    } catch {
      // Quota or private-mode failures are not worth breaking a game over.
    }
  }

  remove(key: string): void {
    try {
      safeLocalStorage()?.removeItem(key)
    } catch {
      // Same as above.
    }
  }
}

export const storage: StorageService = new LocalStorageService()
