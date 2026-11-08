// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { AccountStore } from './accountStore'
import type { Sql } from './accountStore'
import { LIMITS, checkLimit } from './rateLimit'
import type { BurstLimiter } from './rateLimit'

function makeStore() {
  const db = new DatabaseSync(':memory:')
  const sql: Sql = { exec: (query, ...bindings) => db.prepare(query).all(...bindings) as never }
  const clock = { t: 5_000_000 }
  return { store: new AccountStore(sql, { now: () => clock.t }), clock, db }
}

const from = (ip: string) =>
  new Request('https://play.example/api/matches', { method: 'POST', headers: { 'CF-Connecting-IP': ip } })

describe('rate limits', () => {
  it('lets a network make its share, then refuses with 429 and Retry-After until the window resets', async () => {
    const { store, clock } = makeStore()
    const { limit, windowMs } = LIMITS.matches
    for (let i = 0; i < limit; i++) expect(await checkLimit(from('198.51.100.7'), 'matches', { store })).toBeNull()
    const refused = await checkLimit(from('198.51.100.7'), 'matches', { store })
    expect(refused?.status).toBe(429)
    expect(Number(refused?.headers.get('Retry-After'))).toBe(windowMs / 1000)
    expect(((await refused?.json()) as { error: string }).error).toMatch(
      /^Too many requests from your network\. Try again in 60 minutes\.$/,
    )
    // Another network is not affected, and neither is another group.
    expect(await checkLimit(from('198.51.100.8'), 'matches', { store })).toBeNull()
    expect(await checkLimit(from('198.51.100.7'), 'signin', { store })).toBeNull()
    clock.t += windowMs
    expect(await checkLimit(from('198.51.100.7'), 'matches', { store })).toBeNull()
  })

  it('stores a hash of the address, never the address', async () => {
    const { store, db } = makeStore()
    await checkLimit(from('198.51.100.7'), 'signin', { store })
    const rows = db.prepare('SELECT key FROM rate_limits').all() as Array<{ key: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toMatch(/^signin:[0-9a-f]{64}$/)
    expect(rows[0].key).not.toContain('198.51')
  })

  it('turns a burst away at the binding, before the store counts it', async () => {
    const { store, db } = makeStore()
    const burst: BurstLimiter = { limit: async () => ({ success: false }) }
    const refused = await checkLimit(from('198.51.100.7'), 'username', { burst, store })
    expect(refused?.status).toBe(429)
    expect(refused?.headers.get('Retry-After')).toBe('60')
    expect(db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get()).toEqual({ n: 0 })
  })

  it('falls back to the store when the binding is missing or failing', async () => {
    const { store } = makeStore()
    const broken: BurstLimiter = {
      limit: async () => {
        throw new Error('binding unavailable')
      },
    }
    for (let i = 0; i < LIMITS.signin.limit; i++)
      expect(await checkLimit(from('203.0.113.4'), 'signin', { burst: broken, store })).toBeNull()
    expect((await checkLimit(from('203.0.113.4'), 'signin', { burst: broken, store }))?.status).toBe(429)
    expect((await checkLimit(from('203.0.113.4'), 'signin', { store }))?.status).toBe(429)
  })

  it('does not limit a request without an address (local development)', async () => {
    const { store } = makeStore()
    const local = new Request('http://127.0.0.1:8787/api/matches', { method: 'POST' })
    for (let i = 0; i < LIMITS.matches.limit + 5; i++) expect(await checkLimit(local, 'matches', { store })).toBeNull()
  })
})
