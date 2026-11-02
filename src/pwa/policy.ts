/**
 * What the service worker does with each request, and which built files it
 * saves on install. Plain functions, shared by the service worker
 * (serviceWorker.ts), the build step that lists the files
 * (scripts/vite-service-worker.ts) and their tests.
 *
 * The rule of thumb: everything the app needs to start and to play without a
 * network is saved on the device; anything about accounts or online games
 * always goes to the server, untouched, so it is never stale and never
 * mixed up between people.
 */

/** Every cache this app makes starts with this, so a new version can clear the old ones and no one else's. */
export const CACHE_PREFIX = 'open-dam-'

/**
 * The built app's page, served for every page of the app (React Router draws
 * the rest). Saved as `/`, not `/index.html`: Cloudflare answers
 * `/index.html` with a redirect to `/`, and a browser refuses a saved
 * redirect as a page.
 */
export const SHELL_URL = '/'

export type Strategy =
  /** Not the service worker's business: the browser goes to the network as if there were no worker. */
  | 'pass'
  /** A page of the app: the saved index.html, so it opens with no network. */
  | 'shell'
  /** A built file whose name carries its content hash: saved copies never go stale. */
  | 'cache-first'
  /** Anything else of ours (icons, the manifest): fresh when online, the saved copy when not. */
  | 'network-first'

export interface RequestFacts {
  method: string
  /** `Request.mode`; 'navigate' for a page load. */
  mode: string
  url: string
}

export function strategyFor({ method, mode, url }: RequestFacts, origin: string): Strategy {
  if (method !== 'GET') return 'pass'
  const parsed = new URL(url)
  if (parsed.origin !== origin) return 'pass'
  // Accounts, games, the lobby and their sockets are always live.
  if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) return 'pass'
  // The browser checks for a new worker itself; a saved copy would hide updates.
  if (parsed.pathname === '/sw.js') return 'pass'
  if (mode === 'navigate') return 'shell'
  if (parsed.pathname.startsWith('/assets/')) return 'cache-first'
  return 'network-first'
}

/**
 * Whether a built file is saved when the app is installed. Fonts come in many
 * alphabets; only the Latin ones (which the app's text uses) are saved up
 * front, and the rest the first time a page needs one. The older .woff copies
 * are for browsers too old to have service workers.
 */
export function shouldPrecache(fileName: string): boolean {
  if (fileName.endsWith('.woff')) return false
  if (fileName.endsWith('.woff2')) return /-latin-(?!ext)/.test(fileName)
  return /\.(js|css|html|svg|png|ico|webmanifest)$/.test(fileName)
}
