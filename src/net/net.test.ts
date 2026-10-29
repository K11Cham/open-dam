import { afterEach, describe, expect, test, vi } from 'vitest'
import { legalActions } from '../game/engine'
import { makeSettings } from '../game/settings'
import { MatchHost, createRecord } from '../match/session'
import { MatchGuest } from './guest'
import { linkHost } from './hostLink'
import { PROTOCOL_VERSION } from './protocol'
import { MemoryHub } from './transport'

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

const setup = () => {
  const hub = new MemoryHub()
  const record = createRecord({
    mode: 'online',
    settings: makeSettings({ boardSize: 5 }),
    seats: { player1: { kind: 'human', name: 'Host' }, player2: { kind: 'remote', name: 'Guest' } },
  })
  const host = new MatchHost(record, { connection: 'waiting-for-opponent' })
  const unlink = linkHost(host, hub.connect(), { hostSeat: 'player1', clientId: 'host-tab' })
  const guest = new MatchGuest({ matchId: record.config.id, seat: 'player2', clientId: 'guest-tab' })
  guest.connect(hub.connect())
  return { hub, host, guest, unlink, record }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('host and guest over a transport', () => {
  test('a guest joins and receives the game', async () => {
    const { guest, host, unlink } = setup()
    await flush()
    expect(guest.getSnapshot().connection).toBe('connected')
    expect(guest.getSnapshot().record.config.id).toBe(host.getSnapshot().record.config.id)
    expect(host.getSnapshot().online.player2).toBe(true)
    unlink()
    guest.dispose()
  })

  test('host moves reach the guest and guest moves reach the host', async () => {
    const { guest, host, unlink } = setup()
    await flush()
    host.submit('player1', { type: 'engine', action: { type: 'move', from: { row: 3, col: 2 }, to: { row: 2, col: 2 } } })
    await flush()
    expect(guest.getSnapshot().state.position.currentPlayer).toBe('player2')

    const action = legalActions(guest.getSnapshot().state.position).find((a) => a.type === 'move')!
    guest.submit('player2', { type: 'engine', action })
    await flush()
    expect(host.getSnapshot().state.lastSeq).toBe(2)
    expect(JSON.stringify(guest.getSnapshot().state)).toBe(JSON.stringify(host.getSnapshot().state))
    unlink()
    guest.dispose()
  })

  test('the host refuses a guest acting out of turn and says why', async () => {
    const { guest, unlink } = setup()
    await flush()
    const errors: string[] = []
    guest.subscribe((u) => u.error && errors.push(u.error))
    guest.submit('player2', { type: 'engine', action: { type: 'move', from: { row: 1, col: 2 }, to: { row: 2, col: 2 } } })
    await flush()
    expect(errors).toContain('It is not your turn.')
    unlink()
    guest.dispose()
  })

  test('a guest cannot act for the host’s side', async () => {
    const { guest, unlink } = setup()
    await flush()
    expect(guest.submit('player1', { type: 'offer', kind: 'draw' })).toBeTruthy()
    unlink()
    guest.dispose()
  })

  test('a second client cannot take an occupied seat', async () => {
    const { hub, record, unlink, guest } = setup()
    await flush()
    const intruder = new MatchGuest({ matchId: record.config.id, seat: 'player2', clientId: 'other-tab' })
    const errors: string[] = []
    intruder.subscribe((u) => u.error && errors.push(u.error))
    intruder.connect(hub.connect())
    await flush()
    expect(errors[0]).toMatch(/already playing/)
    intruder.dispose()
    unlink()
    guest.dispose()
  })

  test('a heartbeat from another client does not take a held seat', async () => {
    const { hub, record, host, unlink, guest } = setup()
    await flush()
    const sent: string[] = []
    const other = hub.connect()
    other.onMessage((message) => sent.push(message.type))
    other.send({ v: PROTOCOL_VERSION, matchId: record.config.id, from: 'other-tab', type: 'ping', seat: 'player2' })
    await flush()
    expect(sent).not.toContain('welcome')
    expect(host.getSnapshot().online.player2).toBe(true)
    other.close()
    unlink()
    guest.dispose()
  })

  test('a guest that reconnects gets the full game again', async () => {
    const { hub, host, record, unlink, guest } = setup()
    await flush()
    host.submit('player1', { type: 'engine', action: { type: 'move', from: { row: 3, col: 2 }, to: { row: 2, col: 2 } } })
    guest.dispose() // tab closed
    await flush()
    const again = new MatchGuest({ matchId: record.config.id, seat: 'player2', clientId: 'guest-tab' })
    again.connect(hub.connect())
    await flush()
    expect(again.getSnapshot().state.lastSeq).toBe(1)
    again.dispose()
    unlink()
  })
})
