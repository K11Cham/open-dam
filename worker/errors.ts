/**
 * What happens when something breaks, so the owner finds out. No third-party
 * service: everything goes to Workers Logs (`observability` in
 * wrangler.jsonc), one JSON line per event, which the Cloudflare dashboard
 * can filter by `level`, `event` and `route`. docs/OPERATIONS.md says where
 * to look.
 *
 *  - An unexpected error in the Worker is logged with a request id and
 *    answered as JSON `{ error, requestId }` with status 500, instead of
 *    Cloudflare's HTML page, so the app can show a sentence and the owner can
 *    find the matching log line.
 *  - The app reports its own crashes to `POST /api/client-errors`: the page
 *    it was on and the error message, nothing about the person.
 */

export type Log = (line: Record<string, unknown>) => void

export const consoleLog: Log = (line) => console.error(JSON.stringify(line))

/** The id Cloudflare gives the request (its Ray id), or a fresh one. */
export const requestIdOf = (request: Request): string => request.headers.get('cf-ray') ?? crypto.randomUUID()

/** Log an unexpected error and answer with JSON a page can read. */
export function internalError(error: unknown, request: Request, log: Log = consoleLog): Response {
  const requestId = requestIdOf(request)
  log({
    level: 'error',
    event: 'worker-error',
    route: `${request.method} ${new URL(request.url).pathname}`,
    status: 500,
    requestId,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 6).join('\n') : undefined,
  })
  return new Response(JSON.stringify({ error: 'Something went wrong on the server. Try again in a moment.', requestId }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A client error report is small; anything bigger is refused. */
export const MAX_CLIENT_ERROR_BYTES = 4096

const clip = (value: unknown, length: number): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, length) : null

/**
 * `POST /api/client-errors` with `{ route, message, kind?, version? }`. The
 * route is the page's path (no query string, which might carry something
 * personal); the message is the error's own text, cut to 500 characters.
 * Answers 204, or 400 for a report that is not one.
 */
export async function clientErrorReport(request: Request, log: Log = consoleLog): Promise<Response> {
  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > MAX_CLIENT_ERROR_BYTES) return problem(413, 'Report too large.')
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > MAX_CLIENT_ERROR_BYTES) return problem(413, 'Report too large.')
  let body: Record<string, unknown>
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return problem(400, 'Report is not JSON.')
  }
  const route = clip(body.route, 200)
  const message = clip(body.message, 500)
  if (!route || !route.startsWith('/') || !message) return problem(400, 'A report needs a route and a message.')
  const kind = body.kind === 'unhandledrejection' || body.kind === 'render' ? body.kind : 'error'
  log({
    level: 'error',
    event: 'client-error',
    kind,
    route: route.split(/[?#]/)[0],
    message,
    version: clip(body.version, 40),
    requestId: requestIdOf(request),
  })
  return new Response(null, { status: 204 })
}

const problem = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } })
