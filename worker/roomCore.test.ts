// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { legalActions } from '../src/game/engine'
import { makeSettings } from '../src/game/settings'
import type { PlayerId } from '../src/game/types'
import { replay } from '../src/match/reducer'
import { createRecord } from '../src/match/session'
import type { MatchRecord } from '../src/match/types'
import { KEEPALIVE_REQUEST, PROTOCOL_VERSION } from '../src/net/protocol'
import type { NetMessage } from '../src/net/protocol'
import type { Identity } from '../src/net/server'
import { AccountStore } from './accountStore'
import type { FinishedGame, RatingChanges, Sql } from './accountStore'
import { KEEP_IDLE_MS, REPORT_RETRY_MS, RoomCore } from './roomCore'
import type { RoomSocket, RoomStorage, SocketAttachment } from './roomCore'

/** A Durable Object's storage and alarm, in memory. Values are copied as structured clone would. */
class FakeStorage implements RoomStorage {
  data = new Map<string, unknown>()
  alarm: number | null = null
  async get<T>(key: string) {
    const value = this.data.get(key)
    return value === undefined ? undefined : (structuredClone(value) as T)
  }
  async put(entries: Record<string, unknown>) {
    for (const [key, value] of Object.entries(entries)) this.data.set(key, structuredClone(value))
  }
  async delete(keys: string[]) {
    for (const key of keys) this.data.delete(key)
    return keys.length
  }
  async deleteAll() {
    this.data.clear()
  }
  async setAlarm(at: number) {
    this.alarm = at
  }
  async deleteAlarm() {
    this.alarm = null
  }
  async getAlarm() {
    return this.alarm
  }
}

/** A hibernatable socket: its attachment outlives the room's memory, as Cloudflare's does. */
class FakeSocket implements RoomSocket {
  received: NetMessage[] = []
  raw: string[] = []
  closedByServer = false
  private stored: SocketAttachment | null = null
  autoAt: number | null = null
  send(text: string) {
    this.raw.push(text)
    this.received.push(JSON.parse(text) as NetMessage)
  }
  close() {
    this.closedByServer = true
  }
  attachment() {
    return this.stored === null ? null : structuredClone(this.stored)
  }
  attach(value: SocketAttachment) {
    this.stored = structuredClone(value)
  }
  autoResponseAt() {
    return this.autoAt
  }
  last(type: NetMessage['type']) {
    return this.received.filter((m) => m.type === type).at(-1)
  }
}

const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve()
}

const alice: Identity = { id: '', username: 'alice', displayName: 'Alice', avatar: 'p1' }
const bob: Identity = { id: '', username: 'bob', displayName: 'Bob', avatar: 'p2' }
const KEY = 'a'.repeat(64)

/** A room on fake storage, with a real accounts store behind it whose calls can be made to fail. */
async function setup(options: { failures?: number; timed?: boolean } = {}) {
  const clock = { t: 1_000_000 }
  const storage = new FakeStorage()
  const db = new DatabaseSync(':memory:')
  const sql: Sql = { exec: (query, ...bindings) => db.prepare(query).all(...bindings) as never }
  const accounts = new AccountStore(sql, { now: () => clock.t })
  const here = { ip: '203.0.113.9', userAgent: '' }
  const a = await accounts.signUp({ username: 'alice', key: KEY }, here)
  const b = await accounts.signUp({ username: 'bob', key: KEY }, here)
  if (!a.ok || !b.ok) throw new Error('sign-up failed')
  const people = { player1: { ...alice, id: a.user.id }, player2: { ...bob, id: b.user.id } }

  let failures = options.failures ?? 0
  const reports: FinishedGame[] = []
  const recordGame = async (game: FinishedGame): Promise<RatingChanges> => {
    reports.push(game)
    if (failures > 0) {
      failures--
      throw new Error('Accounts is restarting')
    }
    return accounts.recordGame(game)
  }
  const logs: Record<string, unknown>[] = []
  let ids = 0
  const open = (sockets: FakeSocket[] = []) =>
    RoomCore.open({ storage, recordGame, now: () => clock.t, newId: () => `s${ids++}`, log: (line) => logs.push(line) }, sockets)

  const settings = makeSettings({
    boardSize: 5,
    timeControl: options.timed === false ? null : { label: '1+0', initialMs: 60_000, incrementMs: 0 },
  })
  const record = createRecord({
    mode: 'online',
    settings,
    seats: { player1: { kind: 'remote', name: 'Alice' }, player2: { kind: 'remote', name: 'Bob' } },
    createdAt: clock.t,
  })
  const core = await open()
  expect(
    await core.create(record, { rated: true, accounts: { player1: { ...people.player1 }, player2: { ...people.player2 } } }),
  ).toBe(true)
  return { clock, storage, accounts, people, reports, logs, open, core, matchId: record.config.id }
}

const send = (core: RoomCore, socket: FakeSocket, body: Record<string, unknown>) =>
  core.message(socket, JSON.stringify({ v: PROTOCOL_VERSION, ...body }))

/** Connect a signed-in player and take their seat. */
async function seat(core: RoomCore, matchId: string, seatId: PlayerId, identity: Identity, clientId: string) {
  const socket = new FakeSocket()
  core.connect(socket, identity)
  send(core, socket, { matchId, from: clientId, type: 'join', seat: seatId })
  await flush()
  expect(socket.last('welcome')).toBeDefined()
  return socket
}

/** The side to move plays its first legal move. */
async function move(
  core: RoomCore,
  storage: FakeStorage,
  matchId: string,
  sockets: Record<PlayerId, FakeSocket>,
  clients: Record<PlayerId, string>,
) {
  const record = (await storage.get<MatchRecord>('record'))!
  const position = replay(record).position
  const mover = position.currentPlayer
  const action = legalActions(position).find((a) => a.type === 'move')!
  send(core, sockets[mover], {
    matchId,
    from: clients[mover],
    type: 'intent',
    seat: mover,
    nonce: `n${record.actions.length}`,
    intent: { type: 'engine', action },
  })
  await flush()
  return mover
}

const clients = { player1: 'alice-tab', player2: 'bob-tab' }

describe('a rated game abandoned by both players', () => {
  it('finishes when the clock runs out, by alarm, and the side that ran out loses', async () => {
    const { clock, storage, accounts, people, reports, core, matchId } = await setup()
    const sockets = {
      player1: await seat(core, matchId, 'player1', people.player1, clients.player1),
      player2: await seat(core, matchId, 'player2', people.player2, clients.player2),
    }
    // First moves are free; once both sides have moved, Alice's clock runs.
    await move(core, storage, matchId, sockets, clients)
    clock.t += 1_000
    await move(core, storage, matchId, sockets, clients)
    const flagAt = clock.t + 60_000
    expect(storage.alarm).toBe(flagAt)

    // Both leave. Nobody is connected, the room's memory is gone.
    await core.closed(sockets.player1)
    await core.closed(sockets.player2)
    expect(core.openSockets).toBe(0)
    expect(storage.alarm).toBe(flagAt)

    // The object is evicted; the alarm wakes a fresh one at the flag time.
    clock.t = flagAt
    const woken = await (await setup.reopen(storage, accounts, reports, clock))()
    await woken.alarm()
    await flush()

    const record = (await storage.get<MatchRecord>('record'))!
    expect(replay(record).position.status).toEqual({ kind: 'win', winner: 'player2', reason: 'timeout' })
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ id: matchId, rated: true, winner: 'player2', reason: 'timeout' })
    const stored = accounts.game(matchId)
    expect(stored?.summary).toMatchObject({ rated: true, winner: 'player2' })
    expect(accounts.ratingIn(people.player2.id, '5x5:1+0').rating).toBeGreaterThan(1500)
    expect(accounts.ratingIn(people.player1.id, '5x5:1+0').rating).toBeLessThan(1500)
    // Only the month-long clean-up is left.
    expect(storage.data.get('deadlines')).toMatchObject({ flagAt: null, reportAt: null })
    expect(storage.alarm).toBe((storage.data.get('deadlines') as { cleanupAt: number }).cleanupAt)
  })

  it('keeps only the clean-up alarm for a game with no clock running', async () => {
    const { clock, storage, core } = await setup({ timed: false })
    expect(storage.alarm).toBe(clock.t + KEEP_IDLE_MS)
    expect(core.nextAlarm).toBe(clock.t + KEEP_IDLE_MS)
  })
})

describe('a report that fails', () => {
  it('is retried by alarm and lands exactly once, and the late ratings reach whoever is still there', async () => {
    const { clock, storage, accounts, people, reports, logs, core, matchId } = await setup({ failures: 1 })
    const sockets = {
      player1: await seat(core, matchId, 'player1', people.player1, clients.player1),
      player2: await seat(core, matchId, 'player2', people.player2, clients.player2),
    }
    await move(core, storage, matchId, sockets, clients)
    await move(core, storage, matchId, sockets, clients)
    send(core, sockets.player1, {
      matchId,
      from: clients.player1,
      type: 'intent',
      seat: 'player1',
      nonce: 'r',
      intent: { type: 'engine', action: { type: 'resign', player: 'player1' } },
    })
    await flush()

    // The first call failed: the game is not in the accounts store, and a retry is set a minute out.
    expect(reports).toHaveLength(1)
    expect(accounts.game(matchId)).toBeNull()
    expect(await storage.get('pendingReport')).toMatchObject({ attempts: 1 })
    expect(storage.alarm).toBe(clock.t + REPORT_RETRY_MS[0])
    expect(logs[0]).toMatchObject({ level: 'error', event: 'report-failed', matchId })

    clock.t += REPORT_RETRY_MS[0]
    await core.alarm()
    await flush()
    expect(reports).toHaveLength(2)
    expect(accounts.game(matchId)?.summary).toMatchObject({ rated: true, winner: 'player2' })
    expect(await storage.get('pendingReport')).toBeUndefined()

    // A third report of the same game (a retry racing a slow success) changes nothing.
    const again = await accounts.recordGame(reports[1])
    expect(again.player2?.after).toBe(accounts.ratingIn(people.player2.id, '5x5:1+0').rating)
    expect(accounts.ratingIn(people.player2.id, '5x5:1+0').games).toBe(1)

    const announced = sockets.player2.last('accounts') as Extract<NetMessage, { type: 'accounts' }>
    expect(announced.accounts.player2?.change).toBeGreaterThan(0)
    expect(storage.data.get('deadlines')).toMatchObject({ flagAt: null, reportAt: null })
  })

  it('backs off: a minute, five, thirty, then hourly', async () => {
    const { clock, storage, people, core, matchId } = await setup({ failures: 5 })
    const sockets = {
      player1: await seat(core, matchId, 'player1', people.player1, clients.player1),
      player2: await seat(core, matchId, 'player2', people.player2, clients.player2),
    }
    send(core, sockets.player1, {
      matchId,
      from: clients.player1,
      type: 'intent',
      seat: 'player1',
      nonce: 'r',
      intent: { type: 'engine', action: { type: 'resign', player: 'player1' } },
    })
    await flush()
    const gaps: number[] = []
    for (let i = 0; i < 4; i++) {
      gaps.push(storage.alarm! - clock.t)
      clock.t = storage.alarm!
      await core.alarm()
      await flush()
    }
    expect(gaps).toEqual([60_000, 300_000, 1_800_000, 3_600_000])
  })
})

describe('hibernation', () => {
  it('picks up both players after the object sleeps, with their seats, and the game goes on', async () => {
    const { storage, accounts, people, reports, clock, core, matchId } = await setup()
    const sockets = {
      player1: await seat(core, matchId, 'player1', people.player1, clients.player1),
      player2: await seat(core, matchId, 'player2', people.player2, clients.player2),
    }
    await move(core, storage, matchId, sockets, clients)

    // Evicted: a new object with no memory, given the sockets that stayed open.
    const woken = await (await setup.reopen(storage, accounts, reports, clock))([sockets.player1, sockets.player2])
    expect(woken.openSockets).toBe(2)
    const before = sockets.player1.received.length
    const mover = await move(woken, storage, matchId, sockets, clients)
    expect(mover).toBe('player2')
    // Bob's move reached Alice without anyone rejoining.
    expect(sockets.player1.received.slice(before).some((m) => m.type === 'action')).toBe(true)
    expect(sockets.player1.received.slice(before).some((m) => m.type === 'snapshot' || m.type === 'welcome')).toBe(false)

    // Seats are still held: a stranger cannot take Alice's.
    const stranger = new FakeSocket()
    woken.connect(stranger, null)
    send(woken, stranger, { matchId, from: 'stranger', type: 'join', seat: 'player1' })
    await flush()
    expect(stranger.last('seat-taken')).toBeDefined()
    expect(stranger.last('welcome')).toBeUndefined()
  })

  it('answers a keepalive it does wake for, and frees a seat whose connection went silent', async () => {
    const { storage, clock, core, matchId } = await setup({ timed: false })
    // A casual seat: anyone may sit, but only while its holder is there.
    await storage.put({ meta: { rated: false, accounts: { player1: null, player2: null } } })
    const fresh = await (await setup.reopenStorage(storage, clock))()
    const first = new FakeSocket()
    fresh.connect(first, null)
    send(fresh, first, { matchId, from: 'first', type: 'join', seat: 'player1' })
    await flush()
    expect(first.last('welcome')).toBeDefined()
    fresh.message(first, KEEPALIVE_REQUEST)
    expect(first.last('alive')).toMatchObject({ type: 'alive', matchId })

    const second = new FakeSocket()
    fresh.connect(second, null)
    send(fresh, second, { matchId, from: 'second', type: 'join', seat: 'player1' })
    await flush()
    expect(second.last('seat-taken')).toBeDefined()

    // The first phone lost its network without closing: no frames, no keepalive answers.
    clock.t += 25_000
    send(fresh, second, { matchId, from: 'second', type: 'join', seat: 'player1' })
    await flush()
    expect(second.last('welcome')).toBeDefined()
    void core
  })
})

describe('clean-up', () => {
  it('deletes a game nobody has opened for a month, but not while someone is connected', async () => {
    const { clock, storage, people, core, matchId } = await setup({ timed: false })
    const socket = await seat(core, matchId, 'player1', people.player1, clients.player1)
    clock.t += KEEP_IDLE_MS
    await core.alarm()
    expect(storage.data.has('record')).toBe(true)
    expect(storage.alarm).toBe(clock.t + KEEP_IDLE_MS)

    await core.closed(socket)
    clock.t += KEEP_IDLE_MS
    await core.alarm()
    expect(storage.data.size).toBe(0)
    expect(storage.alarm).toBeNull()
  })
})

/** A fresh room over the same storage and accounts, as after an eviction. */
setup.reopen = async (storage: FakeStorage, accounts: AccountStore, reports: FinishedGame[], clock: { t: number }) => {
  let ids = 100
  return (sockets: FakeSocket[] = []) =>
    RoomCore.open(
      {
        storage,
        recordGame: async (game) => {
          reports.push(game)
          return accounts.recordGame(game)
        },
        now: () => clock.t,
        newId: () => `w${ids++}`,
        log: () => {},
      },
      sockets,
    )
}

setup.reopenStorage = async (storage: FakeStorage, clock: { t: number }) => {
  let ids = 200
  return (sockets: FakeSocket[] = []) =>
    RoomCore.open(
      {
        storage,
        recordGame: async () => ({ player1: null, player2: null }),
        now: () => clock.t,
        newId: () => `x${ids++}`,
        log: () => {},
      },
      sockets,
    )
}

describe('a room saved before rooms kept their deadlines', () => {
  it('keeps its clean-up time and works out its flag, so an abandoned game still ends', async () => {
    const { clock, storage, accounts, people, reports, core, matchId } = await setup()
    const sockets = {
      player1: await seat(core, matchId, 'player1', people.player1, clients.player1),
      player2: await seat(core, matchId, 'player2', people.player2, clients.player2),
    }
    await move(core, storage, matchId, sockets, clients)
    await move(core, storage, matchId, sockets, clients)
    const flagAt = clock.t + 60_000
    await core.closed(sockets.player1)
    await core.closed(sockets.player2)
    // As the old code left it: the record, the seats' accounts, and one alarm for the clean-up.
    storage.data.delete('deadlines')
    storage.data.delete('seats')
    const cleanupAt = clock.t + KEEP_IDLE_MS
    storage.alarm = cleanupAt

    const woken = await (await setup.reopen(storage, accounts, reports, clock))()
    expect(storage.data.get('deadlines')).toEqual({ flagAt, reportAt: null, cleanupAt })
    expect(storage.alarm).toBe(flagAt)
    clock.t = flagAt
    await woken.alarm()
    await flush()
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ reason: 'timeout', winner: 'player2' })
    expect(storage.alarm).toBe(cleanupAt)
  })
})
