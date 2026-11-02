/**
 * The service worker: saves the app on the device so it opens and plays with
 * no network, and installs as an app. Built to /sw.js by
 * scripts/vite-service-worker.ts, which fills in the two constants below.
 *
 * Updates wait. A new version installs in the background and then waits
 * until the page says so (the "new version" notice, src/pwa/pwa.ts), so a
 * game in progress is never reloaded from under the player.
 */
import { CACHE_PREFIX, SHELL_URL, strategyFor } from './policy'

declare const self: ServiceWorkerGlobalScope
/** Every built file to save, as site paths. */
declare const __PRECACHE__: string[]
/** Changes whenever any of those files does. */
declare const __VERSION__: string

const CACHE = `${CACHE_PREFIX}${__VERSION__}`

self.addEventListener('install', (event) => {
  // `reload` skips the browser's HTTP cache, so the saved copy is the one just deployed.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(__PRECACHE__.map((url) => new Request(url, { cache: 'reload' })))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name)
      }
      // The first visit's page is this version already; take it over so it works offline straight away.
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') void self.skipWaiting()
})

async function shell(request: Request): Promise<Response> {
  const saved = await caches.match(SHELL_URL, { cacheName: CACHE })
  return saved ?? fetch(request)
}

async function cacheFirst(request: Request): Promise<Response> {
  const saved = await caches.match(request)
  if (saved) return saved
  const response = await fetch(request)
  // Fonts in other alphabets arrive here the first time a page uses them, and are kept from then on.
  if (response.ok) {
    const copy = response.clone()
    void caches.open(CACHE).then((cache) => cache.put(request, copy))
  }
  return response
}

async function networkFirst(request: Request): Promise<Response> {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const copy = response.clone()
      void caches.open(CACHE).then((cache) => cache.put(request, copy))
    }
    return response
  } catch (error) {
    const saved = await caches.match(request)
    if (saved) return saved
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  switch (strategyFor(request, self.location.origin)) {
    case 'pass':
      return
    case 'shell':
      event.respondWith(shell(request))
      return
    case 'cache-first':
      event.respondWith(cacheFirst(request))
      return
    case 'network-first':
      event.respondWith(networkFirst(request))
      return
  }
})
