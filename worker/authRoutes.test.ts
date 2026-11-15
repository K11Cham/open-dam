// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { AccountStore } from './accountStore'
import type { Sql } from './accountStore'

// The Durable Object classes extend the runtime's own base class; the routes under test never construct them.
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))
// Imported by a path TypeScript does not follow: index.ts is typed against Cloudflare's runtime
// (worker/tsconfig.json), which this Node project cannot load beside Node's own types.
const { default: worker } = (await import('./index' as string)) as {
  default: { fetch: (request: Request, env: unknown) => Promise<Response> }
}

/**
 * The sign-in routes of worker/index.ts, from request to answer, with the
 * Accounts object replaced by the store itself on Node's SQLite. The store's
 * logic has its own tests (accountStore.test.ts); these check that each route
 * passes the key versions through, and that the version check is limited.
 */

function setup() {
  const db = new DatabaseSync(':memory:')
  const sql: Sql = { exec: (query, ...bindings) => db.prepare(query).all(...bindings) as never }
  const store = new AccountStore(sql, { log: () => {} })
  const env = {
    ACCOUNTS: { idFromName: () => 'accounts', get: () => store },
  }
  let ip = '203.0.113.9'
  const call = async (method: string, path: string, body?: unknown, cookie = '') => {
    const response = await worker.fetch(
      new Request(`https://play.example${path}`, {
        method,
        headers: {
          'CF-Connecting-IP': ip,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    )
    const cookieSet = (response.headers.get('Set-Cookie') ?? '').split(';')[0]
    return { status: response.status, body: (await response.json()) as Record<string, unknown>, cookie: cookieSet }
  }
  const markV1 = (username: string) => db.prepare('UPDATE users SET key_version = 1 WHERE username_key = ?').run(username)
  return { call, markV1, setIp: (next: string) => (ip = next) }
}

const KEY = 'a'.repeat(64)
const V2_KEY = 'c'.repeat(64)
const NEW_KEY = 'd'.repeat(64)

describe('GET /api/auth/params', () => {
  it('answers v2 for a name nobody has, and the account’s own version otherwise', async () => {
    const { call, markV1 } = setup()
    expect(await call('GET', '/api/auth/params?username=nobody')).toMatchObject({ status: 200, body: { version: 2 } })
    expect(await call('GET', '/api/auth/params')).toMatchObject({ status: 200, body: { version: 2 } })
    expect((await call('POST', '/api/auth/signup', { username: 'Kylar', key: KEY, newKeyVersion: 2 })).status).toBe(201)
    expect((await call('GET', '/api/auth/params?username=KYLAR')).body).toEqual({ version: 2 })
    markV1('kylar')
    expect((await call('GET', '/api/auth/params?username=kylar')).body).toEqual({ version: 1 })
  })

  it('is limited per network together with the username check', async () => {
    const { call, setIp } = setup()
    for (let i = 0; i < 60; i++) await call('GET', `/api/auth/username?name=n${i}`)
    for (let i = 0; i < 60; i++) expect((await call('GET', `/api/auth/params?username=n${i}`)).status).toBe(200)
    expect(await call('GET', '/api/auth/params?username=one-more')).toMatchObject({ status: 429 })
    setIp('198.51.100.4')
    expect((await call('GET', '/api/auth/params?username=one-more')).status).toBe(200)
  })
})

describe('the sign-in routes carry key versions', () => {
  it('signs a v1 account in with both keys, and the next sign-in is v2 alone', async () => {
    const { call, markV1 } = setup()
    await call('POST', '/api/auth/signup', { username: 'Kylar', key: KEY, newKeyVersion: 2 })
    markV1('kylar')
    const upgraded = await call('POST', '/api/auth/signin', { username: 'Kylar', key: KEY, keyVersion: 1, upgradeKey: V2_KEY })
    expect(upgraded.status).toBe(200)
    expect((await call('GET', '/api/auth/params?username=Kylar')).body).toEqual({ version: 2 })
    expect((await call('POST', '/api/auth/signin', { username: 'Kylar', key: V2_KEY, keyVersion: 2 })).status).toBe(200)
    expect((await call('POST', '/api/auth/signin', { username: 'Kylar', key: KEY, keyVersion: 2 })).status).toBe(401)
  })

  it('lets an old app (a v1 key alone) sign in to a v1 account, and tells it to update for a v2 one', async () => {
    const { call, markV1 } = setup()
    await call('POST', '/api/auth/signup', { username: 'Old', key: KEY, newKeyVersion: 2 })
    await call('POST', '/api/auth/signup', { username: 'New', key: KEY, newKeyVersion: 2 })
    markV1('old')
    expect((await call('POST', '/api/auth/signin', { username: 'Old', key: KEY })).status).toBe(200)
    const refused = await call('POST', '/api/auth/signin', { username: 'New', key: KEY })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatch(/^Update the app to sign in/)
  })

  it('refuses every write of a key that carries no version', async () => {
    const { call } = setup()
    const signup = await call('POST', '/api/auth/signup', { username: 'Kylar', key: KEY })
    expect(signup.status).toBe(409)
    expect(signup.body.error).toMatch(/^Update the app/)
    const made = await call('POST', '/api/auth/signup', { username: 'Kylar', key: KEY, newKeyVersion: 2 })
    const code = made.body.recoveryCode as string
    const me = made.cookie
    const current = { key: KEY, keyVersion: 2 }
    expect((await call('POST', '/api/me/password', { ...current, newKey: NEW_KEY }, me)).status).toBe(409)
    expect((await call('POST', '/api/me/username', { ...current, newUsername: 'K11', newKey: NEW_KEY }, me)).status).toBe(409)
    expect((await call('POST', '/api/auth/recover', { username: 'Kylar', recoveryCode: code, key: NEW_KEY })).status).toBe(409)
    // With the version, each one goes through.
    expect((await call('POST', '/api/me/password', { ...current, newKey: NEW_KEY, newKeyVersion: 2 }, me)).status).toBe(200)
    const renamed = await call(
      'POST',
      '/api/me/username',
      {
        key: NEW_KEY,
        keyVersion: 2,
        newUsername: 'K11',
        newKey: V2_KEY,
        newKeyVersion: 2,
      },
      me,
    )
    expect(renamed.status).toBe(200)
    expect(
      (await call('POST', '/api/auth/recover', { username: 'K11', recoveryCode: code, key: KEY, newKeyVersion: 2 })).status,
    ).toBe(200)
  })

  it('confirms the current password at its version, upgrading a v1 account, and deletes with a v2 key', async () => {
    const { call, markV1 } = setup()
    const made = await call('POST', '/api/auth/signup', { username: 'Kylar', key: KEY, newKeyVersion: 2 })
    markV1('kylar')
    const me = made.cookie
    expect((await call('POST', '/api/me/recovery-code', { key: KEY, keyVersion: 1, upgradeKey: V2_KEY }, me)).status).toBe(200)
    expect((await call('GET', '/api/auth/params?username=Kylar')).body).toEqual({ version: 2 })
    expect((await call('DELETE', '/api/me', { key: KEY }, me)).status).toBe(409)
    expect((await call('DELETE', '/api/me', { key: V2_KEY, keyVersion: 2 }, me)).status).toBe(200)
  })
})
