import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { legalActions } from '../game/engine'
import { makeSettings } from '../game/settings'
import type { PlayerId, RuleSettings } from '../game/types'
import { newRating, rateGame, ratedScore } from '../match/rating'
import { createRecord } from '../match/session'
import type { Rating } from '../match/rating'
import type { MatchRecord } from '../match/types'
import { MatchGuest } from './guest'
import { SeekQueue, agreedSettings, ratingWindow } from './matchmaking'
import type { Seek } from './matchmaking'
import { PROTOCOL_VERSION } from './protocol'
import type { NetMessage } from './protocol'
import { MatchServer, emptyMeta } from './server'
import type { Identity, MatchStore, RoomMeta, ServerConnection } from './server'
import { WebSocketTransport } from './websocket'
import type { SocketLike } from './websocket'

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}

/**
 * A pretend network between `WebSocketTransport` and a `MatchServer`: each
 * fake socket opens a connection on whichever server is current, delivers
 * frames asynchronously, and can be cut to simulate a dropped link.
 */
class FakeSocket {
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  private connection: ServerConnection | null = null

  constructor(net: FakeNet) {
    const identity = net.identity
    queueMicrotask(() => {
      if (this.readyState !== 0) return
      const server = net.server
      if (!server) {
        this.readyState = 3
        this.onclose?.({} as CloseEvent)
        return
      }
      this.connection = server.accept(
        {
          send: (text) => queueMicrotask(() => this.readyState === 1 && this.onmessage?.({ data: text } as MessageEvent)),
          close: () => this.cut(),
        },
        identity,
      )
      this.readyState = 1
      this.onopen?.({} as Event)
    })
  }

  send(text: string) {
    const connection = this.connection
    queueMicrotask(() => connection?.receive(text))
  }

  close() {
    this.cut()
  }

  /** The link drops: both ends find out. */
  cut() {
    if (this.readyState === 3) return
    this.readyState = 3
    this.connection?.drop()
    this.onclose?.({} as CloseEvent)
  }
}

class FakeNet {
  server: MatchServer | null
  sockets: FakeSocket[] = []
  /** Who the next sockets are signed in as, as the Worker would vouch from a session cookie. */
  identity: Identity | null = null
  constructor(server: MatchServer) {
    this.server = server
  }
  createSocket = (): SocketLike => {
    const socket = new FakeSocket(this)
    this.sockets.push(socket)
    return socket
  }
}

const memoryStore = () => {
  const records = new Map<string, MatchRecord>()
  const metas = new Map<string, RoomMeta>()
  const store: MatchStore = {
    load: (id) => records.get(id) ?? null,
    save: (record) => void records.set(record.config.id, record),
    loadMeta: (id) => metas.get(id) ?? null,
    saveMeta: (id, meta) => void metas.set(id, meta),
  }
  return { records, metas, store }
}

const alice: Identity = { id: 'u-alice', username: 'alice', displayName: 'Alice', avatar: 'p1' }
const bob: Identity = { id: 'u-bob', username: 'bob', displayName: 'Bob', avatar: 'p2' }

const setup = async (settings: Partial<RuleSettings> = { boardSize: 5 }) => {
  const { records, store } = memoryStore()
  const server = new MatchServer({ store })
  const matchId = server.createMatch(settings)
  const net = new FakeNet(server)
  const guests: MatchGuest[] = []
  const transports: WebSocketTransport[] = []
  const join = (seat: PlayerId, clientId: string) => {
    const transport = new WebSocketTransport('wss://example.test/matches', { createSocket: net.createSocket })
    const guest = new MatchGuest({ matchId, seat, clientId })
    guest.connect(transport)
    guests.push(guest)
    transports.push(transport)
    return guest
  }
  const red = join('player1', 'red-tab')
  const blue = join('player2', 'blue-tab')
  await flush()
  const cleanup = () => {
    for (const guest of guests) guest.dispose()
    for (const transport of transports) transport.close()
    server.close()
  }
  return { server, store, records, matchId, net, red, blue, join, cleanup }
}

const playOne = (guest: MatchGuest, seat: PlayerId) => {
  const action = legalActions(guest.getSnapshot().state.position).find((a) => a.type === 'move')!
  expect(guest.submit(seat, { type: 'engine', action })).toBeNull()
}

beforeEach(() => {
  // Fake timers before anything reads Date.now, so heartbeats and clocks share one fake time.
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('match server', () => {
  test('two guests join a server game and their moves reach each other', async () => {
    const { server, matchId, red, blue, records, cleanup } = await setup()
    expect(red.getSnapshot().connection).toBe('connected')
    expect(blue.getSnapshot().connection).toBe('connected')
    expect(server.hostOf(matchId)?.getSnapshot().online).toEqual({ player1: true, player2: true })

    playOne(red, 'player1')
    await flush()
    playOne(blue, 'player2')
    await flush()
    expect(server.hostOf(matchId)?.getSnapshot().state.lastSeq).toBe(2)
    expect(JSON.stringify(red.getSnapshot().state)).toBe(JSON.stringify(blue.getSnapshot().state))
    // Saved after every action, so a restart loses nothing.
    expect(records.get(matchId)?.actions).toHaveLength(2)
    cleanup()
  })

  test('the server judges intents: out of turn is refused with a reason', async () => {
    const { blue, cleanup } = await setup()
    const errors: string[] = []
    blue.subscribe((update) => update.error && errors.push(update.error))
    playOne(blue, 'player2')
    await flush()
    expect(errors).toContain('It is not your turn.')
    cleanup()
  })

  test('a connection cannot speak for another client', async () => {
    const { server, matchId, cleanup } = await setup()
    const sent: string[] = []
    const raw = server.accept({ send: (text) => sent.push(text), close: () => {} })
    const envelope = { v: PROTOCOL_VERSION, matchId }
    raw.receive(JSON.stringify({ ...envelope, from: 'sneaky', type: 'ping', seat: 'player1' }))
    // Same connection, now pretending to be Red's tab.
    const action = legalActions(server.hostOf(matchId)!.getSnapshot().state.position).find((a) => a.type === 'move')!
    raw.receive(
      JSON.stringify({
        ...envelope,
        from: 'red-tab',
        type: 'intent',
        seat: 'player1',
        nonce: 'x',
        intent: { type: 'engine', action },
      }),
    )
    await flush()
    expect(server.hostOf(matchId)?.getSnapshot().state.lastSeq).toBe(0)
    raw.drop()
    cleanup()
  })

  test('bad frames, unknown matches and local games are not served', async () => {
    const { store } = memoryStore()
    const server = new MatchServer({ store })
    const sent: NetMessage[] = []
    const raw = server.accept({ send: (text) => sent.push(JSON.parse(text) as NetMessage), close: () => {} })
    raw.receive('not json')
    raw.receive(JSON.stringify({ v: PROTOCOL_VERSION, matchId: 'nope', from: 'a', type: 'action' }))
    expect(sent).toEqual([])
    raw.receive(JSON.stringify({ v: PROTOCOL_VERSION, matchId: 'nope', from: 'a', type: 'join', seat: 'player1' }))
    expect(sent.map((m) => m.type)).toEqual(['closed'])

    // A pass-and-play game is not the server's to host.
    const local = createRecord({
      mode: 'local',
      settings: makeSettings({ boardSize: 5 }),
      seats: { player1: { kind: 'human', name: '' }, player2: { kind: 'remote', name: '' } },
    })
    store.save(local)
    raw.receive(JSON.stringify({ v: PROTOCOL_VERSION, matchId: local.config.id, from: 'a', type: 'join', seat: 'player2' }))

    // Nor is a stored game that no longer replays (Blue moving first).
    const broken = createRecord({
      mode: 'online',
      settings: makeSettings({ boardSize: 5 }),
      seats: { player1: { kind: 'remote', name: '' }, player2: { kind: 'remote', name: '' } },
    })
    broken.actions.push({
      seq: 1,
      at: 0,
      by: 'player2',
      intent: { type: 'engine', action: { type: 'resign', player: 'player1' } },
    })
    store.save(broken)
    raw.receive(JSON.stringify({ v: PROTOCOL_VERSION, matchId: broken.config.id, from: 'a', type: 'join', seat: 'player2' }))

    expect(sent.map((m) => m.type)).toEqual(['closed', 'closed', 'closed'])
    expect(server.openRooms).toEqual([])
    server.close()
  })

  test('a guest whose game the server does not have says so and stops asking', async () => {
    const { net, cleanup } = await setup()
    const transport = new WebSocketTransport('wss://example.test/matches', { createSocket: net.createSocket })
    const lost = new MatchGuest({ matchId: 'expired', seat: 'player2', clientId: 'late-tab' })
    const sent: string[] = []
    const send = transport.send.bind(transport)
    transport.send = (message) => {
      sent.push(message.type)
      send(message)
    }
    lost.connect(transport)
    await flush()
    expect(lost.getSnapshot().connection).toBe('missing')
    const asked = sent.length
    vi.advanceTimersByTime(10_000)
    await flush()
    expect(sent.length).toBe(asked)
    lost.dispose()
    transport.close()
    cleanup()
  })

  test('a guest that played on and then hears "closed" is disconnected, not told the game is gone', async () => {
    const { red, net, cleanup } = await setup()
    net.server!.close()
    // A restarted server that lost the room still answers; here it answers "closed" to everything.
    for (const socket of net.sockets) socket.cut()
    net.server = new MatchServer({ store: memoryStore().store })
    vi.advanceTimersByTime(3000)
    await flush()
    expect(red.getSnapshot().connection).not.toBe('missing')
    cleanup()
  })

  test('a dropped link reconnects by itself and catches up on moves it missed', async () => {
    const { server, matchId, net, red, blue, cleanup } = await setup()
    const blueSocket = net.sockets[1]
    blueSocket.cut()
    await flush()
    playOne(red, 'player1')
    await flush()
    expect(blue.getSnapshot().state.lastSeq).toBe(0)

    await vi.advanceTimersByTimeAsync(600) // first reconnect attempt
    await flush()
    expect(net.sockets).toHaveLength(3)
    // The guest's next heartbeat introduces the new connection, and the server answers with the game.
    await vi.advanceTimersByTimeAsync(1_500)
    await flush()
    expect(blue.getSnapshot().state.lastSeq).toBe(1)
    expect(server.hostOf(matchId)?.getSnapshot().online.player2).toBe(true)
    cleanup()
  })

  test('rooms close when everyone leaves and reopen from the store, even after a server restart', async () => {
    const { store, matchId, net, red, blue, server, cleanup } = await setup()
    playOne(red, 'player1')
    await flush()
    expect(server.openRooms).toEqual([matchId])

    // The server crashes: every connection drops without a goodbye, so the
    // guests still count themselves seated, and nothing answers for a moment.
    net.server = null
    for (const socket of net.sockets) socket.cut()
    expect(server.openRooms).toEqual([])

    // A new server process with the same store comes up and has no seat
    // claims; the guests' heartbeats must win their seats back.
    const restarted = new MatchServer({ store })
    net.server = restarted
    await vi.advanceTimersByTimeAsync(5_000)
    await flush()
    const host = restarted.hostOf(matchId)!
    expect(host.getSnapshot().state.lastSeq).toBe(1)
    expect(host.getSnapshot().online).toEqual({ player1: true, player2: true })

    playOne(blue, 'player2')
    await flush()
    expect(red.getSnapshot().state.lastSeq).toBe(2)
    restarted.close()
    cleanup()
  })

  test('the server calls time when a clock runs out', async () => {
    const { server, matchId, red, blue, cleanup } = await setup({
      boardSize: 5,
      timeControl: { initialMs: 10_000, incrementMs: 0, label: '0:10+0' },
    })
    playOne(red, 'player1') // first moves are free: nothing runs yet
    await flush()
    await vi.advanceTimersByTimeAsync(10_500)
    await flush()
    expect(server.hostOf(matchId)!.getSnapshot().state.position.status.kind).toBe('playing')
    playOne(blue, 'player2') // both have moved: Red's clock starts
    await flush()
    await vi.advanceTimersByTimeAsync(10_500)
    await flush()
    const status = server.hostOf(matchId)!.getSnapshot().state.position.status
    expect(status).toEqual({ kind: 'win', winner: 'player2', reason: 'timeout' })
    expect(red.getSnapshot().state.position.status).toEqual(status)
    cleanup()
  })
})

describe('WebSocketTransport', () => {
  class ScriptedSocket {
    readyState = 0
    onopen: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null
    sent: string[] = []
    send(text: string) {
      this.sent.push(text)
    }
    close() {
      this.readyState = 3
    }
    open() {
      this.readyState = 1
      this.onopen?.({} as Event)
    }
    fail() {
      this.readyState = 3
      this.onclose?.({} as CloseEvent)
    }
  }

  const ping: NetMessage = { v: PROTOCOL_VERSION, matchId: 'm', from: 'c', type: 'ping', seat: 'player1' }

  test('holds messages until the socket opens, then sends them in order', () => {
    const socket = new ScriptedSocket()
    const transport = new WebSocketTransport('wss://x', { createSocket: () => socket })
    transport.send(ping)
    transport.send({ ...ping, type: 'leave' })
    expect(socket.sent).toEqual([])
    socket.open()
    expect(socket.sent.map((text) => (JSON.parse(text) as NetMessage).type)).toEqual(['ping', 'leave'])
    expect(transport.connected).toBe(true)
    transport.close()
  })

  test('reconnects with growing delays until closed', () => {
    const sockets: ScriptedSocket[] = []
    const transport = new WebSocketTransport('wss://x', {
      createSocket: () => {
        const socket = new ScriptedSocket()
        sockets.push(socket)
        return socket
      },
      minDelayMs: 100,
      maxDelayMs: 1_000,
    })
    sockets[0].fail()
    vi.advanceTimersByTime(99)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)
    sockets[1].fail()
    vi.advanceTimersByTime(199)
    expect(sockets).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(3)

    transport.close()
    sockets[2].fail()
    vi.advanceTimersByTime(5_000)
    expect(sockets).toHaveLength(3)
  })

  test('passes on well-formed messages and ignores anything else', () => {
    const socket = new ScriptedSocket()
    const transport = new WebSocketTransport('wss://x', { createSocket: () => socket })
    socket.open()
    const received: NetMessage[] = []
    transport.onMessage((message) => received.push(message))
    socket.onmessage?.({ data: '{oops' } as MessageEvent)
    socket.onmessage?.({ data: JSON.stringify({ hello: 1 }) } as MessageEvent)
    socket.onmessage?.({ data: JSON.stringify(ping) } as MessageEvent)
    expect(received).toEqual([ping])
    transport.close()
  })
})

describe('matchmaking', () => {
  const seek = (id: string, rating: number, since = 0, settings: Partial<RuleSettings> = { boardSize: 5 }): Seek => ({
    id,
    playerId: `p-${id}`,
    settings: makeSettings(settings),
    rating,
    since,
  })

  test('pairs two compatible seeks straight away and takes them off the queue', () => {
    const queue = new SeekQueue({ random: () => 0 })
    expect(queue.add(seek('a', 1500), 0)).toBeNull()
    const pairing = queue.add(seek('b', 1550), 0)!
    expect(pairing.seats.player1.id).toBe('b')
    expect(pairing.seats.player2.id).toBe('a')
    expect(queue.waiting).toHaveLength(0)
  })

  test('never pairs incompatible rules or a player with themselves', () => {
    const queue = new SeekQueue()
    queue.add(seek('a', 1500), 0)
    expect(queue.add(seek('b', 1500, 0, { boardSize: 7 }), 0)).toBeNull()
    expect(queue.add({ ...seek('c', 1500), playerId: 'p-a' }, 0)).toBeNull()
    // The player's new seek replaced their old one.
    expect(queue.waiting.map((s) => s.id)).toEqual(['b', 'c'])
  })

  test('a wide rating gap waits until both windows have grown', () => {
    const queue = new SeekQueue()
    queue.add(seek('a', 1500, 0), 0)
    queue.add(seek('b', 1800, 0), 0)
    expect(ratingWindow(0)).toBe(100)
    expect(queue.sweep(10_000)).toHaveLength(0) // window 200
    const pairings = queue.sweep(20_000) // window 300
    expect(pairings).toHaveLength(1)
    expect(queue.waiting).toHaveLength(0)
  })

  test('prefers the closest rating', () => {
    const queue = new SeekQueue()
    queue.add(seek('far', 1590), 0)
    queue.add(seek('near', 1510, 0, { boardSize: 5, promotionPolicy: 'end-turn-on-promotion' }), 0)
    queue.add(seek('near-ok', 1420), 0)
    const pairing = queue.add(seek('me', 1500), 0)!
    const ids = [pairing.seats.player1.id, pairing.seats.player2.id]
    expect(ids).toContain('near-ok')
  })

  test('"match opponent" takes the other side’s promotion rule', () => {
    const queue = new SeekQueue({ random: () => 0.9 })
    queue.add(seek('a', 1500, 0, { boardSize: 5, promotionPolicy: 'match-opponent' }), 0)
    const pairing = queue.add(seek('b', 1500, 0, { boardSize: 5, promotionPolicy: 'promote-after-chain' }), 0)!
    expect(pairing.settings.promotionPolicy).toBe('promote-after-chain')
    expect(
      agreedSettings(makeSettings({ promotionPolicy: 'match-opponent' }), makeSettings({ promotionPolicy: 'match-opponent' }))
        .promotionPolicy,
    ).not.toBe('match-opponent')
  })

  test('a pairing becomes a server game, and the server reports the result once for rating', async () => {
    const { store } = memoryStore()
    const finished: number[] = []
    const ratings = new Map<string, Rating>()
    const server = new MatchServer({
      store,
      onFinished: (record, state) => {
        const score = ratedScore(state)
        finished.push(record.actions.length)
        if (score === null) return
        const [a, b] = rateGame(ratings.get('red') ?? newRating(), ratings.get('blue') ?? newRating(), score)
        ratings.set('red', a)
        ratings.set('blue', b)
      },
    })
    const queue = new SeekQueue({ random: () => 0 })
    queue.add(seek('red', 1500), 0)
    const pairing = queue.add(seek('blue', 1500), 0)!
    const matchId = server.createMatch(pairing.settings)
    const net = new FakeNet(server)
    const join = (seat: PlayerId, clientId: string) => {
      const guest = new MatchGuest({ matchId, seat, clientId })
      guest.connect(new WebSocketTransport('wss://example.test', { createSocket: net.createSocket }))
      return guest
    }
    const red = join('player1', 'red-tab')
    const blue = join('player2', 'blue-tab')
    await flush()
    playOne(red, 'player1')
    await flush()
    playOne(blue, 'player2')
    await flush()
    red.submit('player1', { type: 'engine', action: { type: 'resign', player: 'player1' } })
    await flush()
    expect(finished).toEqual([3])
    expect(ratings.get('blue')?.rating).toBe(1520)
    expect(ratings.get('red')?.rating).toBe(1480)

    // Reopening the finished game does not report it again.
    red.dispose()
    blue.dispose()
    for (const socket of net.sockets) socket.cut()
    const again = join('player1', 'red-tab')
    await flush()
    expect(server.hostOf(matchId)).not.toBeNull()
    expect(finished).toEqual([3])
    again.dispose()
    server.close()
  })
})

describe('seats and accounts', () => {
  const joinAs = (net: FakeNet, matchId: string, seat: PlayerId, clientId: string, identity: Identity | null) => {
    net.identity = identity
    const guest = new MatchGuest({ matchId, seat, clientId })
    guest.connect(new WebSocketTransport('wss://example.test', { createSocket: net.createSocket }))
    return guest
  }

  test('a signed-in player claims their seat in a casual game, and both sides are told', async () => {
    const { store, metas } = memoryStore()
    const server = new MatchServer({ store })
    const matchId = server.createMatch({ boardSize: 5 })
    const net = new FakeNet(server)
    const red = joinAs(net, matchId, 'player1', 'red-tab', alice)
    await flush()
    const blue = joinAs(net, matchId, 'player2', 'blue-tab', null)
    await flush()
    expect(blue.getSnapshot().accounts).toEqual({ player1: alice, player2: null })
    expect(red.getSnapshot().rated).toBe(false)
    expect(metas.get(matchId)?.accounts.player1?.id).toBe('u-alice')

    // Alice's seat is hers: a guest who opens her link after she leaves cannot take it.
    red.dispose()
    for (const socket of net.sockets.slice(0, 1)) socket.cut()
    await vi.advanceTimersByTimeAsync(7000)
    const intruder = joinAs(net, matchId, 'player1', 'other-tab', null)
    await flush()
    expect(intruder.getSnapshot().connection).toBe('disconnected')
    const bobTries = joinAs(net, matchId, 'player1', 'bob-tab', bob)
    await flush()
    expect(bobTries.getSnapshot().connection).toBe('disconnected')
    const back = joinAs(net, matchId, 'player1', 'alice-new-tab', alice)
    await flush()
    expect(back.getSnapshot().connection).toBe('connected')
    for (const guest of [blue, intruder, bobTries, back]) guest.dispose()
    server.close()
  })

  test('one account at both seats claims only the first', async () => {
    const { store } = memoryStore()
    const server = new MatchServer({ store })
    const matchId = server.createMatch({ boardSize: 5 })
    const net = new FakeNet(server)
    const red = joinAs(net, matchId, 'player1', 'tab-1', alice)
    await flush()
    const blue = joinAs(net, matchId, 'player2', 'tab-2', alice)
    await flush()
    expect(blue.getSnapshot().connection).toBe('connected')
    expect(blue.getSnapshot().accounts).toEqual({ player1: alice, player2: null })
    red.dispose()
    blue.dispose()
    server.close()
  })

  test('a rated game is only for its two accounts, and shows their new ratings at the end', async () => {
    const { store, metas } = memoryStore()
    const reported: RoomMeta[] = []
    const server = new MatchServer({
      store,
      onFinished: async (_record, _state, meta) => {
        reported.push(meta)
        return {
          player1: { ...meta.accounts.player1!, rating: 1480, change: -20 },
          player2: { ...meta.accounts.player2!, rating: 1520, change: 20 },
        }
      },
    })
    const matchId = server.createMatch({ boardSize: 5 })
    metas.set(matchId, {
      ...emptyMeta(),
      rated: true,
      accounts: { player1: { ...alice, rating: 1500 }, player2: { ...bob, rating: 1500 } },
    })
    const net = new FakeNet(server)
    const stranger = joinAs(net, matchId, 'player2', 'stranger', null)
    await flush()
    expect(stranger.getSnapshot().connection).toBe('disconnected')
    const red = joinAs(net, matchId, 'player1', 'red-tab', alice)
    const blue = joinAs(net, matchId, 'player2', 'blue-tab', bob)
    await flush()
    expect(red.getSnapshot()).toMatchObject({ connection: 'connected', rated: true })
    playOne(red, 'player1')
    await flush()
    playOne(blue, 'player2')
    await flush()
    red.submit('player1', { type: 'engine', action: { type: 'resign', player: 'player1' } })
    await flush()
    expect(reported).toHaveLength(1)
    expect(red.getSnapshot().accounts?.player1).toMatchObject({ rating: 1480, change: -20 })
    expect(blue.getSnapshot().accounts?.player2).toMatchObject({ rating: 1520, change: 20 })
    expect(metas.get(matchId)?.accounts.player2?.rating).toBe(1520)
    for (const guest of [stranger, red, blue]) guest.dispose()
    server.close()
  })
})
