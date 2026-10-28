import type { EngineState } from '../game/types'
import type { Difficulty } from './difficulty'
import { chooseAction } from './search'
import type { SearchOptions, SearchResult } from './search'

export interface SearchRequest {
  id: number
  state: EngineState
  options: Omit<SearchOptions, 'random'>
}

export interface SearchResponse {
  id: number
  result: SearchResult | null
}

export const searchOptionsFor = (difficulty: Difficulty): Omit<SearchOptions, 'random'> => ({
  depth: difficulty.depth,
  profile: difficulty.profile,
  timeBudgetMs: difficulty.timeBudgetMs,
  quiescenceDepth: difficulty.quiescenceDepth,
  noise: difficulty.noise,
  blunderChance: difficulty.blunderChance,
  blunderMargin: difficulty.blunderMargin,
  missCallChance: difficulty.missCallChance,
  callAware: difficulty.callAware,
  forcingExtensions: difficulty.forcingExtensions,
})

let worker: Worker | null = null
let workerFailed = false
let nextId = 1
const pending = new Map<number, (result: SearchResult | null) => void>()

const getWorker = (): Worker | null => {
  if (workerFailed || typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<SearchResponse>) => {
      const resolve = pending.get(event.data.id)
      pending.delete(event.data.id)
      resolve?.(event.data.result)
    }
    worker.onerror = () => {
      // A worker that fails to load (old browser, CSP) falls back to the main
      // thread for this and every later search.
      workerFailed = true
      worker?.terminate()
      worker = null
      for (const [id, resolve] of pending) {
        pending.delete(id)
        resolve(null)
      }
    }
    return worker
  } catch {
    workerFailed = true
    return null
  }
}

/**
 * Ask the engine for a move without blocking the page. Uses a Web Worker when
 * the browser has one and falls back to running inline otherwise (tests, very
 * old browsers). The result is `null` when there is nothing to play.
 */
export function searchAsync(state: EngineState, options: Omit<SearchOptions, 'random'>): Promise<SearchResult | null> {
  const target = getWorker()
  if (!target) {
    return new Promise((resolve) => setTimeout(() => resolve(chooseAction(state, options)), 0))
  }
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, (result) => {
      // The worker failed mid-flight: run this one inline instead.
      if (result === null && workerFailed) resolve(chooseAction(state, options))
      else resolve(result)
    })
    const request: SearchRequest = { id, state, options }
    target.postMessage(request)
  })
}
