import { serverBase } from './api'

/**
 * Crashes in the app, reported to the server's logs (`POST
 * /api/client-errors`, worker/errors.ts) so the owner hears about them. A
 * report holds the page's path and the error's message, nothing else: no
 * query string, no account, no game.
 *
 * Only the deployed app reports (not the dev server, the tests, or a static
 * copy hosted elsewhere, whose server would refuse it), and at most a few
 * different errors per page load, so a loop of the same failure is one report.
 */

const MAX_REPORTS_PER_LOAD = 5

let enabled = import.meta.env.PROD && import.meta.env.MODE !== 'static'
const sent = new Set<string>()

/** For tests: report even outside a production build. */
export const setErrorReporting = (on: boolean) => {
  enabled = on
  sent.clear()
}

export type ClientErrorKind = 'error' | 'unhandledrejection' | 'render'

export function reportClientError(kind: ClientErrorKind, message: string) {
  if (!enabled || typeof window === 'undefined') return
  const text = message.trim().slice(0, 500) || 'Unknown error'
  if (sent.has(text) || sent.size >= MAX_REPORTS_PER_LOAD) return
  sent.add(text)
  try {
    void fetch(`${serverBase()}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, route: window.location.pathname, message: text }),
      // Still sent if the page is closing.
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Reporting must never be the thing that breaks.
  }
}

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'A promise failed with no message.'

/** Listen for uncaught errors and failed promises; called once from main.tsx. */
export function startErrorReporting() {
  window.addEventListener('error', (event) => reportClientError('error', event.message || messageOf(event.error)))
  window.addEventListener('unhandledrejection', (event) => reportClientError('unhandledrejection', messageOf(event.reason)))
}
