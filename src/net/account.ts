import { TIME_CONTROLS } from '../game/settings'

/**
 * Accounts: the shapes the server and the browser agree on, and the checks
 * both run, so a form can say what is wrong before anything is sent and the
 * server refuses the same things for anyone who skips the form.
 *
 * Passwords never leave the browser. `stretchPassword` turns one into a key
 * with PBKDF2 here, slowly, and only that key is sent; the server stores a
 * salted hash of the key. That keeps the slow part off the server (a free
 * Worker has milliseconds of CPU per request) while a stolen database still
 * costs an attacker the full PBKDF2 work for every guess.
 */

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 200
export const DISPLAY_NAME_MAX = 30
export const BIO_MAX = 200

/** Letters, digits, `_` and `-`, starting with a letter or digit, so names read cleanly in links (`/u/name`). */
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** Names that would pass for the site itself or for one of the computer opponents. */
const RESERVED = new Set([
  'admin',
  'administrator',
  'anonymous',
  'api',
  'doff',
  'guest',
  'khale',
  'lobby',
  'maam',
  'me',
  'moderator',
  'ndo',
  'null',
  'open-dam',
  'opendam',
  'root',
  'serin',
  'server',
  'settings',
  'support',
  'system',
  'undefined',
])

/** Usernames are unique regardless of case: `Kylar` and `kylar` are one account. */
export const usernameKey = (username: string): string => username.trim().toLowerCase()

/** Why a username cannot be used, or null if it can. */
export function checkUsername(value: unknown): string | null {
  if (typeof value !== 'string') return 'Choose a username.'
  const name = value.trim()
  if (name.length < USERNAME_MIN) return `A username needs at least ${USERNAME_MIN} characters.`
  if (name.length > USERNAME_MAX) return `A username can have at most ${USERNAME_MAX} characters.`
  if (!USERNAME_PATTERN.test(name)) return 'Use letters, digits, - and _ only, starting with a letter or digit.'
  if (RESERVED.has(usernameKey(name))) return 'That username is reserved.'
  return null
}

/** Why a password is too weak to use, or null if it will do. */
export function checkPassword(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return 'Choose a password.'
  if (value.length < PASSWORD_MIN) return `A password needs at least ${PASSWORD_MIN} characters.`
  if (value.length > PASSWORD_MAX) return `A password can have at most ${PASSWORD_MAX} characters.`
  return null
}

/** A display name with spacing tidied, or null if it is unusable (empty after tidying, or too long). */
export function cleanDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // Control characters and runs of spaces have no place in a name shown beside a board.
  // eslint-disable-next-line no-control-regex
  const controls = /[\u0000-\u001f\u007f]/g
  const name = value.replace(controls, '').replace(/\s+/g, ' ').trim()
  if (name.length === 0 || name.length > DISPLAY_NAME_MAX) return null
  return name
}

export function cleanBio(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const bio = value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim()
  return bio.length > BIO_MAX ? null : bio
}

/** A profile's colour, named by role so every theme draws it in its own palette. */
export const AVATAR_COLOURS = ['p1', 'p2', 'accent', 'highlight', 'ink'] as const
export type AvatarColour = (typeof AVATAR_COLOURS)[number]
export const isAvatarColour = (value: unknown): value is AvatarColour => AVATAR_COLOURS.includes(value as AvatarColour)

/** What anyone may see about a player. */
export interface PublicUser {
  id: string
  username: string
  displayName: string
  avatar: AvatarColour
  bio: string
  /** Epoch ms. */
  createdAt: number
}

/** What a player sees about themselves. */
export interface PrivateUser extends PublicUser {
  /** Whether other people can see this player's list of games. */
  showGames: boolean
}

/** One player's standing in one rating pool. */
export interface PoolRating {
  pool: string
  rating: number
  games: number
  wins: number
  losses: number
  draws: number
  peak: number
  /** Epoch ms of the last rated game in this pool. */
  lastPlayedAt: number
}

/** A player in an online game, as the room and the lists show them. */
export interface GamePlayer {
  id: string
  username: string
  displayName: string
  avatar: AvatarColour
}

/** One finished online game, without its moves. */
export interface GameSummary {
  id: string
  pool: string
  rated: boolean
  /** Epoch ms. */
  finishedAt: number
  players: Record<'player1' | 'player2', GamePlayer | null>
  /** 'player1', 'player2', or null for a draw. */
  winner: 'player1' | 'player2' | null
  /** The engine's reason for the result: a `WinReason` or `DrawReason` ('resignation', 'threefold'). */
  reason: string
  /** Moves and captures played (calls and resignations not counted). */
  plies: number
  /** Ratings before and after, for rated games. */
  ratings: Record<'player1' | 'player2', { before: number; after: number } | null>
}

export interface LeaderboardEntry {
  rank: number
  player: GamePlayer
  rating: number
  games: number
  wins: number
  losses: number
  draws: number
  peak: number
}

/** A device signed in to an account. */
export interface SessionInfo {
  id: string
  /** A short description of the browser, from its user agent. */
  device: string
  createdAt: number
  lastSeenAt: number
  current: boolean
}

// -- Rating pools --------------------------------------------------------------

/** The pools a leaderboard lists even before anyone has played in them: the board sizes people pick most, with each clock. */
export const FEATURED_POOLS: string[] = [5, 7, 9].flatMap((size) =>
  [...TIME_CONTROLS.map((tc) => tc.label), 'untimed'].map((clock) => `${size}x${size}:${clock}`),
)

const POOL_PATTERN = /^(\d{1,2})x\1:([0-9+]{3,6}|untimed)$/

export const isPool = (value: unknown): value is string => typeof value === 'string' && POOL_PATTERN.test(value)

/** "5×5 · 10+1" for "5x5:10+1". */
export function poolLabel(pool: string): string {
  const match = pool.match(POOL_PATTERN)
  if (!match) return pool
  const clock = match[2] === 'untimed' ? 'No clock' : match[2]
  return `${match[1]}×${match[1]} · ${clock}`
}

/** The board size a pool is played on. */
export const poolBoardSize = (pool: string): number => Number(pool.match(POOL_PATTERN)?.[1] ?? 0)

// -- Password stretching --------------------------------------------------------

/** Slow on purpose: about a quarter of a second in a browser, once per sign-in. */
export const STRETCH_ITERATIONS = 210_000

const hex = (bytes: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * The key sent in place of a password. Salted with the username, so the same
 * password gives a different key on every account and on no other site.
 */
export async function stretchPassword(username: string, password: string, iterations = STRETCH_ITERATIONS): Promise<string> {
  const encoder = new TextEncoder()
  const material = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(`open-dam/v1/${usernameKey(username)}`), iterations },
    material,
    256,
  )
  return hex(bits)
}

/** Stretched keys are 64 hex characters. */
export const isKey = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

/** Recovery codes are shown in four groups of five, without letters people confuse. */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A code typed back in: case and spacing ignored, dashes optional. */
export const normaliseRecoveryCode = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '')
