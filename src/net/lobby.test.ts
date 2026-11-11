import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TIME_CONTROLS, makeSettings } from '../game/settings'
import type { RuleSettings } from '../game/types'
import type { MatchRecord } from '../match/types'
import { Lobby, NEEDS_CLOCK, SWEEP_MS } from './lobby'
import type { Seek } from './matchmaking'
import type { LobbyOptions } from './lobby'
import { PROTOCOL_VERSION } from './protocol'
import type { LobbyReply, NetMessage } from './protocol'
import { MatchServer } from './server'
import type { ServerConnection } from './server'

/** A connection that keeps what the lobby sends it. */
const connect = (lobby: Lobby, accountId: string | null = null) => {
  const inbox: LobbyReply[] = []
  const connection = lobby.accept({ send: (text) => inbox.push(JSON.parse(text) as LobbyReply), close: () => {} }, accountId)
  const seek = (from: string, settings: Partial<RuleSettings> | unknown = {}) =>
    connection.receive(JSON.stringify({ v: PROTOCOL_VERSION, channel: 'lobby', from, type: 'seek', settings }))
  const cancel = (from: string) =>
    connection.receive(JSON.stringify({ v: PROTOCOL_VERSION, channel: 'lobby', from, type: 'cancel' }))
  return { inbox, connection, seek, cancel, last: () => inbox[inbox.length - 1] }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('lobby', () => {
  let clock = 0
  const made: string[] = []
  const lobbyWith = (options: Partial<LobbyOptions> = {}) =>
    new Lobby({
      createMatch: () => {
        made.push(`m${made.length + 1}`)
        return made[made.length - 1]
      },
      now: () => clock,
      random: () => 0,
      ...options,
    })

  beforeEach(() => {
    vi.useFakeTimers()
    clock = 1_000
    made.length = 0
  })
  afterEach(() => vi.useRealTimers())

  test('two compatible seeks are paired and each player is told their match and seat', async () => {
    const lobby = lobbyWith()
    const a = connect(lobby)
    const b = connect(lobby)
    a.seek('alice', { boardSize: 7 })
    expect(a.last()).toMatchObject({ type: 'seeking', to: 'alice', pool: '7x7:untimed', rating: 1500 })
    b.seek('bob', { boardSize: 7 })
    await flush()
    expect(made).toEqual(['m1'])
    expect(a.last()).toMatchObject({ type: 'paired', to: 'alice', matchId: 'm1', seat: 'player2', opponentRating: 1500 })
    expect(b.last()).toMatchObject({ type: 'paired', to: 'bob', matchId: 'm1', seat: 'player1' })
    expect(lobby.waiting).toBe(0)
  })

  test('ratings come from the server, not the seek', async () => {
    const lobby = lobbyWith({ ratingOf: (id, pool) => (id === 'alice' && pool === '5x5:3+0' ? 1720 : undefined) })
    const a = connect(lobby)
    a.seek('alice', { timeControl: TIME_CONTROLS[1], rating: 3000 })
    expect(a.last()).toMatchObject({ type: 'seeking', rating: 1720 })
    const b = connect(lobby)
    b.seek('bob', { timeControl: TIME_CONTROLS[1] })
    await flush()
    // 220 points apart: no game until both windows have widened that far.
    expect(lobby.waiting).toBe(2)
    clock += 15_000
    await vi.advanceTimersByTimeAsync(SWEEP_MS)
    expect(b.last()).toMatchObject({ type: 'paired', opponentRating: 1720 })
  })

  test('seek settings are checked, and different rules are never paired', async () => {
    const lobby = lobbyWith()
    const a = connect(lobby)
    const b = connect(lobby)
    a.seek('alice', { boardSize: 1000, timeControl: { label: 'forever', initialMs: 1e12, incrementMs: 0 } })
    expect(a.last()).toMatchObject({ type: 'seeking', pool: '5x5:untimed' })
    b.seek('bob', { boardSize: 9 })
    clock += 60_000
    await vi.advanceTimersByTimeAsync(SWEEP_MS * 3)
    expect(made).toEqual([])
    expect(lobby.waiting).toBe(2)
  })

  test('cancelling or leaving takes the seek off the queue', async () => {
    const lobby = lobbyWith()
    const a = connect(lobby)
    a.seek('alice')
    a.cancel('alice')
    expect(a.last()).toMatchObject({ type: 'seek-ended', reason: 'Search cancelled.' })
    expect(lobby.waiting).toBe(0)
    const b = connect(lobby)
    b.seek('bob')
    b.connection.drop()
    expect(lobby.waiting).toBe(0)
    connect(lobby).seek('carol')
    await flush()
    expect(made).toEqual([])
  })

  test('a connection cannot seek or cancel for someone else', async () => {
    const lobby = lobbyWith()
    const a = connect(lobby)
    const mallory = connect(lobby)
    a.seek('alice')
    // Different rules, so the two are not simply paired.
    mallory.seek('mallory', { boardSize: 9 })
    mallory.cancel('alice')
    mallory.seek('alice', { boardSize: 9 })
    expect(lobby.waiting).toBe(2)
    expect(mallory.inbox).toHaveLength(1)
    // Garbage and messages for a match are ignored.
    mallory.connection.receive('not json')
    mallory.connection.receive(
      JSON.stringify({ v: PROTOCOL_VERSION, matchId: 'x', from: 'mallory', type: 'join', seat: 'player1' }),
    )
    expect(mallory.inbox).toHaveLength(1)
  })

  test('seeking again from a second tab moves the answer there', async () => {
    const lobby = lobbyWith()
    const first = connect(lobby)
    const second = connect(lobby)
    first.seek('alice')
    second.seek('alice')
    expect(first.last()).toMatchObject({ type: 'seek-ended' })
    expect(lobby.waiting).toBe(1)
    // The old tab closing does not cancel the new search.
    first.connection.drop()
    expect(lobby.waiting).toBe(1)
    connect(lobby).seek('bob')
    await flush()
    expect(second.last()).toMatchObject({ type: 'paired', matchId: 'm1' })
  })

  test('if the game cannot be made, both players are told and may seek again', async () => {
    const lobby = lobbyWith({ createMatch: () => Promise.reject(new Error('storage down')) })
    const a = connect(lobby)
    const b = connect(lobby)
    a.seek('alice')
    b.seek('bob')
    await flush()
    expect(a.last()).toMatchObject({ type: 'seek-ended', reason: 'Could not start the game. Try again.' })
    expect(b.last()).toMatchObject({ type: 'seek-ended' })
    expect(lobby.waiting).toBe(0)
  })

  test('a pairing becomes a game both players can join on the match server', async () => {
    const records = new Map<string, MatchRecord>()
    const server = new MatchServer({ store: { load: (id) => records.get(id) ?? null, save: (r) => records.set(r.config.id, r) } })
    const lobby = lobbyWith({ createMatch: (pairing) => server.createMatch(pairing.settings) })
    const a = connect(lobby)
    const b = connect(lobby)
    a.seek('alice', makeSettings({ boardSize: 7, promotionPolicy: 'match-opponent' }))
    b.seek('bob', makeSettings({ boardSize: 7, promotionPolicy: 'end-turn-on-promotion' }))
    await flush()
    const paired = [a.last(), b.last()]
    if (paired.some((m) => m.type !== 'paired')) throw new Error('not paired')
    const [forAlice, forBob] = paired as Extract<LobbyReply, { type: 'paired' }>[]
    expect(forAlice.matchId).toBe(forBob.matchId)
    expect(records.get(forAlice.matchId)?.config.settings).toMatchObject({
      boardSize: 7,
      promotionPolicy: 'end-turn-on-promotion',
    })

    const seen: NetMessage[] = []
    const join = (from: string, seat: 'player1' | 'player2'): ServerConnection => {
      const connection = server.accept({ send: (text) => seen.push(JSON.parse(text) as NetMessage), close: () => {} })
      connection.receive(JSON.stringify({ v: PROTOCOL_VERSION, matchId: forAlice.matchId, from, type: 'join', seat }))
      return connection
    }
    join('alice', forAlice.seat)
    join('bob', forBob.seat)
    expect(seen.filter((m) => m.type === 'welcome').map((m) => (m as { to: string }).to)).toEqual(['alice', 'bob'])
    server.close()
    lobby.close()
  })

  test('with accounts required, guests are told to sign in and an account is one seeker whatever its tabs claim', async () => {
    const lobby = lobbyWith({ requireAccount: true, ratingOf: (id) => (id === 'acct-a' ? 1550 : undefined) })
    const guest = connect(lobby)
    guest.seek('tab-x')
    expect(guest.last()).toMatchObject({ type: 'seek-ended', reason: 'Sign in to find a rated game.' })
    expect(lobby.waiting).toBe(0)

    const first = connect(lobby, 'acct-a')
    const second = connect(lobby, 'acct-a')
    first.seek('tab-1')
    expect(first.last()).toMatchObject({ type: 'seeking', to: 'acct-a', rating: 1550 })
    // The same account seeking again, even claiming another client id, replaces its seek rather than pairing with it.
    second.seek('tab-2')
    await flush()
    expect(made).toEqual([])
    expect(lobby.waiting).toBe(1)
    expect(first.last()).toMatchObject({ type: 'seek-ended', reason: 'Searching in another tab.' })

    const other = connect(lobby, 'acct-b')
    other.seek('anything', { boardSize: 5 })
    second.seek('tab-2', { boardSize: 5 })
    await flush()
    expect(made).toEqual(['m1'])
    lobby.close()
  })

  test('two accounts on one network are never paired with each other; on different networks they are', async () => {
    const lobby = lobbyWith({ requireAccount: true })
    const seekFrom = (account: string, network: string) => {
      const inbox: LobbyReply[] = []
      const connection = lobby.accept(
        { send: (text) => inbox.push(JSON.parse(text) as LobbyReply), close: () => {} },
        account,
        network,
      )
      connection.receive(
        JSON.stringify({ v: PROTOCOL_VERSION, channel: 'lobby', from: 'tab', type: 'seek', settings: { boardSize: 7 } }),
      )
      return inbox
    }
    seekFrom('acct-a', 'home')
    seekFrom('acct-b', 'home')
    await flush()
    clock += 60_000
    lobby.sweep()
    await flush()
    expect(made).toEqual([])
    expect(lobby.waiting).toBe(2)
    const c = seekFrom('acct-c', 'elsewhere')
    await flush()
    expect(made).toEqual(['m1'])
    expect(c.at(-1)).toMatchObject({ type: 'paired' })
    lobby.close()
  })

  test('a lobby that slept keeps each connection’s network, so a seek made after waking is still kept apart', async () => {
    const lobby = lobbyWith({ requireAccount: true })
    const inbox: LobbyReply[] = []
    const socket = { send: (text: string) => inbox.push(JSON.parse(text) as LobbyReply), close: () => {} }
    // A connection that was not seeking when the lobby slept: its network is all it had kept.
    const [woken] = lobby.resume([{ socket, accountId: 'acct-a', seek: null, network: 'home' }])
    const other = lobby.accept({ send: () => {}, close: () => {} }, 'acct-b', 'home')
    const seek = (connection: ServerConnection) =>
      connection.receive(
        JSON.stringify({ v: PROTOCOL_VERSION, channel: 'lobby', from: 'tab', type: 'seek', settings: { boardSize: 7 } }),
      )
    seek(other)
    seek(woken)
    await flush()
    clock += 60_000
    lobby.sweep()
    await flush()
    expect(made).toEqual([])
    expect(lobby.waiting).toBe(2)
    lobby.close()
  })

  test('with a clock required, an untimed seek is refused with a reason and a timed one waits', () => {
    const lobby = lobbyWith({ requireAccount: true, requireClock: true })
    const a = connect(lobby, 'acct-a')
    a.seek('tab', { boardSize: 7 })
    expect(a.last()).toMatchObject({ type: 'seek-ended', reason: NEEDS_CLOCK })
    expect(lobby.waiting).toBe(0)
    a.seek('tab', { boardSize: 7, timeControl: TIME_CONTROLS[3] })
    expect(a.last()).toMatchObject({ type: 'seeking', pool: '7x7:10+1' })
    expect(lobby.waiting).toBe(1)
    lobby.close()
  })

  test('a lobby that slept puts waiting seeks back as they were, and pairs them with the next seeker', async () => {
    const kept = new Map<string, Seek | null>()
    const sleepy = () => {
      const inbox: LobbyReply[] = []
      const socket = {
        send: (text: string) => inbox.push(JSON.parse(text) as LobbyReply),
        close: () => {},
        rememberSeek: (seek: Seek | null) => void kept.set('a', seek),
      }
      return { inbox, socket }
    }
    const first = lobbyWith({ requireAccount: true, requireClock: true })
    const a = sleepy()
    first.accept(a.socket, 'acct-a').receive(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        channel: 'lobby',
        from: 'x',
        type: 'seek',
        settings: { timeControl: TIME_CONTROLS[1] },
      }),
    )
    expect(kept.get('a')).toMatchObject({ playerId: 'acct-a', since: 1_000 })
    first.close()

    // A new lobby with no memory, handed the socket that stayed open.
    const woken = lobbyWith({ requireAccount: true, requireClock: true })
    woken.resume([{ socket: a.socket, accountId: 'acct-a', seek: kept.get('a') ?? null }])
    expect(woken.waiting).toBe(1)
    const b = connect(woken, 'acct-b')
    b.seek('y', { timeControl: TIME_CONTROLS[1] })
    await flush()
    expect(made).toEqual(['m1'])
    expect(a.inbox.at(-1)).toMatchObject({ type: 'paired', matchId: 'm1' })
    // Paired: nothing is waiting, so the socket forgets its seek.
    expect(kept.get('a')).toBeNull()
    woken.close()
  })

  test('with an alarm instead of a timer, sweeps are asked for only while a window can still widen', () => {
    const asked: Array<number | null> = []
    const lobby = lobbyWith({ schedule: (at) => asked.push(at) })
    connect(lobby, 'acct-a').seek('a', { boardSize: 5 })
    expect(asked.at(-1)).toBeNull()
    // Different boards: they can never pair, but the queue only knows that windows stop widening after 40 seconds.
    const b = connect(lobby, null)
    b.seek('b', { boardSize: 7 })
    expect(asked.at(-1)).toBe(clock + SWEEP_MS)
    clock += 60_000
    lobby.sweep()
    expect(lobby.waiting).toBe(2)
    expect(asked.at(-1)).toBeNull()
    lobby.close()
  })
})
