/**
 * Owner-only maintenance routes, under /api/admin. They exist only when the
 * secret ADMIN_TOKEN is set (`npx wrangler secret put ADMIN_TOKEN`); without
 * it every admin path answers 404, as does a request without the right
 * `Authorization: Bearer <token>` header, so nobody can tell they are there.
 * docs/OPERATIONS.md has a curl example for each.
 *
 *   GET  /api/admin/backup/bookmark?at=<ISO time or epoch ms>   a restore point
 *   POST /api/admin/backup/restore        { bookmark }           roll the accounts database back
 *   GET  /api/admin/reports?before=                             reports of abuse, newest first
 *   POST /api/admin/users/:name/reset-profile                   display name back to the username, bio cleared
 *   POST /api/admin/users/:name/rename    { newUsername }       a new username (password must be reset by recovery code)
 *   POST /api/admin/users/:name/suspend   { suspended: bool }   suspend or restore an account
 */

/** The accounts database's point-in-time recovery, as `DurableObjectStorage` has it. */
export interface BookmarkStorage {
  getCurrentBookmark(): Promise<string>
  getBookmarkForTime(timestamp: number | Date): Promise<string>
  onNextSessionRestoreBookmark(bookmark: string): Promise<string>
}

/**
 * Rolling the Accounts object back to an earlier moment. Cloudflare keeps
 * every SQLite-backed Durable Object's history for 30 days; a bookmark names
 * a moment in it. A restore takes effect when the object next starts, so it
 * is scheduled and then the object is restarted. The bookmark returned with
 * it undoes the restore.
 */
export class Backups {
  private readonly storage: BookmarkStorage
  private readonly restart: () => void
  private readonly now: () => number

  constructor(storage: BookmarkStorage, restart: () => void, now: () => number = Date.now) {
    this.storage = storage
    this.restart = restart
    this.now = now
  }

  /** The bookmark for a moment within the last 30 days, and the current one (to come back to). */
  async bookmarkFor(at: number): Promise<{ bookmark: string; current: string; at: string }> {
    const oldest = this.now() - 30 * 24 * 60 * 60 * 1000
    if (!Number.isFinite(at) || at < oldest || at > this.now()) throw new RangeError('The time must be within the last 30 days.')
    const [bookmark, current] = await Promise.all([this.storage.getBookmarkForTime(at), this.storage.getCurrentBookmark()])
    return { bookmark, current, at: new Date(at).toISOString() }
  }

  /** Roll back to `bookmark` the next time the object starts, and start it again now. Returns the bookmark that undoes it. */
  async restoreTo(bookmark: string): Promise<{ undo: string }> {
    const undo = await this.storage.onNextSessionRestoreBookmark(bookmark)
    this.restart()
    return { undo }
  }
}

/** What the admin routes need from the Accounts object. */
export interface AdminAccounts {
  bookmarkFor(at: number): Promise<{ bookmark: string; current: string; at: string }>
  restoreTo(bookmark: string): Promise<{ undo: string }>
  reports?(options: { before?: number }): Promise<unknown[]> | unknown[]
  resetProfile?(username: string): Promise<boolean> | boolean
  renameUser?(username: string, newUsername: unknown): Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string }
  suspendUser?(username: string, suspended: boolean): Promise<boolean> | boolean
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const notFound = () => reply({ error: 'Not found.' }, 404)

/** Compare two strings in time that does not depend on where they differ. */
const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Whether this request carries the admin token. A token shorter than 32 characters is treated as unset. */
export function isAdmin(request: Request, token: string | undefined): boolean {
  if (!token || token.length < 32) return false
  const header = request.headers.get('Authorization') ?? ''
  const match = /^Bearer (.+)$/.exec(header)
  return !!match && sameText(match[1], token)
}

/** Parse a time given as epoch milliseconds or an ISO date. */
const parseTime = (value: string | null): number => {
  if (!value) return NaN
  return /^\d+$/.test(value) ? Number(value) : Date.parse(value)
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = (await request.json()) as unknown
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Answer an /api/admin request. Everything is 404 unless the token is set and given. */
export async function handleAdmin(
  request: Request,
  path: string,
  deps: { token: string | undefined; accounts: AdminAccounts },
): Promise<Response> {
  if (!isAdmin(request, deps.token)) return notFound()
  const { accounts } = deps
  const url = new URL(request.url)
  const method = request.method

  if (path === '/api/admin/backup/bookmark' && method === 'GET') {
    try {
      return reply(await accounts.bookmarkFor(parseTime(url.searchParams.get('at'))))
    } catch (error) {
      return reply({ error: error instanceof Error ? error.message : 'No bookmark for that time.' }, 400)
    }
  }
  if (path === '/api/admin/backup/restore' && method === 'POST') {
    const { bookmark } = await body(request)
    if (typeof bookmark !== 'string' || bookmark.length === 0 || bookmark.length > 512)
      return reply({ error: 'Give a bookmark.' }, 400)
    return reply(await accounts.restoreTo(bookmark))
  }
  if (path === '/api/admin/reports' && method === 'GET' && accounts.reports) {
    const before = Number(url.searchParams.get('before'))
    return reply({ reports: await accounts.reports({ before: Number.isFinite(before) && before > 0 ? before : undefined }) })
  }
  const user = /^\/api\/admin\/users\/([A-Za-z0-9_-]{1,32})\/(reset-profile|rename|suspend)$/.exec(path)
  if (user && method === 'POST') {
    const [, name, action] = user
    if (action === 'reset-profile' && accounts.resetProfile) {
      return (await accounts.resetProfile(name)) ? reply({ ok: true }) : reply({ error: 'No such player.' }, 404)
    }
    if (action === 'rename' && accounts.renameUser) {
      const result = await accounts.renameUser(name, (await body(request)).newUsername)
      return result.ok ? reply({ ok: true }) : reply({ error: result.error ?? 'Could not rename.' }, 400)
    }
    if (action === 'suspend' && accounts.suspendUser) {
      const { suspended } = await body(request)
      if (typeof suspended !== 'boolean') return reply({ error: 'Say whether the account is suspended.' }, 400)
      return (await accounts.suspendUser(name, suspended))
        ? reply({ ok: true, suspended })
        : reply({ error: 'No such player.' }, 404)
    }
  }
  return notFound()
}
