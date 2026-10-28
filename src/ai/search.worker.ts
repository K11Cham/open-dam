/// <reference lib="webworker" />
import { chooseAction } from './search'
import type { SearchRequest, SearchResponse } from './client'

/**
 * Runs the search off the main thread so the board stays responsive while the
 * computer thinks. The worker is stateless: every request carries the whole
 * position, which is plain JSON.
 */
self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { id, state, options } = event.data
  const result = chooseAction(state, options)
  const response: SearchResponse = { id, result }
  self.postMessage(response)
}
