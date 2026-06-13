/**
 * Storage abstraction layer
 * This can be replaced with Firebase or other backend storage in the future
 */

export type StorageKey = 
  | 'openDamBoard'
  | 'openDamCurrentPlayer'
  | 'openDamWinner'
  | 'openDamIsInChainCapture'
  | 'openDamHistory'
  | 'openDamChainStartIndex'
  | 'openDamUndoUsedThisTurn'
  | 'openDamGameConfig'

export interface StorageService {
  get<T>(key: StorageKey): T | null
  set<T>(key: StorageKey, value: T): void
  remove(key: StorageKey): void
  clear(): void
}

class LocalStorageService implements StorageService {
  get<T>(key: StorageKey): T | null {
    const item = localStorage.getItem(key)
    if (item === null) return null
    try {
      return JSON.parse(item) as T
    } catch {
      return null
    }
  }

  set<T>(key: StorageKey, value: T): void {
    localStorage.setItem(key, JSON.stringify(value))
  }

  remove(key: StorageKey): void {
    localStorage.removeItem(key)
  }

  clear(): void {
    localStorage.clear()
  }
}

// Export a singleton instance
export const storage = new LocalStorageService()
