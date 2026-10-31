import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Server tests (worker/) run on plain Node, without a document or storage.
const browserLike = typeof window !== 'undefined'

afterEach(() => {
  if (!browserLike) return
  cleanup()
  localStorage.clear()
})

// jsdom has no ResizeObserver or matchMedia; the board and theme code use both.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

if (browserLike && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
