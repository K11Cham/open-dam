import { stretchPassword } from './account'
import type { GameSummary, LeaderboardEntry, PoolRating, PrivateUser, PublicUser, SessionInfo } from './account'

/**
 * The browser's side of the account routes in worker/index.ts. Every call
 * goes to this site's own server with its session cookie, which the server
 * set and the page cannot read. Passwords are stretched here
 * (`stretchPassword`) and only the result is sent.
 *
 * Failures throw an `ApiError` whose message is a sentence for people.
 */

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Accounts need the server to be this site: the session cookie belongs to
 * it. A static copy (hash routes, or a server configured elsewhere) plays
 * without accounts.
 */
export const accountsAvailable = (): boolean =>
  import.meta.env.VITE_ROUTER !== 'hash' && !((import.meta.env.VITE_MATCH_SERVER as string | undefined) ?? '')

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: unknown }) | null
  if (!response.ok) {
    throw new ApiError(response.status, typeof data?.error === 'string' ? data.error : 'Something went wrong. Try again.')
  }
  return (data ?? {}) as T
}

// -- Signing in and out ---------------------------------------------------------

export const fetchMe = () => call<{ user: PrivateUser | null }>('GET', '/api/me').then((r) => r.user)

export const usernameProblem = (name: string) =>
  call<{ problem: string | null }>('GET', `/api/auth/username?name=${encodeURIComponent(name)}`).then((r) => r.problem)

export async function signUp(username: string, password: string, displayName: string) {
  const key = await stretchPassword(username, password)
  return call<{ user: PrivateUser; recoveryCode: string }>('POST', '/api/auth/signup', { username, key, displayName })
}

export async function signIn(username: string, password: string) {
  const key = await stretchPassword(username, password)
  return call<{ user: PrivateUser }>('POST', '/api/auth/signin', { username, key }).then((r) => r.user)
}

export const signOut = () => call<object>('POST', '/api/auth/signout')

export async function recover(username: string, recoveryCode: string, newPassword: string) {
  const key = await stretchPassword(username, newPassword)
  return call<{ user: PrivateUser; recoveryCode: string }>('POST', '/api/auth/recover', { username, recoveryCode, key })
}

// -- The signed-in account ---------------------------------------------------------

export interface ProfileChanges {
  displayName?: string
  bio?: string
  avatar?: string
  showGames?: boolean
}

export const updateProfile = (changes: ProfileChanges) =>
  call<{ user: PrivateUser }>('PATCH', '/api/me', changes).then((r) => r.user)

export async function changePassword(username: string, current: string, next: string) {
  const [key, newKey] = await Promise.all([stretchPassword(username, current), stretchPassword(username, next)])
  await call<object>('POST', '/api/me/password', { key, newKey })
}

/** The password is salted with the username, so a new name needs the key made for it too. */
export async function changeUsername(username: string, password: string, newUsername: string) {
  const [key, newKey] = await Promise.all([stretchPassword(username, password), stretchPassword(newUsername, password)])
  return call<{ user: PrivateUser }>('POST', '/api/me/username', { key, newUsername, newKey }).then((r) => r.user)
}

export async function newRecoveryCode(username: string, password: string) {
  const key = await stretchPassword(username, password)
  return call<{ recoveryCode: string }>('POST', '/api/me/recovery-code', { key }).then((r) => r.recoveryCode)
}

export async function deleteAccount(username: string, password: string) {
  const key = await stretchPassword(username, password)
  await call<object>('DELETE', '/api/me', { key })
}

export const fetchSessions = () => call<{ sessions: SessionInfo[] }>('GET', '/api/me/sessions').then((r) => r.sessions)
export const revokeSession = (id: string) => call<object>('DELETE', `/api/me/sessions/${encodeURIComponent(id)}`)
export const revokeOtherSessions = () => call<object>('POST', '/api/me/sessions/revoke-others')

export type SyncedData = Record<string, { value: unknown; updatedAt: number }>
export const fetchData = () => call<{ data: SyncedData }>('GET', '/api/me/data').then((r) => r.data)
export const putData = (entries: SyncedData) => call<object>('PUT', '/api/me/data', { entries })

export interface ServerArchived {
  id: string
  finishedAt: number
  record: unknown
}
export const fetchArchive = () => call<{ games: ServerArchived[] }>('GET', '/api/me/archive').then((r) => r.games)
export const putArchived = (id: string, finishedAt: number, record: unknown) =>
  call<object>('PUT', `/api/me/archive/${encodeURIComponent(id)}`, { finishedAt, record })
export const clearArchive = () => call<object>('DELETE', '/api/me/archive')

/** Everything the server keeps for this account, as a JSON file's text. */
export const exportData = () => call<unknown>('GET', '/api/me/export').then((data) => JSON.stringify(data, null, 2))

// -- Public pages ---------------------------------------------------------------------

export interface Profile {
  user: PublicUser
  ratings: PoolRating[]
  totals: { games: number; wins: number; losses: number; draws: number }
  recent: GameSummary[] | null
}

export const fetchProfile = (username: string) => call<Profile>('GET', `/api/users/${encodeURIComponent(username)}`)

export const fetchGamesOf = (username: string, before?: number) =>
  call<{ games: GameSummary[] }>(
    'GET',
    `/api/users/${encodeURIComponent(username)}/games${before ? `?before=${before}` : ''}`,
  ).then((r) => r.games)

export const fetchGame = (id: string) =>
  call<{ summary: GameSummary; record: unknown }>('GET', `/api/games/${encodeURIComponent(id)}`)

export const fetchPools = () =>
  call<{ pools: Array<{ pool: string; players: number }> }>('GET', '/api/leaderboards').then((r) => r.pools)

export const fetchLeaderboard = (pool: string, offset = 0) =>
  call<{ pool: string; entries: LeaderboardEntry[]; total: number }>(
    'GET',
    `/api/leaderboards/${encodeURIComponent(pool)}${offset ? `?offset=${offset}` : ''}`,
  )

/** Where the matchmaking socket is: the site's own server, as for accounts. */
export const lobbySocketUrl = (): string => `${window.location.origin.replace(/^http/, 'ws')}/api/lobby/socket`
