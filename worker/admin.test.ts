// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Backups, handleAdmin } from './admin'
import type { AdminAccounts, BookmarkStorage } from './admin'

const TOKEN = 't'.repeat(40)
const NOW = Date.parse('2026-11-08T12:00:00Z')

/** Point-in-time recovery that records what it was asked. */
class FakeBookmarks implements BookmarkStorage {
  calls: string[] = []
  async getCurrentBookmark() {
    this.calls.push('current')
    return 'bm-now'
  }
  async getBookmarkForTime(timestamp: number | Date) {
    this.calls.push(`for ${new Date(timestamp).toISOString()}`)
    return `bm-${new Date(timestamp).getTime()}`
  }
  async onNextSessionRestoreBookmark(bookmark: string) {
    this.calls.push(`restore ${bookmark}`)
    return 'bm-undo'
  }
}

function setup() {
  const storage = new FakeBookmarks()
  let restarts = 0
  const backups = new Backups(
    storage,
    () => restarts++,
    () => NOW,
  )
  const accounts: AdminAccounts = { bookmarkFor: (at) => backups.bookmarkFor(at), restoreTo: (b) => backups.restoreTo(b) }
  const call = (path: string, init: RequestInit & { token?: string | null } = {}) => {
    const headers = new Headers(init.headers)
    if (init.token !== null) headers.set('Authorization', `Bearer ${init.token ?? TOKEN}`)
    return handleAdmin(new Request(`https://play.example${path}`, { ...init, headers }), new URL(`https://x${path}`).pathname, {
      token: TOKEN,
      accounts,
    })
  }
  return { storage, call, restarts: () => restarts, accounts }
}

describe('admin routes', () => {
  it('do not exist without the secret, or without the right token', async () => {
    const { accounts } = setup()
    const request = new Request('https://play.example/api/admin/backup/bookmark?at=1', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    expect((await handleAdmin(request, '/api/admin/backup/bookmark', { token: undefined, accounts })).status).toBe(404)
    // A short secret counts as unset.
    expect((await handleAdmin(request, '/api/admin/backup/bookmark', { token: 'short', accounts })).status).toBe(404)
    const { call } = setup()
    expect((await call('/api/admin/backup/bookmark?at=1', { token: null })).status).toBe(404)
    expect((await call('/api/admin/backup/bookmark?at=1', { token: 'x'.repeat(40) })).status).toBe(404)
  })

  it('return a bookmark for a time in the last 30 days, and the current one', async () => {
    const { call, storage } = setup()
    const response = await call('/api/admin/backup/bookmark?at=2026-11-08T09:30:00Z')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      bookmark: `bm-${Date.parse('2026-11-08T09:30:00Z')}`,
      current: 'bm-now',
      at: '2026-11-08T09:30:00.000Z',
    })
    expect(storage.calls).toEqual(['for 2026-11-08T09:30:00.000Z', 'current'])
    // Epoch milliseconds work too; the future and the far past do not.
    expect((await call(`/api/admin/backup/bookmark?at=${NOW - 1000}`)).status).toBe(200)
    expect((await call(`/api/admin/backup/bookmark?at=${NOW + 60_000}`)).status).toBe(400)
    expect((await call('/api/admin/backup/bookmark?at=2026-09-01T00:00:00Z')).status).toBe(400)
    expect((await call('/api/admin/backup/bookmark')).status).toBe(400)
  })

  it('schedule a restore, restart the object, and hand back the bookmark that undoes it', async () => {
    const { call, storage, restarts } = setup()
    const response = await call('/api/admin/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookmark: 'bm-123' }),
    })
    expect(await response.json()).toEqual({ undo: 'bm-undo' })
    expect(storage.calls).toEqual(['restore bm-123'])
    expect(restarts()).toBe(1)
    expect((await call('/api/admin/backup/restore', { method: 'POST', body: '{}' })).status).toBe(400)
    expect(restarts()).toBe(1)
  })
})
