import { afterAll, describe, expect, test } from 'vitest'
import { legalActions } from '../src/game/engine'
import type { PlayerId } from '../src/game/types'
import { MatchGuest } from '../src/net/guest'
import { PROTOCOL_VERSION } from '../src/net/protocol'
import type { NetMessage } from '../src/net/protocol'
import { WebSocketTransport } from '../src/net/websocket'
import type { SocketLike } from '../src/net/websocket'

/**
 * Plays real games against a running online server: `npm run server` (the
 * Worker under wrangler dev, on port 8787) or a deployed one given as
 * ONLINE_URL. Run with `npm run check:online`.
 *
 * The unit tests in src/net/server.test.ts already cover the match logic over
 * a fake network; this checks the parts only a real server has: the HTTP
 * route, the WebSocket upgrade, the Durable Object's storage, and frames
 * crossing a real socket.
 */

const BASE = (process.env.ONLINE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const socketUrl = (matchId: string) => `${BASE.replace(/^http/, 'ws')}/api/matches/${matchId}/socket`
const createSocket = (url: string) => new WebSocket(url) as unknown as SocketLike

async function until(what: string, check: () => boolean, timeoutMs = 10_000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

async function createMatch(settings: object = { boardSize: 5 }): Promise<string> {
  const response = await fetch(`${BASE}/api/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  })
  expect(response.status).toBe(201)
  const { id } = (await response.json()) as { id: string }
  return id
}

const open: { guest: MatchGuest; transport: WebSocketTransport }[] = []

function player(matchId: string, seat: PlayerId, clientId: string) {
  const guest = new MatchGuest({ matchId, seat, clientId })
  const transport = new WebSocketTransport(socketUrl(matchId), { createSocket })
  guest.connect(transport)
  const errors: string[] = []
  guest.subscribe((update) => update.error && errors.push(update.error))
  const entry = { guest, transport }
  open.push(entry)
  return { guest, transport, errors }
}

const leave = ({ guest, transport }: { guest: MatchGuest; transport: WebSocketTransport }) => {
  guest.disconnect()
  transport.close()
}

/** Whoever is to move plays their first legal move; resolves once both sides have it. */
async function playOne(players: Record<PlayerId, MatchGuest>) {
  const { position, lastSeq } = players.player1.getSnapshot().state
  const mover = position.currentPlayer
  const [action] = legalActions(position)
  expect(players[mover].submit(mover, { type: 'engine', action })).toBeNull()
  await until('the move to reach both players', () =>
    (['player1', 'player2'] as PlayerId[]).every((seat) => players[seat].getSnapshot().state.lastSeq > lastSeq),
  )
}

afterAll(() => {
  for (const entry of open) leave(entry)
})

describe(`online server at ${BASE}`, () => {
  test('is up', async () => {
    const response = await fetch(`${BASE}/api/health`).catch(() => null)
    expect(response?.ok, `nothing answered at ${BASE}; start it with npm run server`).toBe(true)
  })

  test('refuses bad requests', async () => {
    expect((await fetch(`${BASE}/api/matches`, { method: 'POST', body: 'not json' })).status).toBe(400)
    expect((await fetch(`${BASE}/api/matches`, { method: 'POST', body: 'x'.repeat(5000) })).status).toBe(413)
    expect((await fetch(`${BASE}/api/matches`)).status).toBe(405)
    expect((await fetch(`${BASE}/api/matches/not%20an%20id/socket`)).status).toBe(404)
    expect((await fetch(`${BASE}/api/matches/abc/socket`)).status).toBe(426)
  })

  test('two players play, one drops and comes back, and a third cannot take a seat', async () => {
    const matchId = await createMatch()
    const red = player(matchId, 'player1', `red-${matchId}`)
    const blue = player(matchId, 'player2', `blue-${matchId}`)
    await until('both players to be seated', () =>
      [red, blue].every(({ guest }) => {
        const { connection, online } = guest.getSnapshot()
        return connection === 'connected' && online.player1 && online.player2
      }),
    )
    expect(red.guest.getSnapshot().record.config.settings.boardSize).toBe(5)

    const players = { player1: red.guest, player2: blue.guest }
    for (let i = 0; i < 4; i++) await playOne(players)

    // Blue's link drops. Red sees Blue go, and can still move.
    leave(blue)
    await until('Red to see Blue leave', () => !red.guest.getSnapshot().online.player2)
    if (red.guest.getSnapshot().state.position.currentPlayer === 'player2') {
      throw new Error('Expected Red to be on move after four plies')
    }
    const before = red.guest.getSnapshot().state.lastSeq
    const [move] = legalActions(red.guest.getSnapshot().state.position)
    red.guest.submit('player1', { type: 'engine', action: move })
    await until('Red’s move to be accepted', () => red.guest.getSnapshot().state.lastSeq > before)

    // Blue comes back on a new connection, as after a reload, and catches up.
    const back = player(matchId, 'player2', `blue-${matchId}`)
    await until('Blue to catch up', () => back.guest.getSnapshot().state.lastSeq === red.guest.getSnapshot().state.lastSeq)
    expect(back.guest.getSnapshot().record.actions).toEqual(red.guest.getSnapshot().record.actions)
    await playOne({ player1: red.guest, player2: back.guest })

    // Someone else opening Blue's link while Blue plays is turned away.
    const intruder = player(matchId, 'player2', `intruder-${matchId}`)
    await until('the intruder to be refused', () => intruder.errors.length > 0)
    expect(intruder.errors[0]).toMatch(/already playing/)
    expect(intruder.guest.submit('player2', { type: 'engine', action: move })).not.toBeNull()
  })

  test('a game survives everyone leaving: the record was stored', async () => {
    const matchId = await createMatch({ boardSize: 7 })
    const red = player(matchId, 'player1', `r-${matchId}`)
    const blue = player(matchId, 'player2', `b-${matchId}`)
    await until('both seated', () => [red, blue].every(({ guest }) => guest.getSnapshot().connection === 'connected'))
    const players = { player1: red.guest, player2: blue.guest }
    for (let i = 0; i < 3; i++) await playOne(players)
    const actions = red.guest.getSnapshot().record.actions
    leave(red)
    leave(blue)
    // Give the room time to close, so the next visit reopens it from storage.
    await new Promise((resolve) => setTimeout(resolve, 500))

    const later = player(matchId, 'player1', `r2-${matchId}`)
    await until('the game to come back', () => later.guest.getSnapshot().state.lastSeq === actions.length)
    expect(later.guest.getSnapshot().record.actions).toEqual(actions)
    expect(later.guest.getSnapshot().record.config.settings.boardSize).toBe(7)
  })

  test('an unknown game is reported closed', async () => {
    const replies: NetMessage[] = []
    const transport = new WebSocketTransport(socketUrl('doesnotexist'), { createSocket })
    transport.onMessage((message) => replies.push(message))
    transport.send({ v: PROTOCOL_VERSION, matchId: 'doesnotexist', from: 'someone', type: 'join', seat: 'player1' })
    await until('an answer', () => replies.length > 0)
    expect(replies[0].type).toBe('closed')
    transport.close()
  })

  test('a socket for one game cannot reach another', async () => {
    const real = await createMatch()
    const replies: NetMessage[] = []
    const transport = new WebSocketTransport(socketUrl('someotherid'), { createSocket })
    transport.onMessage((message) => replies.push(message))
    transport.send({ v: PROTOCOL_VERSION, matchId: real, from: 'someone', type: 'join', seat: 'player1' })
    await until('an answer', () => replies.length > 0)
    expect(replies[0].type).toBe('closed')
    transport.close()
  })
})
