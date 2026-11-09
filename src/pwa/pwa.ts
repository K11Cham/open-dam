import { STORAGE_KEYS } from '../services/storage'
/**
 * The app as an installed, offline-capable app: registers the service worker
 * (serviceWorker.ts), and tracks what the page shows about it. Read it in
 * React with `usePwa` (src/hooks/usePwa.ts).
 *
 *  - `offlineReady`: the app is saved on this device and opens without a network.
 *  - `updateReady`: a new version is saved and waiting. It is used only when
 *    the player says so (`applyUpdate`), which reloads the page; a game in
 *    progress is saved, so nothing is lost, but the reload is still theirs to
 *    choose.
 *  - `canInstall`: the browser offered to install the app (Chrome, Edge,
 *    Android), so a button can ask it to (`promptInstall`).
 *  - `installed`: running as the installed app.
 *  - `online`: whether the browser thinks it has a network.
 */

export interface PwaState {
  offlineReady: boolean
  updateReady: boolean
  canInstall: boolean
  installed: boolean
  online: boolean
}

/** Chrome's install prompt, which no standard type describes yet. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** How often an open app asks whether a new version is out. */
const UPDATE_CHECK_MS = 60 * 60_000

const browser = typeof window !== 'undefined' && typeof navigator !== 'undefined'

/** Whether finished games are saved on this device (the archive kept by src/match/storage.ts). */
const hasArchivedGames = (): boolean => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.archive)
    return saved !== null && saved !== '[]'
  } catch {
    return false
  }
}

const standalone = (): boolean =>
  browser &&
  (window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

let state: PwaState = {
  offlineReady: false,
  updateReady: false,
  canInstall: false,
  installed: standalone(),
  online: browser ? navigator.onLine : true,
}
const listeners = new Set<() => void>()
let installPrompt: InstallPromptEvent | null = null
let registration: ServiceWorkerRegistration | null = null
let reloading = false

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch }
  for (const listener of [...listeners]) listener()
}

export const getPwaState = (): PwaState => state
export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** iPhones and iPads install from Safari's Share menu only; there is no prompt to show. */
export function isAppleMobile(): boolean {
  if (!browser) return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Tell the waiting version to take over; the page reloads into it. */
export function applyUpdate() {
  const waiting = registration?.waiting
  if (!waiting) return
  reloading = true
  waiting.postMessage({ type: 'skip-waiting' })
}

/** "Later": hide the notice for now. The waiting version is offered again the next time the app opens. */
export const dismissUpdate = () => set({ updateReady: false })

/** Ask the browser to install the app. Resolves to whether the player agreed. */
export async function promptInstall(): Promise<boolean> {
  const prompt = installPrompt
  if (!prompt) return false
  installPrompt = null
  set({ canInstall: false })
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  return outcome === 'accepted'
}

function watch(worker: ServiceWorker) {
  worker.addEventListener('statechange', () => {
    // A worker that installs while another controls the page is an update; the first one just makes the app work offline.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) set({ updateReady: true })
  })
}

let persistenceAsked = false

/**
 * Ask the browser to keep this site's storage rather than clear it when the
 * device runs short of space: the saved games and the offline copy of the
 * app. Asked once per visit, and only once there is something worth keeping
 * (a finished game) or the app is installed, since some browsers decide from
 * how the site is used. Resolves to whether storage is kept, or null where the
 * browser cannot say.
 */
export async function keepStorage(): Promise<boolean | null> {
  if (persistenceAsked || !browser) return null
  const manager = (navigator as Navigator & { storage?: StorageManager }).storage
  if (!manager?.persist) return null
  persistenceAsked = true
  try {
    return (await manager.persisted?.()) ? true : await manager.persist()
  } catch {
    return null
  }
}

/** For tests: forget that storage was asked for. */
export const resetKeepStorage = () => {
  persistenceAsked = false
}

/** Start everything; called once from main.tsx. */
export function startPwa() {
  if (!browser) return

  window.addEventListener('online', () => set({ online: true }))
  window.addEventListener('offline', () => set({ online: false }))
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini-bar away; Settings offers the install instead.
    event.preventDefault()
    installPrompt = event as InstallPromptEvent
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    set({ canInstall: false, installed: true })
    void keepStorage()
  })
  // Installed, or with finished games already saved: ask to keep them now.
  if (state.installed || hasArchivedGames()) void keepStorage()

  // Not in development (the dev server's files change on every save) or in the static copy (opened from a folder).
  if (!import.meta.env.PROD || import.meta.env.MODE === 'static' || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) window.location.reload()
  })
  void navigator.serviceWorker.ready.then(() => set({ offlineReady: true }))

  // Registered after the page has loaded, so saving the app never competes with opening it.
  const register = () =>
    navigator.serviceWorker
      .register('/sw.js')
      .then((found) => {
        registration = found
        if (found.waiting && navigator.serviceWorker.controller) set({ updateReady: true })
        if (found.installing) watch(found.installing)
        found.addEventListener('updatefound', () => {
          if (found.installing) watch(found.installing)
        })
        const check = () => void found.update().catch(() => {})
        window.setInterval(check, UPDATE_CHECK_MS)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check()
        })
      })
      .catch(() => {
        // Without a worker the app still runs; it just needs the network to open.
      })
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
