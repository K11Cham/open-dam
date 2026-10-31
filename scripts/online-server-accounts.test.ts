import { afterAll, describe, expect, test } from 'vitest'
import { legalActions } from '../src/game/engine'
import type { PlayerId } from '../src/game/types'
import type { GameSummary, LeaderboardEntry, PrivateUser } from '../src/net/account'
import { MatchGuest } from '../src/net/guest'
import { PROTOCOL_VERSION } from '../src/net/protocol'
import type { LobbyReply } from '../src/net/protocol'
import { WebSocketTransport } from '../src/net/websocket'
import type { SocketLike } from '../src/net/websocket'

/**
 * Accounts against a running server, local or deployed (ONLINE_URL), as part
 * of `npm run check:online`. Two throwaway accounts sign up, find each other
 * through matchmaking, play a rated game, and show up on the leaderboard;
 * then both are deleted, so a run against the live site leaves no players
 * behind (their game stays, with both sides shown as deleted players).
 *
 * Node's WebSocket accepts headers, which a browser's does not, so the
 * session cookie is passed by hand here; a browser sends it by itself.
 */

const BASE = (process.env.ONLINE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const WS_BASE = BASE.replace(/^http/, 'ws')
const run = Math.random().toString(36).slice(2, 8)

async function until(what: string, check: () => boolean, timeoutMs = 10_000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const randomKey = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')

// Responses are checked field by field with expect, so their exact types add nothing here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

interface Person {
  user: PrivateUser
  key: string
  cookie: string
  api: ReturnType<typeof client>
}

const people: Person[] = []
/** The first test's account plays the rated game too, so a run makes only two accounts (one network may make five an hour). */
let first: Person | null = null

function client(cookie: string) {
  return async (path: string, init: { method?: string; body?: unknown; origin?: string } = {}) => {
    const response = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(init.origin ? { Origin: init.origin } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const body: Json = await response.json().catch(() => null)
    return { status: response.status, body }
  }
}

async function signUp(name: string): Promise<Person> {
  const key = randomKey()
  const response = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, key }),
  })
  expect(response.status).toBe(201)
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0]
  expect(cookie).toMatch(/^od_session=[0-9a-f]{64}$/)
  const body = (await response.json()) as { user: PrivateUser; recoveryCode: string }
  const person = { user: body.user, key, cookie, api: client(cookie) }
  people.push(person)
  return person
}

const socketWith = (cookie: string) => (url: string) =>
  new (WebSocket as unknown as new (url: string, init: object) => SocketLike)(url, { headers: { Cookie: cookie } })

function lobby(cookie: string) {
  const replies: LobbyReply[] = []
  const socket = socketWith(cookie)(`${WS_BASE}/api/lobby/socket`) as unknown as WebSocket
  socket.onmessage = (event) => replies.push(JSON.parse(String(event.data)) as LobbyReply)
  const opened = new Promise<void>((resolve) => (socket.onopen = () => resolve()))
  const seek = async (settings: object) => {
    await opened
    socket.send(JSON.stringify({ v: PROTOCOL_VERSION, channel: 'lobby', from: `tab-${run}`, type: 'seek', settings }))
  }
  return { replies, seek, close: () => socket.close() }
}

afterAll(async () => {
  for (const person of people) await person.api('/api/me', { method: 'DELETE', body: { key: person.key } })
})

describe(`accounts at ${BASE}`, () => {
  test('sign up, sign in, profile, settings and devices', async () => {
    const me = await signUp(`check-${run}-a`)
    first = me
    expect((await me.api('/api/me')).body.user.username).toBe(`check-${run}-a`)
    expect((await client('')('/api/me')).body.user).toBeNull()

    const wrong = await client('')('/api/auth/signin', { method: 'POST', body: { username: me.user.username, key: randomKey() } })
    expect(wrong.status).toBe(401)
    const again = await client('')('/api/auth/signin', { method: 'POST', body: { username: me.user.username, key: me.key } })
    expect(again.status).toBe(200)

    expect((await me.api('/api/me', { method: 'PATCH', body: { bio: 'x' }, origin: 'https://elsewhere.example' })).status).toBe(
      403,
    )
    expect(
      (await me.api('/api/me', { method: 'PATCH', body: { displayName: 'Checker', avatar: 'p2' } })).body.user,
    ).toMatchObject({
      displayName: 'Checker',
      avatar: 'p2',
    })

    expect(
      (await me.api('/api/me/data', { method: 'PUT', body: { entries: { theme: { value: 'sand', updatedAt: 5 } } } })).status,
    ).toBe(200)
    expect((await me.api('/api/me/data')).body.data.theme).toEqual({ value: 'sand', updatedAt: 5 })

    const sessions = (await me.api('/api/me/sessions')).body.sessions as Array<{ current: boolean }>
    expect(sessions.length).toBe(2)
    expect(sessions.filter((s) => s.current)).toHaveLength(1)

    const profile = await client('')(`/api/users/${me.user.username}`)
    expect(profile.body.user).toMatchObject({ displayName: 'Checker' })
    expect(JSON.stringify(profile.body)).not.toContain('showGames')
  })

  test('a guest cannot seek a rated game', async () => {
    const guest = lobby('')
    await guest.seek({ boardSize: 5 })
    await until('the lobby to answer', () => guest.replies.length > 0)
    expect(guest.replies[0]).toMatchObject({ type: 'seek-ended', reason: 'Sign in to find a rated game.' })
    guest.close()
  })

  test('two accounts are paired, play a rated game, and reach the leaderboard', async () => {
    const a = first ?? (await signUp(`check-${run}-a`))
    const b = await signUp(`check-${run}-b`)
    // An unusual pool, so a real player seeking at the same moment is not paired with a check.
    const settings = { boardSize: 8, timeControl: { label: '30+10' } }
    const lobbyA = lobby(a.cookie)
    const lobbyB = lobby(b.cookie)
    await lobbyA.seek(settings)
    await until('A to be seeking', () => lobbyA.replies.some((r) => r.type === 'seeking'))
    await lobbyB.seek(settings)
    await until('both to be paired', () => [lobbyA, lobbyB].every((l) => l.replies.some((r) => r.type === 'paired')))
    const pairedA = lobbyA.replies.find((r) => r.type === 'paired') as Extract<LobbyReply, { type: 'paired' }>
    const pairedB = lobbyB.replies.find((r) => r.type === 'paired') as Extract<LobbyReply, { type: 'paired' }>
    expect(pairedA.matchId).toBe(pairedB.matchId)
    expect(pairedA.seat).not.toBe(pairedB.seat)
    lobbyA.close()
    lobbyB.close()

    const matchId = pairedA.matchId
    const url = `${WS_BASE}/api/matches/${matchId}/socket`
    const join = (person: Person, seat: PlayerId) => {
      const guest = new MatchGuest({ matchId, seat, clientId: `${person.user.id}-tab` })
      const transport = new WebSocketTransport(url, { createSocket: socketWith(person.cookie) })
      guest.connect(transport)
      return { guest, transport }
    }

    // A guest with the link cannot take a seat in a rated game.
    const intruder = new MatchGuest({ matchId, seat: pairedA.seat, clientId: `intruder-${run}` })
    const intruderLink = new WebSocketTransport(url, { createSocket: socketWith('') })
    intruder.connect(intruderLink)
    await until('the intruder to be refused', () => intruder.getSnapshot().connection === 'disconnected')
    intruder.disconnect()
    intruderLink.close()

    const seats = { [pairedA.seat]: join(a, pairedA.seat), [pairedB.seat]: join(b, pairedB.seat) } as Record<
      PlayerId,
      ReturnType<typeof join>
    >
    await until('both to connect', () => Object.values(seats).every((s) => s.guest.getSnapshot().connection === 'connected'))
    const red = seats.player1.guest
    expect(red.getSnapshot()).toMatchObject({ rated: true })
    expect(red.getSnapshot().accounts?.player1?.rating).toBe(1500)

    for (let ply = 0; ply < 2; ply++) {
      const { position, lastSeq } = red.getSnapshot().state
      const mover = position.currentPlayer
      const [action] = legalActions(position)
      expect(seats[mover].guest.submit(mover, { type: 'engine', action })).toBeNull()
      await until('the move to land', () => red.getSnapshot().state.lastSeq > lastSeq)
    }
    red.submit('player1', { type: 'engine', action: { type: 'resign', player: 'player1' } })
    await until('the new ratings', () => red.getSnapshot().accounts?.player1?.change !== undefined)
    expect(red.getSnapshot().accounts?.player1).toMatchObject({ rating: 1480, change: -20 })
    expect(seats.player2.guest.getSnapshot().accounts?.player2).toMatchObject({ rating: 1520, change: 20 })
    for (const { guest, transport } of Object.values(seats)) {
      guest.disconnect()
      transport.close()
    }

    const board = (await client('')('/api/leaderboards/8x8%3A30%2B10')).body as { entries: LeaderboardEntry[] }
    const winner = seats.player2 === seats[pairedA.seat] ? a : b
    expect(board.entries.find((e) => e.player.id === winner.user.id)).toMatchObject({ rating: 1520, wins: 1 })

    const games = (await client('')(`/api/users/${winner.user.username}/games`)).body.games as GameSummary[]
    expect(games[0]).toMatchObject({ id: matchId, rated: true, winner: 'player2', reason: 'resignation' })
    const game = (await client('')(`/api/games/${matchId}`)).body
    expect(game.record.config.id).toBe(matchId)
  })
})
