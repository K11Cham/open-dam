import type { RuleSettings } from '../game/types'
import { MATCH_ID_PATTERN } from './protocol'

/**
 * How the browser reaches the online server (worker/ in this repository).
 * By default the server is the site itself: the Worker serves both the app
 * and /api. `VITE_MATCH_SERVER` points a copy hosted elsewhere at a server.
 */

const configured = (import.meta.env.VITE_MATCH_SERVER as string | undefined) ?? ''

/**
 * A static copy (the hash-routed build, opened from a file host) has no
 * server of its own, so online play needs one configured.
 */
export const onlineAvailable = (): boolean => configured !== '' || import.meta.env.VITE_ROUTER !== 'hash'

const base = (): string => (configured || window.location.origin).replace(/\/$/, '')

export const matchSocketUrl = (matchId: string): string =>
  `${base().replace(/^http/, 'ws')}/api/matches/${encodeURIComponent(matchId)}/socket`

/** Ask the server for a new online game with these rules. Returns its id, or throws a message a person can read. */
export async function createOnlineMatch(settings: RuleSettings): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${base()}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })
  } catch {
    throw new Error('Could not reach the game server. Check your connection and try again.')
  }
  const body = (await response.json().catch(() => null)) as { id?: unknown; error?: unknown } | null
  if (!response.ok || typeof body?.id !== 'string' || !MATCH_ID_PATTERN.test(body.id)) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'The game server could not start a game.')
  }
  return body.id
}
