/**
 * Per-network limits on the routes that cost the server something or invite
 * guessing. Two layers, both keyed by the caller's address (CF-Connecting-IP)
 * and the route group:
 *
 *  1. **Cloudflare's rate limiting binding** (`RATE_LIMITER` in
 *     wrangler.jsonc), when it is bound: a cheap per-minute filter that turns
 *     a flood away before it reaches the Accounts object. Cloudflare counts per
 *     location and approximately, and only over 10 or 60 seconds.
 *  2. **A counter table in the Accounts store** (`AccountStore.throttle`):
 *     exact, global, and able to count over an hour. These are the limits that
 *     matter, and they work with no binding at all.
 *
 * A refusal is a 429 with a sentence and `Retry-After`.
 */

/** The part of Cloudflare's rate limiting binding used here. */
export interface BurstLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/** The Accounts store's counter, as the Worker reaches it. */
export interface Throttle {
  throttle(group: string, ip: string, limit: number, windowMs: number): Promise<{ ok: true } | { ok: false; retryAfter: number }>
}

export type LimitGroup = 'matches' | 'signin' | 'username' | 'reports' | 'client-errors'

/** How many requests one network may make in each group per window. Sign-up keeps its own limit (5 an hour) in the store. */
export const LIMITS: Record<LimitGroup, { limit: number; windowMs: number }> = {
  // Each new match is a Durable Object kept for a month.
  matches: { limit: 30, windowMs: 60 * 60 * 1000 },
  // Sign-in and recovery together: guessing passwords or codes across many usernames.
  signin: { limit: 30, windowMs: 15 * 60 * 1000 },
  // The sign-up form checks a name as it is typed.
  username: { limit: 120, windowMs: 60 * 1000 },
  reports: { limit: 10, windowMs: 60 * 60 * 1000 },
  'client-errors': { limit: 20, windowMs: 60 * 60 * 1000 },
}

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60))

export const tooMany = (retryAfterSeconds: number, headers: Record<string, string> = {}): Response => {
  const wait = minutes(retryAfterSeconds)
  return new Response(
    JSON.stringify({ error: `Too many requests from your network. Try again in ${wait} ${wait === 1 ? 'minute' : 'minutes'}.` }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
        ...headers,
      },
    },
  )
}

/**
 * Null if this request may go ahead, or the 429 to answer. A request with no
 * address (only local development has none) is not limited.
 */
export async function checkLimit(
  request: Request,
  group: LimitGroup,
  layers: { burst?: BurstLimiter; store: Throttle },
  headers: Record<string, string> = {},
): Promise<Response | null> {
  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  if (!ip) return null
  if (layers.burst) {
    try {
      const { success } = await layers.burst.limit({ key: `${group}:${ip}` })
      if (!success) return tooMany(60, headers)
    } catch {
      // The binding failing is no reason to refuse anyone; the store's count still applies.
    }
  }
  const { limit, windowMs } = LIMITS[group]
  const result = await layers.store.throttle(group, ip, limit, windowMs)
  return result.ok ? null : tooMany(result.retryAfter, headers)
}
