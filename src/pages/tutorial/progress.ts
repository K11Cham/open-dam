import { useSyncExternalStore } from 'react'
import { STORAGE_KEYS, storage } from '../../services/storage'

/**
 * Which puzzles this browser has solved, so the chapter list can show
 * progress. Kept in local storage like the theme: it is a convenience, and
 * losing it costs nothing but a few ticks.
 */
const listeners = new Set<() => void>()
let solved: readonly string[] = storage.get<string[]>(STORAGE_KEYS.puzzles) ?? []

export const puzzleProgress = {
  get: (): readonly string[] => solved,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  markSolved(id: string) {
    if (solved.includes(id)) return
    solved = [...solved, id]
    storage.set(STORAGE_KEYS.puzzles, solved)
    for (const listener of listeners) listener()
  },
}

export const useSolvedPuzzles = () => useSyncExternalStore(puzzleProgress.subscribe, puzzleProgress.get, puzzleProgress.get)
