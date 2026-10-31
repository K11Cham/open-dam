// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { AccountStore, ARCHIVE_LIMIT, describeDevice } from './accountStore'
import type { FinishedGame, Sql } from './accountStore'
import { stretchPassword } from '../src/net/account'

/** The store on Node's own SQLite, which speaks the same SQL as a Durable Object's. */
function makeStore(start = 1_000_000) {
  const db = new DatabaseSync(':memory:')
  const sql: Sql = { exec: (query, ...bindings) => db.prepare(query).all(...bindings) as never }
  const clock = { t: start }
  const store = new AccountStore(sql, { now: () => clock.t })
  return { store, clock, db }
}

const KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)
const here = { ip: '203.0.113.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36' }

async function signUp(store: AccountStore, username: string, key = KEY, ip = here.ip) {
  const result = await store.signUp({ username, key }, { ...here, ip })
  if (!result.ok) throw new Error(result.error)
  return result
}

const finished = (overrides: Partial<FinishedGame> & Pick<FinishedGame, 'id' | 'players'>): FinishedGame => ({
  pool: '5x5:untimed',
  rated: true,
  finishedAt: 2_000_000,
  winner: 'player1',
  reason: 'no-pieces',
  plies: 30,
  record: JSON.stringify({ config: { id: overrides.id } }),
  ...overrides,
})

describe('signing up and in', () => {
  it('creates an account, a session and a recovery code', async () => {
    const { store } = makeStore()
    const result = await signUp(store, 'Kylar')
    expect(result.user).toMatchObject({ username: 'Kylar', displayName: 'Kylar', bio: '', showGames: true })
    expect(result.token).toMatch(/^[0-9a-f]{64}$/)
    expect(result.recoveryCode).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/)
    const session = await store.authenticate(result.token)
    expect(session?.user.id).toBe(result.user.id)
  })

  it('treats usernames as one regardless of case, and refuses bad or reserved ones', async () => {
    const { store } = makeStore()
    await signUp(store, 'Kylar')
    expect(await store.signUp({ username: 'kylar', key: KEY }, here)).toMatchObject({ ok: false, status: 409 })
    expect(await store.signUp({ username: 'ab', key: KEY }, here)).toMatchObject({ ok: false, status: 400 })
    expect(await store.signUp({ username: 'has space', key: KEY }, here)).toMatchObject({ ok: false, status: 400 })
    expect(await store.signUp({ username: 'Serin', key: KEY }, here)).toMatchObject({ ok: false, status: 400 })
    expect(await store.signUp({ username: 'fine_name', key: 'not a key' }, here)).toMatchObject({ ok: false, status: 400 })
    expect(store.usernameProblem('KYLAR')).toBe('That username is taken.')
    expect(store.usernameProblem('someone')).toBeNull()
  })

  it('signs in with the right key only, under any case of the name', async () => {
    const { store } = makeStore()
    await signUp(store, 'Kylar')
    expect(await store.signIn({ username: 'KYLAR', key: KEY }, here)).toMatchObject({ ok: true })
    expect(await store.signIn({ username: 'Kylar', key: OTHER_KEY }, here)).toMatchObject({ ok: false, status: 401 })
    expect(await store.signIn({ username: 'nobody', key: KEY }, here)).toMatchObject({ ok: false, status: 401 })
  })

  it('locks a username after repeated wrong passwords, then lets it try again', async () => {
    const { store, clock } = makeStore()
    await signUp(store, 'Kylar')
    for (let i = 0; i < 8; i++) await store.signIn({ username: 'Kylar', key: OTHER_KEY }, here)
    const locked = await store.signIn({ username: 'Kylar', key: KEY }, here)
    expect(locked).toMatchObject({ ok: false, status: 429 })
    clock.t += 16 * 60 * 1000
    expect(await store.signIn({ username: 'Kylar', key: KEY }, here)).toMatchObject({ ok: true })
  })

  it('limits new accounts from one network', async () => {
    const { store } = makeStore()
    for (let i = 0; i < 5; i++) await signUp(store, `player${i}`)
    expect(await store.signUp({ username: 'player9', key: KEY }, here)).toMatchObject({ ok: false, status: 429 })
    expect(await store.signUp({ username: 'player9', key: KEY }, { ...here, ip: '198.51.100.7' })).toMatchObject({ ok: true })
  })

  it('ends sessions on sign-out and when they expire', async () => {
    const { store, clock } = makeStore()
    const { token } = await signUp(store, 'Kylar')
    const second = await store.signIn({ username: 'Kylar', key: KEY }, here)
    if (!second.ok) throw new Error(second.error)
    await store.signOut(token)
    expect(await store.authenticate(token)).toBeNull()
    expect(await store.authenticate(second.token)).not.toBeNull()
    clock.t += 61 * 24 * 60 * 60 * 1000
    expect(await store.authenticate(second.token)).toBeNull()
    expect(await store.authenticate('garbage')).toBeNull()
  })

  it('lists signed-in devices and signs one out', async () => {
    const { store } = makeStore()
    const first = await signUp(store, 'Kylar')
    const phone = await store.signIn(
      { username: 'Kylar', key: KEY },
      { ip: here.ip, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile Safari/604.1' },
    )
    if (!phone.ok) throw new Error(phone.error)
    const current = (await store.authenticate(first.token))!
    const list = store.sessions(first.user.id, current.sessionId)
    expect(list.map((s) => s.device).sort()).toEqual(['Chrome on Windows', 'Safari on iOS'])
    expect(list.filter((s) => s.current)).toHaveLength(1)
    const other = list.find((s) => !s.current)!
    expect(store.revokeSession('someone-else', other.id)).toBe(false)
    expect(store.revokeSession(first.user.id, other.id)).toBe(true)
    expect(await store.authenticate(phone.token)).toBeNull()
  })
})

describe('changing what proves who you are', () => {
  it('changes the password and signs out every other device', async () => {
    const { store } = makeStore()
    const first = await signUp(store, 'Kylar')
    const other = await store.signIn({ username: 'Kylar', key: KEY }, here)
    if (!other.ok) throw new Error(other.error)
    const session = (await store.authenticate(first.token))!
    expect(await store.changePassword(first.user.id, session.sessionId, OTHER_KEY, 'c'.repeat(64))).toMatchObject({
      ok: false,
      status: 403,
    })
    expect(await store.changePassword(first.user.id, session.sessionId, KEY, OTHER_KEY)).toMatchObject({ ok: true })
    expect(await store.authenticate(other.token)).toBeNull()
    expect(await store.authenticate(first.token)).not.toBeNull()
    expect(await store.signIn({ username: 'Kylar', key: KEY }, here)).toMatchObject({ ok: false })
    expect(await store.signIn({ username: 'Kylar', key: OTHER_KEY }, here)).toMatchObject({ ok: true })
  })

  it('renames an account; the display name follows unless it was customised', async () => {
    const { store } = makeStore()
    const { user } = await signUp(store, 'Kylar')
    await signUp(store, 'taken', KEY, '198.51.100.1')
    expect(await store.changeUsername(user.id, KEY, 'Taken', OTHER_KEY)).toMatchObject({ ok: false, status: 409 })
    const renamed = await store.changeUsername(user.id, KEY, 'K11', OTHER_KEY)
    expect(renamed).toMatchObject({ ok: true, user: { username: 'K11', displayName: 'K11' } })
    expect(await store.signIn({ username: 'K11', key: OTHER_KEY }, here)).toMatchObject({ ok: true })
    expect(await store.signIn({ username: 'Kylar', key: KEY }, here)).toMatchObject({ ok: false })
    store.updateProfile(user.id, { displayName: 'Kylar C' })
    expect(await store.changeUsername(user.id, OTHER_KEY, 'k12', KEY)).toMatchObject({ user: { displayName: 'Kylar C' } })
  })

  it('resets a forgotten password with the recovery code, which then stops working', async () => {
    const { store } = makeStore()
    const { recoveryCode, token } = await signUp(store, 'Kylar')
    const typed = recoveryCode.toLowerCase().replace(/-/g, ' ')
    const reset = await store.recover({ username: 'kylar', recoveryCode: typed, key: OTHER_KEY }, here)
    if (!reset.ok) throw new Error(reset.error)
    expect(reset.recoveryCode).not.toBe(recoveryCode)
    expect(await store.authenticate(token)).toBeNull()
    expect(await store.signIn({ username: 'Kylar', key: OTHER_KEY }, here)).toMatchObject({ ok: true })
    expect(await store.recover({ username: 'Kylar', recoveryCode, key: KEY }, here)).toMatchObject({ ok: false, status: 401 })
    const replaced = await store.replaceRecoveryCode(reset.user.id, OTHER_KEY)
    if (!replaced.ok) throw new Error(replaced.error)
    expect(await store.recover({ username: 'Kylar', recoveryCode: reset.recoveryCode, key: KEY }, here)).toMatchObject({
      ok: false,
    })
  })

  it('deletes an account and everything kept for it, leaving the opponent their game', async () => {
    const { store } = makeStore()
    const a = await signUp(store, 'alpha')
    const b = await signUp(store, 'bravo')
    store.putData(a.user.id, { theme: { value: 'sand', updatedAt: 1 } })
    store.recordGame(finished({ id: 'g1', players: { player1: a.user.id, player2: b.user.id } }))
    expect(await store.deleteAccount(a.user.id, OTHER_KEY)).toMatchObject({ ok: false, status: 403 })
    expect(await store.deleteAccount(a.user.id, KEY)).toMatchObject({ ok: true })
    expect(await store.authenticate(a.token)).toBeNull()
    expect(store.me(a.user.id)).toBeNull()
    expect(store.data(a.user.id)).toEqual({})
    const [game] = store.gamesOf(b.user.id)
    expect(game.players.player1).toBeNull()
    expect(game.players.player2?.username).toBe('bravo')
    expect(store.usernameProblem('alpha')).toBeNull()
  })
})

describe('profile', () => {
  it('updates the profile, refusing what does not fit', async () => {
    const { store } = makeStore()
    const { user } = await signUp(store, 'Kylar')
    expect(store.updateProfile(user.id, { displayName: '  Kylar   C ', bio: 'Plays 5×5', avatar: 'p2' })).toMatchObject({
      ok: true,
      user: { displayName: 'Kylar C', bio: 'Plays 5×5', avatar: 'p2' },
    })
    expect(store.updateProfile(user.id, { displayName: '   ' })).toMatchObject({ ok: false })
    expect(store.updateProfile(user.id, { displayName: 'x'.repeat(31) })).toMatchObject({ ok: false })
    expect(store.updateProfile(user.id, { bio: 'x'.repeat(201) })).toMatchObject({ ok: false })
    expect(store.updateProfile(user.id, { avatar: '#ff0000' })).toMatchObject({ ok: false })
    expect(store.updateProfile(user.id, { showGames: 'yes' })).toMatchObject({ ok: false })
  })

  it('hides a private player’s games from everyone else', async () => {
    const { store } = makeStore()
    const a = await signUp(store, 'alpha')
    const b = await signUp(store, 'bravo')
    store.recordGame(finished({ id: 'g1', players: { player1: a.user.id, player2: b.user.id } }))
    store.updateProfile(a.user.id, { showGames: false })
    expect(store.profile('alpha', b.user.id)?.recent).toBeNull()
    expect(store.profile('alpha', a.user.id)?.recent).toHaveLength(1)
    expect(store.gamesVisible('alpha', null)).toBeNull()
    expect(store.profile('alpha', null)?.totals).toEqual({ games: 1, wins: 1, losses: 0, draws: 0 })
    expect(store.profile('bravo', null)?.totals).toEqual({ games: 1, wins: 0, losses: 1, draws: 0 })
    expect(store.profile('nobody', null)).toBeNull()
  })
})

describe('settings and history across devices', () => {
  it('keeps the newest copy of each setting and refuses unknown or oversized ones', async () => {
    const { store, clock } = makeStore()
    const { user } = await signUp(store, 'Kylar')
    store.putData(user.id, { theme: { value: 'sand', updatedAt: 500 } })
    store.putData(user.id, { theme: { value: 'carnival', updatedAt: 400 } })
    expect(store.data(user.id).theme).toEqual({ value: 'sand', updatedAt: 500 })
    store.putData(user.id, { theme: { value: 'atelier', updatedAt: clock.t + 999_999 } })
    expect(store.data(user.id).theme).toEqual({ value: 'atelier', updatedAt: clock.t })
    expect(store.putData(user.id, { password: { value: 'x', updatedAt: 1 } })).toMatchObject({ ok: false, status: 400 })
    expect(store.putData(user.id, { prefs: { value: 'x'.repeat(70_000), updatedAt: 1 } })).toMatchObject({
      ok: false,
      status: 413,
    })
  })

  it('keeps finished local games, newest first, up to the limit', async () => {
    const { store } = makeStore(10_000_000)
    const { user } = await signUp(store, 'Kylar')
    for (let i = 0; i < ARCHIVE_LIMIT + 3; i++) {
      expect(store.putArchive(user.id, `game${i}`, 1000 + i, { config: { id: `game${i}` } })).toMatchObject({ ok: true })
    }
    const kept = store.archive(user.id)
    expect(kept).toHaveLength(ARCHIVE_LIMIT)
    expect(kept[0].id).toBe(`game${ARCHIVE_LIMIT + 2}`)
    expect(kept.some((g) => g.id === 'game0')).toBe(false)
    expect(store.putArchive(user.id, 'x', 1, { config: { id: 'y' } })).toMatchObject({ ok: false })
    store.deleteArchive(user.id, `game${ARCHIVE_LIMIT + 2}`)
    expect(store.archive(user.id)).toHaveLength(ARCHIVE_LIMIT - 1)
  })
})

describe('ratings and leaderboards', () => {
  it('rates a game between two accounts once, however often it is reported', async () => {
    const { store } = makeStore()
    const a = await signUp(store, 'alpha')
    const b = await signUp(store, 'bravo')
    const game = finished({ id: 'g1', players: { player1: a.user.id, player2: b.user.id } })
    const changes = store.recordGame(game)
    expect(changes).toEqual({ player1: { before: 1500, after: 1520 }, player2: { before: 1500, after: 1480 } })
    expect(store.recordGame(game)).toEqual(changes)
    expect(store.ratingIn(a.user.id, '5x5:untimed')).toMatchObject({ rating: 1520, games: 1, wins: 1, peak: 1520 })
    expect(store.ratingIn(b.user.id, '5x5:untimed')).toMatchObject({ rating: 1480, games: 1, losses: 1, peak: 1500 })
    expect(store.ratingMap(a.user.id)).toEqual({ '5x5:untimed': 1520 })
  })

  it('does not rate casual games, games against yourself, or games with a guest', async () => {
    const { store } = makeStore()
    const a = await signUp(store, 'alpha')
    const b = await signUp(store, 'bravo')
    const none = { player1: null, player2: null }
    expect(store.recordGame(finished({ id: 'c', rated: false, players: { player1: a.user.id, player2: b.user.id } }))).toEqual(
      none,
    )
    expect(store.recordGame(finished({ id: 's', players: { player1: a.user.id, player2: a.user.id } }))).toEqual(none)
    expect(store.recordGame(finished({ id: 'g', players: { player1: a.user.id, player2: null } }))).toEqual(none)
    expect(store.ratings(a.user.id)).toEqual([])
    expect(store.gamesOf(a.user.id)).toHaveLength(3)
  })

  it('ranks a pool by rating and lists the featured pools first', async () => {
    const { store } = makeStore()
    const a = await signUp(store, 'alpha')
    const b = await signUp(store, 'bravo')
    const c = await signUp(store, 'charlie')
    store.recordGame(finished({ id: 'g1', players: { player1: a.user.id, player2: b.user.id } }))
    store.recordGame(
      finished({ id: 'g2', players: { player1: c.user.id, player2: b.user.id }, winner: null, reason: 'agreement' }),
    )
    store.recordGame(finished({ id: 'g3', pool: '11x11:untimed', players: { player1: a.user.id, player2: c.user.id } }))
    const board = store.leaderboard('5x5:untimed')
    expect(board.total).toBe(3)
    expect(board.entries.map((e) => [e.rank, e.player.username])).toEqual([
      [1, 'alpha'],
      [2, 'charlie'],
      [3, 'bravo'],
    ])
    expect(board.entries[1]).toMatchObject({ draws: 1, games: 1 })
    expect(store.leaderboard('5x5:untimed', { offset: 1, limit: 1 }).entries.map((e) => e.rank)).toEqual([2])
    expect(store.pools(['5x5:untimed', '7x7:untimed'])).toEqual([
      { pool: '5x5:untimed', players: 3 },
      { pool: '7x7:untimed', players: 0 },
      { pool: '11x11:untimed', players: 2 },
    ])
  })

  it('pages through a player’s games and returns one with its record', async () => {
    const { store } = makeStore()
    const a = await signUp(store, 'alpha')
    const b = await signUp(store, 'bravo')
    for (let i = 0; i < 5; i++) {
      store.recordGame(finished({ id: `g${i}`, finishedAt: 1000 + i, players: { player1: a.user.id, player2: b.user.id } }))
    }
    const first = store.gamesOf(a.user.id, { limit: 2 })
    expect(first.map((g) => g.id)).toEqual(['g4', 'g3'])
    expect(store.gamesOf(a.user.id, { limit: 2, before: first[1].finishedAt }).map((g) => g.id)).toEqual(['g2', 'g1'])
    expect(store.game('g2')).toMatchObject({ summary: { id: 'g2', rated: true }, record: { config: { id: 'g2' } } })
    expect(store.game('missing')).toBeNull()
  })

  it('exports everything kept for an account', async () => {
    const { store } = makeStore()
    const a = await signUp(store, 'alpha')
    store.putData(a.user.id, { theme: { value: 'sand', updatedAt: 1 } })
    const data = store.export(a.user.id)
    expect(data).toMatchObject({ user: { username: 'alpha' }, settings: { theme: { value: 'sand' } }, archive: [] })
    expect(JSON.stringify(data)).not.toContain('key_hash')
  })
})

describe('helpers', () => {
  it('names devices from their user agents', () => {
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/17.0 Safari/605.1.15')).toBe('Safari on macOS')
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe(
      'Edge on Windows',
    )
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14) Firefox/131.0')).toBe('Firefox on Android')
    expect(describeDevice('')).toBe('A browser')
  })

  it('stretches a password into a key salted with the lower-cased username', async () => {
    const one = await stretchPassword('Kylar', 'correct horse', 1000)
    expect(one).toMatch(/^[0-9a-f]{64}$/)
    expect(await stretchPassword('kylar', 'correct horse', 1000)).toBe(one)
    expect(await stretchPassword('other', 'correct horse', 1000)).not.toBe(one)
  })
})
