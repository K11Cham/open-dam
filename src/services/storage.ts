/**
 * Thin persistence abstraction over localStorage. Every call is wrapped,
 * because storage can be missing or throw (private windows, blocked site data,
 * a full quota) and none of those should break a game.
 *
 * Keys in use:
 *   openDam.theme          theme choice
 *   openDam.sound          sound effects on or off, and their volume
 *   openDam.prefs          preferences from the Settings page (motion, premoves, ...)
 *   openDam.lastSetup      the last New Game form (rules, opponent, side)
 *   openDam.puzzles        which tutorial puzzles are solved
 *   openDam.activeMatch    the unfinished match, as a replayable record
 *   openDam.archive        the last 50 finished matches
 *   openDam.syncMeta       when each synced key last changed on this device
 *   openDam.clientId       (sessionStorage) this tab's id for online play
 *
 * Every change is announced to subscribers with where it came from: `local`
 * (this device) or `remote` (the account's copy, arriving from the server).
 * The account sync (src/net/accountSync.ts) sends local changes up, and the
 * modules that keep a value in memory re-read it after a remote one.
 */

export const STORAGE_KEYS = {
  theme: 'openDam.theme',
  sound: 'openDam.sound',
  prefs: 'openDam.prefs',
  lastSetup: 'openDam.lastSetup',
  puzzles: 'openDam.puzzles',
  activeMatch: 'openDam.activeMatch',
  archive: 'openDam.archive',
  syncMeta: 'openDam.syncMeta',
  /** The signed-in account as last heard from the server, so the app opens signed in without a network. */
  account: 'openDam.account',
} as const

export type ChangeOrigin = 'local' | 'remote'
export type StorageListener = (key: string, origin: ChangeOrigin) => void

export interface StorageService {
  get<T>(key: string): T | null
  set<T>(key: string, value: T, origin?: ChangeOrigin): void
  remove(key: string, origin?: ChangeOrigin): void
  /** Hear about every change; returns an unsubscribe function. */
  subscribe(listener: StorageListener): () => void
}

const safeLocalStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

class LocalStorageService implements StorageService {
  private listeners = new Set<StorageListener>()

  private announce(key: string, origin: ChangeOrigin) {
    for (const listener of [...this.listeners]) listener(key, origin)
  }

  subscribe(listener: StorageListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get<T>(key: string): T | null {
    try {
      const raw = safeLocalStorage()?.getItem(key) ?? null
      return raw === null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T, origin: ChangeOrigin = 'local'): void {
    try {
      safeLocalStorage()?.setItem(key, JSON.stringify(value))
    } catch {
      // Quota or private-mode failures are not worth breaking a game over.
    }
    this.announce(key, origin)
  }

  remove(key: string, origin: ChangeOrigin = 'local'): void {
    try {
      safeLocalStorage()?.removeItem(key)
    } catch {
      // Same as above.
    }
    this.announce(key, origin)
  }
}

export const storage: StorageService = new LocalStorageService()
