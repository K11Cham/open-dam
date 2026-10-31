import { sanitizeSettings } from '../src/game/settings'
import { createRecord } from '../src/match/session'
import { MATCH_ID_PATTERN } from '../src/net/protocol'
import { MatchRoom } from './room'

export { MatchRoom }

export interface Env {
  MATCHES: DurableObjectNamespace<MatchRoom>
  ASSETS: Fetcher
}

/**
 * The online server's front door, on Cloudflare Workers. It does two things:
 * create a match, and send a WebSocket to that match's own Durable Object
 * (room.ts), which runs `MatchServer` from src/net. Everything else is the
 * built app, served from ./dist by the assets binding.
 *
 *   POST /api/matches                 { settings } → { id }
 *   GET  /api/matches/:id/socket      WebSocket upgrade
 *   GET  /api/health                  "ok"
 */

// Creating a match is public (anyone can start a game, as on the New game
// page), and the response holds nothing private, so any origin may ask. That
// also lets a static copy of the app hosted elsewhere play online.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/** A settings object is a few hundred bytes; anything far bigger is not a real request. */
const MAX_BODY_BYTES = 4096

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

const roomFor = (env: Env, matchId: string) => env.MATCHES.get(env.MATCHES.idFromName(matchId))

async function createMatch(request: Request, env: Env): Promise<Response> {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return json({ error: 'Request too large.' }, 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: 'Request is not JSON.' }, 400)
  }
  const settings = (body as { settings?: unknown })?.settings
  // sanitizeSettings keeps only known fields with allowed values, so a browser cannot
  // smuggle odd rules into a game.
  const record = createRecord({
    mode: 'online',
    settings: sanitizeSettings(settings),
    seats: { player1: { kind: 'remote', name: '' }, player2: { kind: 'remote', name: '' } },
  })
  const created = await roomFor(env, record.config.id).create(record)
  if (!created) return json({ error: 'Could not create the game. Try again.' }, 409)
  return json({ id: record.config.id }, 201)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS' && path.startsWith('/api/')) return new Response(null, { status: 204, headers: CORS })
    if (path === '/api/health') return new Response('ok', { headers: CORS })
    if (path === '/api/matches') {
      return request.method === 'POST' ? createMatch(request, env) : json({ error: 'Use POST.' }, 405)
    }
    const socket = path.match(/^\/api\/matches\/([^/]+)\/socket$/)
    if (socket) {
      const matchId = socket[1]
      if (!MATCH_ID_PATTERN.test(matchId)) return json({ error: 'No such game.' }, 404)
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Expected a WebSocket.' }, 426)
      return roomFor(env, matchId).fetch(request)
    }
    if (path.startsWith('/api/')) return json({ error: 'Not found.' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
