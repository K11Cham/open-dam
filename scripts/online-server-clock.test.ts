import { expect, test } from 'vitest'
import { legalActions } from '../src/game/engine'
import type { PlayerId } from '../src/game/types'
import { MatchGuest } from '../src/net/guest'
import { WebSocketTransport } from '../src/net/websocket'
import type { SocketLike } from '../src/net/websocket'

/**
 * A timed game both players leave must still end when the clock runs out:
 * the match room's alarm calls the flag with nobody connected. It waits a
 * full minute, so it runs only when asked: `ONLINE_SLOW=1 npm run
 * check:online` (against `npm run server`, or ONLINE_URL).
 */
const BASE = (process.env.ONLINE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const createSocket = (url: string) => new WebSocket(url) as unknown as SocketLike

async function until(what: string, check: () => boolean, timeoutMs = 20_000) {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test.runIf(process.env.ONLINE_SLOW)(
  'an abandoned timed game is flagged with nobody connected',
  async () => {
    const response = await fetch(`${BASE}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { boardSize: 5, timeControl: { label: '1+0' } } }),
    })
    const { id } = (await response.json()) as { id: string }
    const url = `${BASE.replace(/^http/, 'ws')}/api/matches/${id}/socket`
    const open: Array<{ guest: MatchGuest; transport: WebSocketTransport }> = []
    const join = (seat: PlayerId, clientId: string) => {
      const guest = new MatchGuest({ matchId: id, seat, clientId })
      const transport = new WebSocketTransport(url, { createSocket })
      guest.connect(transport)
      open.push({ guest, transport })
      return guest
    }
    const players = { player1: join('player1', 'p1'), player2: join('player2', 'p2') }
    await until('both connected', () => Object.values(players).every((g) => g.getSnapshot().connection === 'connected'))
    for (let i = 0; i < 2; i++) {
      const { position, lastSeq } = players.player1.getSnapshot().state
      const mover = position.currentPlayer
      expect(players[mover].submit(mover, { type: 'engine', action: legalActions(position)[0] })).toBeNull()
      await until(
        'move',
        () => players.player2.getSnapshot().state.lastSeq > lastSeq && players.player1.getSnapshot().state.lastSeq > lastSeq,
      )
    }
    const running = players.player1.getSnapshot().state.clock?.running
    for (const { guest, transport } of open) {
      guest.disconnect()
      transport.close()
    }
    // Nobody is connected while the clock runs out.
    await new Promise((resolve) => setTimeout(resolve, 63_000))
    const late = join('player2', 'late')
    await until('a snapshot', () => late.getSnapshot().state.lastSeq >= 2)
    const status = late.getSnapshot().state.position.status
    expect(status).toMatchObject({ kind: 'win', reason: 'timeout' })
    expect(status.kind === 'win' && status.winner).not.toBe(running)
    open.at(-1)!.guest.disconnect()
    open.at(-1)!.transport.close()
  },
  120_000,
)
