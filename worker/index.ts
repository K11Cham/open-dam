import { sanitizeSettings } from '../src/game/settings'
import { createRecord } from '../src/match/session'
import { FEATURED_POOLS, isPool } from '../src/net/account'
import { MATCH_ID_PATTERN } from '../src/net/protocol'
import type { Identity } from '../src/net/server'
import { Accounts } from './accounts'
import type { RequestContext } from './accountStore'
import { LobbyRoom } from './lobbyRoom'
import { MatchRoom } from './room'

export { Accounts, LobbyRoom, MatchRoom }

export interface Env {
  MATCHES: DurableObjectNamespace<MatchRoom>
  ACCOUNTS: DurableObjectNamespace<Accounts>
  LOBBY: DurableObjectNamespace<LobbyRoom>
  ASSETS: Fetcher
}

/**
 * The online server's front door, on Cloudflare Workers. Everything that is
 * not under /api is the built app, served from ./dist by the assets binding.
 *
 * Games
 *   POST   /api/matches                    { settings } → { id }
 *   GET    /api/matches/:id/socket         WebSocket to the match's room (room.ts)
 *   GET    /api/lobby/socket               WebSocket to matchmaking (lobbyRoom.ts)
 *   GET    /api/games/:id                  a finished online game, with its record
 * Accounts (accountStore.ts)
 *   POST   /api/auth/signup | signin | signout | recover
 *   GET    /api/auth/username?name=        why a name cannot be used, or null
 *   GET    /api/me                         the signed-in account, or null
 *   PATCH  /api/me                         profile
 *   DELETE /api/me                         { key } delete the account
 *   POST   /api/me/password | username | recovery-code
 *   GET    /api/me/sessions                signed-in devices
 *   DELETE /api/me/sessions/:id            sign one out
 *   POST   /api/me/sessions/revoke-others
 *   GET    /api/me/data   PUT /api/me/data settings kept in step across devices
 *   GET    /api/me/archive                 finished local games
 *   PUT    /api/me/archive/:id   DELETE /api/me/archive[/:id]
 *   GET    /api/me/export                  everything, as a download
 * Public
 *   GET    /api/users/:name                profile, ratings, recent games
 *   GET    /api/users/:name/games?before=  more games
 *   GET    /api/leaderboards               the pools
 *   GET    /api/leaderboards/:pool?offset= one pool's standings
 *   GET    /api/health                     "ok"
 */

// Starting a game and reading public pages hold nothing private, so any
// origin may ask; that lets a static copy hosted elsewhere play online.
// Account routes send no CORS headers at all, so only this site can use them.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/** Requests are a few hundred bytes; a finished game a few tens of kilobytes. Anything far bigger is not real. */
const MAX_BODY_BYTES = 4096
const MAX_ARCHIVE_BODY_BYTES = 220_000

const SESSION_COOKIE = 'od_session'
const SESSION_SECONDS = 60 * 24 * 60 * 60

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const publicJson = (body: unknown, status = 200) => json(body, status, CORS)

const fail = (status: number, error: string, headers: Record<string, string> = {}) => json({ error }, status, headers)

const roomFor = (env: Env, matchId: string) => env.MATCHES.get(env.MATCHES.idFromName(matchId))
const accountsOf = (env: Env) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('accounts'))
const lobbyOf = (env: Env) => env.LOBBY.get(env.LOBBY.idFromName('lobby'))

class BadRequest extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function readJson(request: Request, limit = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > limit) throw new BadRequest(413, 'Request too large.')
  if (text === '') return {}
  try {
    const body = JSON.parse(text) as unknown
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('not an object')
    return body as Record<string, unknown>
  } catch {
    throw new BadRequest(400, 'Request is not JSON.')
  }
}

// -- Sessions ---------------------------------------------------------------------

const readCookie = (request: Request, name: string): string | null => {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

const sessionCookie = (request: Request, token: string | null): string => {
  // Secure cookies need https; `wrangler dev` serves plain http on localhost.
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return token === null
    ? `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
    : `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`
}

interface Viewer {
  token: string
  sessionId: string
  user: { id: string; username: string; displayName: string; avatar: string }
}

async function viewerOf(request: Request, env: Env): Promise<Viewer | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token) return null
  const found = await accountsOf(env).authenticate(token)
  return found ? { token, sessionId: found.sessionId, user: found.user } : null
}

const identityOf = (viewer: Viewer | null): Identity | null =>
  viewer
    ? {
        id: viewer.user.id,
        username: viewer.user.username,
        displayName: viewer.user.displayName,
        avatar: viewer.user.avatar,
      }
    : null

const contextOf = (request: Request): RequestContext => ({
  ip: request.headers.get('CF-Connecting-IP') ?? '',
  userAgent: request.headers.get('User-Agent') ?? '',
})

/**
 * Changes to an account only come from this site's own pages: a request
 * another site's page makes carries that site's Origin, and is refused. The
 * session cookie is also SameSite=Lax, so other sites' requests do not carry it.
 */
const fromThisSite = (request: Request): boolean => {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

/** The socket request a room or the lobby receives, carrying who the Worker checked the person is. */
const withIdentity = (request: Request, identity: Identity | null): Request => {
  const headers = new Headers(request.headers)
  // Whatever a browser put here is discarded; only the Worker vouches for an identity.
  headers.delete('X-Open-Dam-Identity')
  if (identity) headers.set('X-Open-Dam-Identity', encodeURIComponent(JSON.stringify(identity)))
  return new Request(request, { headers })
}

// -- Games ----------------------------------------------------------------------------

async function createMatch(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request)
  // sanitizeSettings keeps only known fields with allowed values, so a browser cannot
  // smuggle odd rules into a game.
  const record = createRecord({
    mode: 'online',
    settings: sanitizeSettings(body.settings),
    seats: { player1: { kind: 'remote', name: '' }, player2: { kind: 'remote', name: '' } },
  })
  const created = await roomFor(env, record.config.id).create(record)
  if (!created) return publicJson({ error: 'Could not create the game. Try again.' }, 409)
  return publicJson({ id: record.config.id }, 201)
}

// -- Accounts --------------------------------------------------------------------------

type Handler = (request: Request, env: Env, viewer: Viewer | null, params: string[]) => Promise<Response>

/** Answer a store result: its fields on success, its refusal otherwise. */
const answer = (result: { ok: true } | { ok: false; status: number; error: string }, headers: Record<string, string> = {}) => {
  if (!result.ok) return fail(result.status, result.error)
  const rest: Record<string, unknown> = { ...result }
  delete rest.ok
  return json(rest, 200, headers)
}

const signedIn =
  (handler: (request: Request, env: Env, viewer: Viewer, params: string[]) => Promise<Response>): Handler =>
  async (request, env, viewer, params) =>
    viewer ? handler(request, env, viewer, params) : fail(401, 'Sign in first.')

const routes: Array<{ method: string; pattern: RegExp; handler: Handler; publicRoute?: boolean }> = [
  {
    method: 'GET',
    pattern: /^\/api\/me$/,
    handler: async (_request, env, viewer) => json({ user: viewer ? await accountsOf(env).me(viewer.user.id) : null }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/username$/,
    handler: async (request, env) => {
      const name = new URL(request.url).searchParams.get('name') ?? ''
      return json({ problem: await accountsOf(env).usernameProblem(name) })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/signup$/,
    handler: async (request, env) => {
      const body = await readJson(request)
      const result = await accountsOf(env).signUp(
        { username: body.username, key: body.key, displayName: body.displayName },
        contextOf(request),
      )
      if (!result.ok) return answer(result)
      return json({ user: result.user, recoveryCode: result.recoveryCode }, 201, {
        'Set-Cookie': sessionCookie(request, result.token),
      })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/signin$/,
    handler: async (request, env) => {
      const body = await readJson(request)
      const result = await accountsOf(env).signIn({ username: body.username, key: body.key }, contextOf(request))
      if (!result.ok) return answer(result)
      return json({ user: result.user }, 200, { 'Set-Cookie': sessionCookie(request, result.token) })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/signout$/,
    handler: async (request, env, viewer) => {
      if (viewer) await accountsOf(env).signOut(viewer.token)
      return json({}, 200, { 'Set-Cookie': sessionCookie(request, null) })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/recover$/,
    handler: async (request, env) => {
      const body = await readJson(request)
      const result = await accountsOf(env).recover(
        { username: body.username, recoveryCode: body.recoveryCode, key: body.key },
        contextOf(request),
      )
      if (!result.ok) return answer(result)
      return json({ user: result.user, recoveryCode: result.recoveryCode }, 200, {
        'Set-Cookie': sessionCookie(request, result.token),
      })
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/me$/,
    handler: signedIn(async (request, env, viewer) =>
      answer(await accountsOf(env).updateProfile(viewer.user.id, await readJson(request))),
    ),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/me$/,
    handler: signedIn(async (request, env, viewer) => {
      const body = await readJson(request)
      const result = await accountsOf(env).deleteAccount(viewer.user.id, body.key)
      return answer(result, result.ok ? { 'Set-Cookie': sessionCookie(request, null) } : {})
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/password$/,
    handler: signedIn(async (request, env, viewer) => {
      const body = await readJson(request)
      return answer(await accountsOf(env).changePassword(viewer.user.id, viewer.sessionId, body.key, body.newKey))
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/username$/,
    handler: signedIn(async (request, env, viewer) => {
      const body = await readJson(request)
      return answer(await accountsOf(env).changeUsername(viewer.user.id, body.key, body.newUsername, body.newKey))
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/recovery-code$/,
    handler: signedIn(async (request, env, viewer) => {
      const body = await readJson(request)
      return answer(await accountsOf(env).replaceRecoveryCode(viewer.user.id, body.key))
    }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me\/sessions$/,
    handler: signedIn(async (_request, env, viewer) =>
      json({ sessions: await accountsOf(env).sessions(viewer.user.id, viewer.sessionId) }),
    ),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/sessions\/revoke-others$/,
    handler: signedIn(async (_request, env, viewer) => {
      await accountsOf(env).revokeOtherSessions(viewer.user.id, viewer.sessionId)
      return json({})
    }),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/me\/sessions\/([a-z0-9]{1,32})$/,
    handler: signedIn(async (_request, env, viewer, [id]) =>
      (await accountsOf(env).revokeSession(viewer.user.id, id)) ? json({}) : fail(404, 'No such device.'),
    ),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me\/data$/,
    handler: signedIn(async (_request, env, viewer) => json({ data: await accountsOf(env).data(viewer.user.id) })),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/me\/data$/,
    handler: signedIn(async (request, env, viewer) => {
      const body = await readJson(request, 320_000)
      return answer(await accountsOf(env).putData(viewer.user.id, body.entries))
    }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me\/archive$/,
    handler: signedIn(async (_request, env, viewer) => json({ games: await accountsOf(env).archive(viewer.user.id) })),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/me\/archive$/,
    handler: signedIn(async (_request, env, viewer) => {
      await accountsOf(env).clearArchive(viewer.user.id)
      return json({})
    }),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/me\/archive\/([A-Za-z0-9_-]{1,64})$/,
    handler: signedIn(async (request, env, viewer, [id]) => {
      const body = await readJson(request, MAX_ARCHIVE_BODY_BYTES)
      return answer(await accountsOf(env).putArchive(viewer.user.id, id, body.finishedAt, body.record))
    }),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/me\/archive\/([A-Za-z0-9_-]{1,64})$/,
    handler: signedIn(async (_request, env, viewer, [id]) => {
      await accountsOf(env).deleteArchive(viewer.user.id, id)
      return json({})
    }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me\/export$/,
    handler: signedIn(async (_request, env, viewer) =>
      json(await accountsOf(env).export(viewer.user.id), 200, {
        'Content-Disposition': `attachment; filename="open-dam-${viewer.user.username}.json"`,
      }),
    ),
  },
  {
    method: 'GET',
    pattern: /^\/api\/users\/([A-Za-z0-9_-]{1,32})$/,
    publicRoute: true,
    handler: async (_request, env, viewer, [name]) => {
      const profile = await accountsOf(env).profile(name, viewer?.user.id ?? null)
      return profile ? publicJson(profile) : publicJson({ error: 'No such player.' }, 404)
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/users\/([A-Za-z0-9_-]{1,32})\/games$/,
    publicRoute: true,
    handler: async (request, env, viewer, [name]) => {
      const accounts = accountsOf(env)
      const visible = await accounts.gamesVisible(name, viewer?.user.id ?? null)
      if (!visible) return publicJson({ error: 'This player’s games are private.' }, 404)
      const before = Number(new URL(request.url).searchParams.get('before'))
      return publicJson({
        games: await accounts.gamesOf(visible.userId, { before: Number.isFinite(before) && before > 0 ? before : undefined }),
      })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/games\/([A-Za-z0-9_-]{1,64})$/,
    publicRoute: true,
    handler: async (_request, env, _viewer, [id]) => {
      const game = await accountsOf(env).game(id)
      return game ? publicJson(game) : publicJson({ error: 'No such game.' }, 404)
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/leaderboards$/,
    publicRoute: true,
    handler: async (_request, env) => publicJson({ pools: await accountsOf(env).pools(FEATURED_POOLS) }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/leaderboards\/([^/]+)$/,
    publicRoute: true,
    handler: async (request, env, _viewer, [encoded]) => {
      const pool = decodeURIComponent(encoded)
      if (!isPool(pool)) return publicJson({ error: 'No such leaderboard.' }, 404)
      const offset = Number(new URL(request.url).searchParams.get('offset'))
      const board = await accountsOf(env).leaderboard(pool, { offset: Number.isFinite(offset) ? offset : 0 })
      return publicJson({ pool, ...board })
    },
  },
]

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (path === '/api/health') return new Response('ok', { headers: CORS })
  if (path === '/api/matches') {
    return request.method === 'POST' ? createMatch(request, env) : publicJson({ error: 'Use POST.' }, 405)
  }

  const socket = path.match(/^\/api\/matches\/([^/]+)\/socket$/)
  if (socket || path === '/api/lobby/socket') {
    if (socket && !MATCH_ID_PATTERN.test(socket[1])) return publicJson({ error: 'No such game.' }, 404)
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return publicJson({ error: 'Expected a WebSocket.' }, 426)
    // A socket from another site's page would carry this person's cookie into a game; it is answered as a guest instead.
    const viewer = fromThisSite(request) ? await viewerOf(request, env) : null
    const forwarded = withIdentity(request, identityOf(viewer))
    return socket ? roomFor(env, socket[1]).fetch(forwarded) : lobbyOf(env).fetch(forwarded)
  }

  for (const route of routes) {
    const match = path.match(route.pattern)
    if (!match) continue
    if (request.method !== route.method) continue
    if (!route.publicRoute && route.method !== 'GET' && !fromThisSite(request)) return fail(403, 'Not from this site.')
    const viewer = await viewerOf(request, env)
    return route.handler(request, env, viewer, match.slice(1))
  }
  const known = routes.some((route) => route.pattern.test(path))
  return known ? fail(405, 'That method is not allowed here.') : fail(404, 'Not found.')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    try {
      return await handleApi(request, env, path)
    } catch (error) {
      if (error instanceof BadRequest) return publicJson({ error: error.message }, error.status)
      throw error
    }
  },
} satisfies ExportedHandler<Env>
