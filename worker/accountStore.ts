import {
  checkUsername,
  cleanBio,
  cleanDisplayName,
  isAvatarColour,
  isKey,
  normaliseRecoveryCode,
  RECOVERY_ALPHABET,
  usernameKey,
} from '../src/net/account'
import type {
  AvatarColour,
  GamePlayer,
  GameSummary,
  LeaderboardEntry,
  PoolRating,
  PrivateUser,
  PublicUser,
  SessionInfo,
} from '../src/net/account'
import { INITIAL_RATING, rateGame } from '../src/match/rating'

/**
 * Everything the server knows about people: accounts, signed-in devices,
 * ratings, finished online games, and the settings and history each person
 * keeps in step across devices. It is plain logic over a SQL connection, so
 * the tests run it on Node's SQLite and the Accounts Durable Object
 * (accounts.ts) runs it on Cloudflare's.
 *
 * Every method that changes data does its slow work (hashing) first and its
 * reads and writes after, without awaiting in between. A Durable Object runs
 * one piece of synchronous code at a time, so each of those blocks is atomic:
 * two people can never both take the last free username.
 */

export type SqlValue = string | number | null

/** The part of a SQL connection this store needs: run one statement, get its rows. */
export interface Sql {
  exec<T = Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): T[]
}

/** A request that was refused, with the HTTP status and a sentence for people. */
export interface Refusal {
  ok: false
  status: number
  error: string
}
export type Result<T> = ({ ok: true } & T) | Refusal

const refuse = (status: number, error: string): Refusal => ({ ok: false, status, error })

/** Where a request came from, for throttling and the list of signed-in devices. */
export interface RequestContext {
  ip: string
  userAgent: string
}

export interface StoreOptions {
  now?: () => number
  /** Fills a byte array with random bytes; injectable for tests. */
  randomBytes?: (bytes: Uint8Array) => Uint8Array
}

/** A finished online game, as the match room reports it. */
export interface FinishedGame {
  id: string
  pool: string
  rated: boolean
  finishedAt: number
  /** Account ids in each seat; null for a seat played without an account. */
  players: Record<'player1' | 'player2', string | null>
  winner: 'player1' | 'player2' | null
  reason: string
  plies: number
  /** The match record, as JSON. */
  record: string
}

export type RatingChanges = Record<'player1' | 'player2', { before: number; after: number } | null>

// -- Limits ----------------------------------------------------------------------

const SESSION_DAYS = 60
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000
/** A session's last-seen time is written at most this often, so reading a page is not a write. */
const TOUCH_MS = 10 * 60 * 1000
/** Sign-in attempts allowed per username in a window before it locks for the rest of the window. */
const MAX_FAILURES = 8
const FAILURE_WINDOW_MS = 15 * 60 * 1000
/** New accounts allowed from one address per hour. */
const MAX_SIGNUPS_PER_HOUR = 5
/** Finished local games kept per account; the oldest go first. */
export const ARCHIVE_LIMIT = 200
const MAX_RECORD_CHARS = 200_000
const MAX_DATA_CHARS = 64_000
/** Settings a browser may keep on the server. Anything else is refused, so the table holds only what the app reads. */
export const DATA_KEYS = ['theme', 'sound', 'lastSetup', 'puzzles', 'prefs'] as const
export type DataKey = (typeof DATA_KEYS)[number]
const MAX_SESSIONS = 20

// -- Rows --------------------------------------------------------------------------

interface UserRow {
  id: string
  username: string
  display_name: string
  avatar: string
  bio: string
  show_games: number
  created_at: number
  key_salt: string
  key_hash: string
  recovery_hash: string
}

interface GameRow {
  id: string
  pool: string
  rated: number
  finished_at: number
  player1_id: string | null
  player2_id: string | null
  winner: string | null
  reason: string
  plies: number
  p1_before: number | null
  p1_after: number | null
  p2_before: number | null
  p2_after: number | null
}

interface RatingRow {
  pool: string
  rating: number
  games: number
  wins: number
  losses: number
  draws: number
  peak: number
  last_played_at: number
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    show_games INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    key_salt TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    recovery_hash TEXT NOT NULL,
    signup_ip TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    device TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS failures (
    username_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    first_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ratings (
    user_id TEXT NOT NULL,
    pool TEXT NOT NULL,
    rating INTEGER NOT NULL,
    games INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    draws INTEGER NOT NULL,
    peak INTEGER NOT NULL,
    last_played_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, pool)
  )`,
  `CREATE INDEX IF NOT EXISTS ratings_board ON ratings (pool, rating DESC)`,
  `CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    pool TEXT NOT NULL,
    rated INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    player1_id TEXT,
    player2_id TEXT,
    winner TEXT,
    reason TEXT NOT NULL,
    plies INTEGER NOT NULL,
    p1_before INTEGER,
    p1_after INTEGER,
    p2_before INTEGER,
    p2_after INTEGER,
    record TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS games_p1 ON games (player1_id, finished_at DESC)`,
  `CREATE INDEX IF NOT EXISTS games_p2 ON games (player2_id, finished_at DESC)`,
  `CREATE TABLE IF NOT EXISTS user_data (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS archive (
    user_id TEXT NOT NULL,
    id TEXT NOT NULL,
    finished_at INTEGER NOT NULL,
    record TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS archive_recent ON archive (user_id, finished_at DESC)`,
]

// -- Helpers -------------------------------------------------------------------------

const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

const sha256 = async (text: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

/** Compare two strings in time that does not depend on where they differ. */
const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** "Chrome on Windows", from a user agent, for the list of signed-in devices. */
export function describeDevice(userAgent: string): string {
  const ua = userAgent || ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser'
  const system = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  return system ? `${browser} on ${system}` : browser
}

const publicUser = (row: UserRow): PublicUser => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  avatar: isAvatarColour(row.avatar) ? row.avatar : 'accent',
  bio: row.bio,
  createdAt: row.created_at,
})

const privateUser = (row: UserRow): PrivateUser => ({ ...publicUser(row), showGames: row.show_games === 1 })

const gamePlayer = (row: UserRow | undefined): GamePlayer | null =>
  row ? { id: row.id, username: row.username, displayName: row.display_name, avatar: publicUser(row).avatar } : null

const ratingFromRow = (row: RatingRow): PoolRating => ({
  pool: row.pool,
  rating: row.rating,
  games: row.games,
  wins: row.wins,
  losses: row.losses,
  draws: row.draws,
  peak: row.peak,
  lastPlayedAt: row.last_played_at,
})

export interface ProfilePatch {
  displayName?: unknown
  bio?: unknown
  avatar?: unknown
  showGames?: unknown
}

export interface Profile {
  user: PublicUser
  ratings: PoolRating[]
  totals: { games: number; wins: number; losses: number; draws: number }
  /** Recent games, or null when the player keeps them private. */
  recent: GameSummary[] | null
}

export class AccountStore {
  private readonly sql: Sql
  private readonly now: () => number
  private readonly randomBytes: (bytes: Uint8Array) => Uint8Array

  constructor(sql: Sql, options: StoreOptions = {}) {
    this.sql = sql
    this.now = options.now ?? Date.now
    this.randomBytes = options.randomBytes ?? ((bytes) => crypto.getRandomValues(bytes))
    for (const statement of SCHEMA) this.sql.exec(statement)
  }

  // -- Ids and secrets --------------------------------------------------------

  private randomText(length: number, alphabet = ID_ALPHABET): string {
    // Bytes past the last whole multiple of the alphabet's length are skipped, so every letter is equally likely.
    const limit = 256 - (256 % alphabet.length)
    let out = ''
    while (out.length < length) {
      for (const byte of this.randomBytes(new Uint8Array(length * 2))) {
        if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length]
      }
    }
    return out
  }

  private newRecoveryCode(): string {
    return this.randomText(20, RECOVERY_ALPHABET).match(/.{5}/g)!.join('-')
  }

  private async keyHash(salt: string, key: string) {
    return sha256(`${salt}:${key}`)
  }

  // -- Look-ups ---------------------------------------------------------------

  private userById(id: string): UserRow | undefined {
    return this.sql.exec<UserRow>('SELECT * FROM users WHERE id = ?', id)[0]
  }

  private userByName(username: string): UserRow | undefined {
    return this.sql.exec<UserRow>('SELECT * FROM users WHERE username_key = ?', usernameKey(username))[0]
  }

  /** Why a username cannot be taken, or null if it is free. */
  usernameProblem(username: unknown): string | null {
    const problem = checkUsername(username)
    if (problem) return problem
    return this.userByName(username as string) ? 'That username is taken.' : null
  }

  me(userId: string): PrivateUser | null {
    const row = this.userById(userId)
    return row ? privateUser(row) : null
  }

  // -- Sessions ----------------------------------------------------------------

  /** Start a session for a user and return its token, which only the browser keeps. */
  private async startSession(userId: string, context: RequestContext): Promise<string> {
    const token = toHex(this.randomBytes(new Uint8Array(32)))
    const tokenHash = await sha256(token)
    const t = this.now()
    this.sql.exec(
      'INSERT INTO sessions (id, token_hash, user_id, device, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      this.randomText(12),
      tokenHash,
      userId,
      describeDevice(context.userAgent),
      t,
      t,
      t + SESSION_MS,
    )
    // A person signed in on very many devices keeps the newest ones.
    this.sql.exec(
      `DELETE FROM sessions WHERE user_id = ? AND id NOT IN
        (SELECT id FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT ?)`,
      userId,
      userId,
      MAX_SESSIONS,
    )
    return token
  }

  /** The signed-in user for a session token, or null. Using a session keeps it alive. */
  async authenticate(token: string): Promise<{ user: PrivateUser; sessionId: string } | null> {
    if (!/^[0-9a-f]{64}$/.test(token)) return null
    const tokenHash = await sha256(token)
    const t = this.now()
    const session = this.sql.exec<{ id: string; user_id: string; last_seen_at: number; expires_at: number }>(
      'SELECT id, user_id, last_seen_at, expires_at FROM sessions WHERE token_hash = ?',
      tokenHash,
    )[0]
    if (!session) return null
    if (session.expires_at <= t) {
      this.sql.exec('DELETE FROM sessions WHERE id = ?', session.id)
      return null
    }
    const user = this.userById(session.user_id)
    if (!user) return null
    if (t - session.last_seen_at > TOUCH_MS) {
      this.sql.exec('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', t, t + SESSION_MS, session.id)
    }
    return { user: privateUser(user), sessionId: session.id }
  }

  async signOut(token: string) {
    if (!/^[0-9a-f]{64}$/.test(token)) return
    this.sql.exec('DELETE FROM sessions WHERE token_hash = ?', await sha256(token))
  }

  sessions(userId: string, currentId: string): SessionInfo[] {
    return this.sql
      .exec<{ id: string; device: string; created_at: number; last_seen_at: number }>(
        'SELECT id, device, created_at, last_seen_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC',
        userId,
        this.now(),
      )
      .map((row) => ({
        id: row.id,
        device: row.device,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        current: row.id === currentId,
      }))
  }

  /** Sign one device out. A person can only end their own sessions. */
  revokeSession(userId: string, sessionId: string): boolean {
    const found = this.sql.exec('SELECT id FROM sessions WHERE id = ? AND user_id = ?', sessionId, userId).length > 0
    this.sql.exec('DELETE FROM sessions WHERE id = ? AND user_id = ?', sessionId, userId)
    return found
  }

  revokeOtherSessions(userId: string, keepId: string) {
    this.sql.exec('DELETE FROM sessions WHERE user_id = ? AND id != ?', userId, keepId)
  }

  // -- Throttling ----------------------------------------------------------------

  /** Minutes until this username may try again, or 0 if it may try now. */
  private lockedFor(name: string): number {
    const row = this.sql.exec<{ count: number; first_at: number }>(
      'SELECT count, first_at FROM failures WHERE username_key = ?',
      usernameKey(name),
    )[0]
    if (!row) return 0
    const left = row.first_at + FAILURE_WINDOW_MS - this.now()
    if (left <= 0) {
      this.sql.exec('DELETE FROM failures WHERE username_key = ?', usernameKey(name))
      return 0
    }
    return row.count >= MAX_FAILURES ? Math.ceil(left / 60_000) : 0
  }

  private noteFailure(name: string) {
    const key = usernameKey(name)
    const t = this.now()
    const row = this.sql.exec<{ count: number }>('SELECT count FROM failures WHERE username_key = ?', key)[0]
    if (row) this.sql.exec('UPDATE failures SET count = count + 1 WHERE username_key = ?', key)
    else this.sql.exec('INSERT INTO failures (username_key, count, first_at) VALUES (?, 1, ?)', key, t)
  }

  private lockedRefusal(minutes: number): Refusal {
    return refuse(429, `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`)
  }

  // -- Accounts ------------------------------------------------------------------

  async signUp(
    input: { username: unknown; key: unknown; displayName?: unknown },
    context: RequestContext,
  ): Promise<Result<{ user: PrivateUser; token: string; recoveryCode: string }>> {
    const nameProblem = checkUsername(input.username)
    if (nameProblem) return refuse(400, nameProblem)
    if (!isKey(input.key)) return refuse(400, 'The password could not be read. Reload the page and try again.')
    const username = (input.username as string).trim()
    const displayName =
      input.displayName === undefined || input.displayName === '' ? username : cleanDisplayName(input.displayName)
    if (displayName === null) return refuse(400, 'A display name needs between 1 and 30 characters.')

    const salt = this.randomText(24)
    const recoveryCode = this.newRecoveryCode()
    const [keyHash, recoveryHash, ipHash] = await Promise.all([
      this.keyHash(salt, input.key),
      sha256(normaliseRecoveryCode(recoveryCode)),
      sha256(`ip:${context.ip}`),
    ])

    // From here to the insert nothing is awaited, so the name cannot be taken in between.
    if (this.userByName(username)) return refuse(409, 'That username is taken.')
    const hourAgo = this.now() - 60 * 60 * 1000
    const recent = this.sql.exec<{ n: number }>(
      'SELECT COUNT(*) AS n FROM users WHERE signup_ip = ? AND created_at > ?',
      ipHash,
      hourAgo,
    )[0].n
    if (context.ip && recent >= MAX_SIGNUPS_PER_HOUR)
      return refuse(429, 'Too many new accounts from this network. Try again later.')

    const id = this.randomText(12)
    const avatars: AvatarColour[] = ['p1', 'p2', 'accent', 'highlight']
    this.sql.exec(
      `INSERT INTO users (id, username, username_key, display_name, avatar, bio, show_games, created_at, key_salt, key_hash, recovery_hash, signup_ip)
       VALUES (?, ?, ?, ?, ?, '', 1, ?, ?, ?, ?, ?)`,
      id,
      username,
      usernameKey(username),
      displayName,
      avatars[this.randomBytes(new Uint8Array(1))[0] % avatars.length],
      this.now(),
      salt,
      keyHash,
      recoveryHash,
      ipHash,
    )
    const token = await this.startSession(id, context)
    return { ok: true, user: privateUser(this.userById(id)!), token, recoveryCode }
  }

  async signIn(
    input: { username: unknown; key: unknown },
    context: RequestContext,
  ): Promise<Result<{ user: PrivateUser; token: string }>> {
    if (typeof input.username !== 'string' || !isKey(input.key)) return refuse(400, 'Enter your username and password.')
    const locked = this.lockedFor(input.username)
    if (locked) return this.lockedRefusal(locked)
    const row = this.userByName(input.username)
    // Hash even for an unknown name, so the answer takes as long either way and does not reveal which names exist.
    const hash = await this.keyHash(row?.key_salt ?? 'no-such-user', input.key)
    if (!row || !sameText(hash, row.key_hash)) {
      this.noteFailure(input.username)
      return refuse(401, 'That username and password do not match.')
    }
    this.sql.exec('DELETE FROM failures WHERE username_key = ?', usernameKey(input.username))
    const token = await this.startSession(row.id, context)
    return { ok: true, user: privateUser(row), token }
  }

  /** Check a signed-in person's password again before something that cannot be undone. */
  private async confirmKey(row: UserRow, key: unknown): Promise<Refusal | null> {
    if (!isKey(key)) return refuse(400, 'Enter your current password.')
    const locked = this.lockedFor(row.username)
    if (locked) return this.lockedRefusal(locked)
    if (!sameText(await this.keyHash(row.key_salt, key), row.key_hash)) {
      this.noteFailure(row.username)
      return refuse(403, 'Your current password is not right.')
    }
    return null
  }

  async changePassword(userId: string, sessionId: string, key: unknown, newKey: unknown): Promise<Result<object>> {
    const row = this.userById(userId)
    if (!row) return refuse(401, 'Sign in again.')
    const wrong = await this.confirmKey(row, key)
    if (wrong) return wrong
    if (!isKey(newKey)) return refuse(400, 'The new password could not be read.')
    const salt = this.randomText(24)
    const hash = await this.keyHash(salt, newKey)
    this.sql.exec('UPDATE users SET key_salt = ?, key_hash = ? WHERE id = ?', salt, hash, userId)
    // Anyone else who knew the old password is signed out everywhere but here.
    this.revokeOtherSessions(userId, sessionId)
    return { ok: true }
  }

  /**
   * A new username. The password's key is salted with the username, so the
   * browser sends the key for the new name too, made from the same password.
   */
  async changeUsername(
    userId: string,
    key: unknown,
    newUsername: unknown,
    newKey: unknown,
  ): Promise<Result<{ user: PrivateUser }>> {
    const row = this.userById(userId)
    if (!row) return refuse(401, 'Sign in again.')
    const wrong = await this.confirmKey(row, key)
    if (wrong) return wrong
    const problem = checkUsername(newUsername)
    if (problem) return refuse(400, problem)
    if (!isKey(newKey)) return refuse(400, 'The password could not be read.')
    const name = (newUsername as string).trim()
    const salt = this.randomText(24)
    const hash = await this.keyHash(salt, newKey)
    const holder = this.userByName(name)
    if (holder && holder.id !== userId) return refuse(409, 'That username is taken.')
    // Keeping the old display name only if the person had customised it; otherwise it follows the username.
    const displayName = row.display_name === row.username ? name : row.display_name
    this.sql.exec(
      'UPDATE users SET username = ?, username_key = ?, display_name = ?, key_salt = ?, key_hash = ? WHERE id = ?',
      name,
      usernameKey(name),
      displayName,
      salt,
      hash,
      userId,
    )
    return { ok: true, user: privateUser(this.userById(userId)!) }
  }

  async replaceRecoveryCode(userId: string, key: unknown): Promise<Result<{ recoveryCode: string }>> {
    const row = this.userById(userId)
    if (!row) return refuse(401, 'Sign in again.')
    const wrong = await this.confirmKey(row, key)
    if (wrong) return wrong
    const recoveryCode = this.newRecoveryCode()
    this.sql.exec('UPDATE users SET recovery_hash = ? WHERE id = ?', await sha256(normaliseRecoveryCode(recoveryCode)), userId)
    return { ok: true, recoveryCode }
  }

  /** A forgotten password: the recovery code proves who it is, and is used up. Every other device is signed out. */
  async recover(
    input: { username: unknown; recoveryCode: unknown; key: unknown },
    context: RequestContext,
  ): Promise<Result<{ user: PrivateUser; token: string; recoveryCode: string }>> {
    if (typeof input.username !== 'string' || typeof input.recoveryCode !== 'string')
      return refuse(400, 'Enter your username and recovery code.')
    if (!isKey(input.key)) return refuse(400, 'The new password could not be read.')
    const locked = this.lockedFor(input.username)
    if (locked) return this.lockedRefusal(locked)
    const codeHash = await sha256(normaliseRecoveryCode(input.recoveryCode))
    const row = this.userByName(input.username)
    if (!row || !sameText(codeHash, row.recovery_hash)) {
      this.noteFailure(input.username)
      return refuse(401, 'That username and recovery code do not match.')
    }
    const salt = this.randomText(24)
    const recoveryCode = this.newRecoveryCode()
    const [hash, nextCodeHash] = await Promise.all([this.keyHash(salt, input.key), sha256(normaliseRecoveryCode(recoveryCode))])
    this.sql.exec('UPDATE users SET key_salt = ?, key_hash = ?, recovery_hash = ? WHERE id = ?', salt, hash, nextCodeHash, row.id)
    this.sql.exec('DELETE FROM sessions WHERE user_id = ?', row.id)
    this.sql.exec('DELETE FROM failures WHERE username_key = ?', usernameKey(input.username))
    const token = await this.startSession(row.id, context)
    return { ok: true, user: privateUser(this.userById(row.id)!), token, recoveryCode }
  }

  updateProfile(userId: string, patch: ProfilePatch): Result<{ user: PrivateUser }> {
    const row = this.userById(userId)
    if (!row) return refuse(401, 'Sign in again.')
    let displayName = row.display_name
    let bio = row.bio
    let avatar = row.avatar
    let showGames = row.show_games
    if (patch.displayName !== undefined) {
      const clean = cleanDisplayName(patch.displayName)
      if (clean === null) return refuse(400, 'A display name needs between 1 and 30 characters.')
      displayName = clean
    }
    if (patch.bio !== undefined) {
      const clean = cleanBio(patch.bio)
      if (clean === null) return refuse(400, 'A bio can have at most 200 characters.')
      bio = clean
    }
    if (patch.avatar !== undefined) {
      if (!isAvatarColour(patch.avatar)) return refuse(400, 'Pick one of the colours shown.')
      avatar = patch.avatar
    }
    if (patch.showGames !== undefined) {
      if (typeof patch.showGames !== 'boolean') return refuse(400, 'Choose whether your games are shown.')
      showGames = patch.showGames ? 1 : 0
    }
    this.sql.exec(
      'UPDATE users SET display_name = ?, bio = ?, avatar = ?, show_games = ? WHERE id = ?',
      displayName,
      bio,
      avatar,
      showGames,
      userId,
    )
    return { ok: true, user: privateUser(this.userById(userId)!) }
  }

  /**
   * Delete an account and everything kept for it. Finished games stay in the
   * opponent's history, with this side shown as a deleted player.
   */
  async deleteAccount(userId: string, key: unknown): Promise<Result<object>> {
    const row = this.userById(userId)
    if (!row) return refuse(401, 'Sign in again.')
    const wrong = await this.confirmKey(row, key)
    if (wrong) return wrong
    for (const table of ['sessions', 'ratings', 'user_data', 'archive']) {
      this.sql.exec(`DELETE FROM ${table} WHERE user_id = ?`, userId)
    }
    this.sql.exec('DELETE FROM users WHERE id = ?', userId)
    return { ok: true }
  }

  // -- Settings kept in step across devices ----------------------------------------

  data(userId: string): Record<string, { value: unknown; updatedAt: number }> {
    const out: Record<string, { value: unknown; updatedAt: number }> = {}
    for (const row of this.sql.exec<{ key: string; value: string; updated_at: number }>(
      'SELECT key, value, updated_at FROM user_data WHERE user_id = ?',
      userId,
    )) {
      try {
        out[row.key] = { value: JSON.parse(row.value), updatedAt: row.updated_at }
      } catch {
        // A value that no longer parses is skipped; the next save replaces it.
      }
    }
    return out
  }

  /** Save some settings. Each keeps whichever copy was changed last, so an old device cannot undo a newer change. */
  putData(userId: string, entries: unknown): Result<object> {
    if (typeof entries !== 'object' || entries === null) return refuse(400, 'Nothing to save.')
    for (const [key, entry] of Object.entries(entries)) {
      if (!(DATA_KEYS as readonly string[]).includes(key)) return refuse(400, `Unknown setting: ${key}.`)
      const { value, updatedAt } = (entry ?? {}) as { value?: unknown; updatedAt?: unknown }
      if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return refuse(400, 'Each setting needs a time.')
      const text = JSON.stringify(value ?? null)
      if (text.length > MAX_DATA_CHARS) return refuse(413, `The setting ${key} is too large.`)
    }
    for (const [key, entry] of Object.entries(entries)) {
      const { value, updatedAt } = entry as { value: unknown; updatedAt: number }
      // A time from the future would win every later comparison, so it is capped at now.
      const at = Math.min(updatedAt, this.now())
      this.sql.exec(
        `INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
         WHERE excluded.updated_at >= user_data.updated_at`,
        userId,
        key,
        JSON.stringify(value ?? null),
        at,
      )
    }
    return { ok: true }
  }

  // -- Finished local games --------------------------------------------------------

  archive(userId: string): Array<{ id: string; finishedAt: number; record: unknown }> {
    return this.sql
      .exec<{ id: string; finished_at: number; record: string }>(
        'SELECT id, finished_at, record FROM archive WHERE user_id = ? ORDER BY finished_at DESC',
        userId,
      )
      .flatMap((row) => {
        try {
          return [{ id: row.id, finishedAt: row.finished_at, record: JSON.parse(row.record) as unknown }]
        } catch {
          return []
        }
      })
  }

  putArchive(userId: string, id: unknown, finishedAt: unknown, record: unknown): Result<object> {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return refuse(400, 'That game has no id.')
    if (typeof finishedAt !== 'number' || !Number.isFinite(finishedAt)) return refuse(400, 'That game has no finishing time.')
    const text = JSON.stringify(record)
    if (typeof text !== 'string' || text.length > MAX_RECORD_CHARS) return refuse(413, 'That game is too large to keep.')
    if ((record as { config?: { id?: unknown } } | null)?.config?.id !== id)
      return refuse(400, 'That game does not match its id.')
    this.sql.exec(
      `INSERT INTO archive (user_id, id, finished_at, record) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET finished_at = excluded.finished_at, record = excluded.record`,
      userId,
      id,
      Math.min(finishedAt, this.now()),
      text,
    )
    this.sql.exec(
      `DELETE FROM archive WHERE user_id = ? AND id NOT IN
        (SELECT id FROM archive WHERE user_id = ? ORDER BY finished_at DESC LIMIT ?)`,
      userId,
      userId,
      ARCHIVE_LIMIT,
    )
    return { ok: true }
  }

  deleteArchive(userId: string, id: string) {
    this.sql.exec('DELETE FROM archive WHERE user_id = ? AND id = ?', userId, id)
  }

  clearArchive(userId: string) {
    this.sql.exec('DELETE FROM archive WHERE user_id = ?', userId)
  }

  // -- Ratings and online games ----------------------------------------------------

  ratings(userId: string): PoolRating[] {
    return this.sql
      .exec<RatingRow>('SELECT * FROM ratings WHERE user_id = ? ORDER BY games DESC, pool', userId)
      .map(ratingFromRow)
  }

  /** A player's rating in one pool; a player who has not played there starts at 1500. */
  ratingIn(userId: string, pool: string): PoolRating {
    const row = this.sql.exec<RatingRow>('SELECT * FROM ratings WHERE user_id = ? AND pool = ?', userId, pool)[0]
    return row
      ? ratingFromRow(row)
      : { pool, rating: INITIAL_RATING, games: 0, wins: 0, losses: 0, draws: 0, peak: INITIAL_RATING, lastPlayedAt: 0 }
  }

  /** Every pool's rating for a player, as a map, for the lobby. */
  ratingMap(userId: string): Record<string, number> {
    return Object.fromEntries(this.ratings(userId).map((r) => [r.pool, r.rating]))
  }

  players(ids: string[]): Record<string, GamePlayer> {
    const out: Record<string, GamePlayer> = {}
    for (const id of new Set(ids)) {
      const player = gamePlayer(this.userById(id))
      if (player) out[id] = player
    }
    return out
  }

  /**
   * Store a finished online game and, if it is rated, move both ratings.
   * A game is stored once: a second report of the same id changes nothing and
   * returns what the first one did.
   */
  recordGame(game: FinishedGame): RatingChanges {
    const existing = this.sql.exec<GameRow>('SELECT * FROM games WHERE id = ?', game.id)[0]
    if (existing) return this.changesOf(existing)
    const p1 = game.players.player1 && this.userById(game.players.player1) ? game.players.player1 : null
    const p2 = game.players.player2 && this.userById(game.players.player2) ? game.players.player2 : null
    // Only a game between two different accounts moves ratings.
    const rated = game.rated && p1 !== null && p2 !== null && p1 !== p2
    let changes: RatingChanges = { player1: null, player2: null }
    if (rated) {
      const a = this.ratingIn(p1, game.pool)
      const b = this.ratingIn(p2, game.pool)
      const score = game.winner === 'player1' ? 1 : game.winner === 'player2' ? 0 : 0.5
      const [nextA, nextB] = rateGame(a, b, score)
      this.saveRating(p1, a, nextA.rating, score, game.finishedAt)
      this.saveRating(p2, b, nextB.rating, 1 - score, game.finishedAt)
      changes = { player1: { before: a.rating, after: nextA.rating }, player2: { before: b.rating, after: nextB.rating } }
    }
    this.sql.exec(
      `INSERT INTO games (id, pool, rated, finished_at, player1_id, player2_id, winner, reason, plies,
        p1_before, p1_after, p2_before, p2_after, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      game.id,
      game.pool,
      rated ? 1 : 0,
      game.finishedAt,
      p1,
      p2,
      game.winner,
      game.reason,
      game.plies,
      changes.player1?.before ?? null,
      changes.player1?.after ?? null,
      changes.player2?.before ?? null,
      changes.player2?.after ?? null,
      game.record.length > MAX_RECORD_CHARS ? '{}' : game.record,
    )
    return changes
  }

  private saveRating(userId: string, before: PoolRating, rating: number, score: number, at: number) {
    this.sql.exec(
      `INSERT INTO ratings (user_id, pool, rating, games, wins, losses, draws, peak, last_played_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, pool) DO UPDATE SET rating = excluded.rating, games = excluded.games, wins = excluded.wins,
         losses = excluded.losses, draws = excluded.draws, peak = excluded.peak, last_played_at = excluded.last_played_at`,
      userId,
      before.pool,
      rating,
      before.games + 1,
      before.wins + (score === 1 ? 1 : 0),
      before.losses + (score === 0 ? 1 : 0),
      before.draws + (score === 0.5 ? 1 : 0),
      Math.max(before.peak, rating),
      at,
    )
  }

  private changesOf(row: GameRow): RatingChanges {
    const pair = (before: number | null, after: number | null) => (before === null || after === null ? null : { before, after })
    return { player1: pair(row.p1_before, row.p1_after), player2: pair(row.p2_before, row.p2_after) }
  }

  private summaries(rows: GameRow[]): GameSummary[] {
    const people = this.players(rows.flatMap((row) => [row.player1_id, row.player2_id].filter((id): id is string => id !== null)))
    return rows.map((row) => ({
      id: row.id,
      pool: row.pool,
      rated: row.rated === 1,
      finishedAt: row.finished_at,
      players: {
        player1: row.player1_id ? (people[row.player1_id] ?? null) : null,
        player2: row.player2_id ? (people[row.player2_id] ?? null) : null,
      },
      winner: row.winner === 'player1' || row.winner === 'player2' ? row.winner : null,
      reason: row.reason,
      plies: row.plies,
      ratings: this.changesOf(row),
    }))
  }

  /** A player's online games, newest first, `limit` at a time before `before` (epoch ms). */
  gamesOf(userId: string, options: { before?: number; limit?: number } = {}): GameSummary[] {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
    const before = options.before ?? Number.MAX_SAFE_INTEGER
    const rows = this.sql.exec<GameRow>(
      `SELECT * FROM games WHERE (player1_id = ? OR player2_id = ?) AND finished_at < ?
       ORDER BY finished_at DESC LIMIT ?`,
      userId,
      userId,
      before,
      limit,
    )
    return this.summaries(rows)
  }

  /** One online game with its record, for review. */
  game(id: string): { summary: GameSummary; record: unknown } | null {
    const row = this.sql.exec<GameRow & { record: string }>('SELECT * FROM games WHERE id = ?', id)[0]
    if (!row) return null
    let record: unknown
    try {
      record = JSON.parse(row.record)
    } catch {
      record = null
    }
    return { summary: this.summaries([row])[0], record }
  }

  profile(username: string, viewerId: string | null): Profile | null {
    const row = this.userByName(username)
    if (!row) return null
    const totals = this.sql.exec<{ games: number; wins: number; losses: number; draws: number }>(
      `SELECT COUNT(*) AS games,
        COALESCE(SUM(CASE WHEN (winner = 'player1' AND player1_id = ?1) OR (winner = 'player2' AND player2_id = ?1) THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN winner IS NOT NULL AND NOT ((winner = 'player1' AND player1_id = ?1) OR (winner = 'player2' AND player2_id = ?1)) THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE WHEN winner IS NULL THEN 1 ELSE 0 END), 0) AS draws
       FROM games WHERE player1_id = ?1 OR player2_id = ?1`,
      row.id,
    )[0]
    const visible = row.show_games === 1 || viewerId === row.id
    return {
      user: publicUser(row),
      ratings: this.ratings(row.id),
      totals,
      recent: visible ? this.gamesOf(row.id, { limit: 10 }) : null,
    }
  }

  /** Whether a player's game list may be shown to this viewer. */
  gamesVisible(username: string, viewerId: string | null): { userId: string } | null {
    const row = this.userByName(username)
    if (!row || (row.show_games !== 1 && viewerId !== row.id)) return null
    return { userId: row.id }
  }

  /** The pools worth showing: the featured ones, then any other pool someone has played. */
  pools(featured: string[]): Array<{ pool: string; players: number }> {
    const counts = new Map(
      this.sql
        .exec<{ pool: string; n: number }>('SELECT pool, COUNT(*) AS n FROM ratings GROUP BY pool')
        .map((row) => [row.pool, row.n]),
    )
    const extra = [...counts.keys()].filter((pool) => !featured.includes(pool)).sort()
    return [...featured, ...extra].map((pool) => ({ pool, players: counts.get(pool) ?? 0 }))
  }

  leaderboard(pool: string, options: { offset?: number; limit?: number } = {}): { entries: LeaderboardEntry[]; total: number } {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
    const offset = Math.max(options.offset ?? 0, 0)
    const total = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM ratings WHERE pool = ?', pool)[0].n
    const rows = this.sql.exec<RatingRow & { user_id: string }>(
      'SELECT * FROM ratings WHERE pool = ? ORDER BY rating DESC, games DESC, user_id LIMIT ? OFFSET ?',
      pool,
      limit,
      offset,
    )
    const people = this.players(rows.map((row) => row.user_id))
    const entries = rows.flatMap((row, index) => {
      const player = people[row.user_id]
      if (!player) return []
      return [
        {
          rank: offset + index + 1,
          player,
          rating: row.rating,
          games: row.games,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          peak: row.peak,
        },
      ]
    })
    return { entries, total }
  }

  /** Everything kept for one account, for the "download my data" button. */
  export(userId: string) {
    const user = this.me(userId)
    if (!user) return null
    return {
      exportedAt: this.now(),
      user,
      sessions: this.sessions(userId, ''),
      ratings: this.ratings(userId),
      settings: this.data(userId),
      archive: this.archive(userId),
      onlineGames: this.gamesOf(userId, { limit: 50 }),
    }
  }
}
