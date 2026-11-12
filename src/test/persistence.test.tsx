import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import { legalActions } from '../game/engine'
import { TIME_CONTROLS, makeSettings } from '../game/settings'
import { useMatchPersistence } from '../hooks/useMatchPersistence'
import { MatchHost, createRecord } from '../match/session'
import { STORAGE_KEYS } from '../services/storage'

/**
 * Saving a game on this device. One saved game, two tabs: jsdom has one document, so the "other tab" is
 * played by writing localStorage directly, the way another tab's write
 * arrives: no in-page announcement, and a `storage` event only when we send one.
 */

const renderAt = (path: string) =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )

const square = (name: string) => screen.getByRole('gridcell', { name: new RegExp(`^${name},`) })

const tap = (element: Element) => {
  fireEvent.pointerDown(element, { button: 0, clientX: 1, clientY: 1 })
  fireEvent.pointerUp(window, { button: 0, clientX: 1, clientY: 1 })
}

const newerGame = () =>
  createRecord({
    mode: 'local',
    settings: makeSettings({ boardSize: 7 }),
    seats: { player1: { kind: 'human', name: 'Red' }, player2: { kind: 'human', name: 'Blue' } },
  })

/** What another tab does when it starts a game: write the slot, and the browser tells the other tabs. */
const otherTabSaves = (record: ReturnType<typeof createRecord>, announce: boolean) => {
  const value = JSON.stringify({ record, savedAt: Date.now() })
  localStorage.setItem(STORAGE_KEYS.activeMatch, value)
  if (announce) window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.activeMatch, newValue: value }))
}

const savedId = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.activeMatch) ?? 'null')?.record?.config?.id ?? null

describe('a game open in two tabs', () => {
  test('a tab left on an older game stops when another tab saves, and closing it keeps the newer game', async () => {
    const view = renderAt('/match/new?vs=hotseat&size=5')
    await screen.findByRole('grid')
    tap(square('c2'))
    fireEvent.click(square('c3'))

    const newer = newerGame()
    otherTabSaves(newer, true)

    expect(await screen.findByRole('heading', { name: 'This game moved on in another tab' })).toBeInTheDocument()
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    view.unmount()
    expect(savedId()).toBe(newer.config.id)
  })

  test('a move in a tab that missed the other tab’s save is not written over it', async () => {
    renderAt('/match/new?vs=hotseat&size=5')
    await screen.findByRole('grid')

    const newer = newerGame()
    otherTabSaves(newer, false)
    tap(square('c2'))
    fireEvent.click(square('c3'))

    expect(savedId()).toBe(newer.config.id)
    expect(await screen.findByRole('heading', { name: 'This game moved on in another tab' })).toBeInTheDocument()
  })

  test('the stopped tab opens the newer game when asked', async () => {
    renderAt('/match/new?vs=hotseat&size=5')
    await screen.findByRole('grid')
    const newer = newerGame()
    otherTabSaves(newer, true)
    fireEvent.click(await screen.findByRole('button', { name: 'Open the latest game' }))
    const grid = await screen.findByRole('grid')
    expect(grid).toHaveAccessibleName(/7 by 7/)
  })
})

describe('leaving the page', () => {
  /** A timed pass-and-play game in which both sides have moved, so the clock is running. */
  const runningClock = () => {
    const host = new MatchHost(
      createRecord({
        mode: 'local',
        settings: makeSettings({ boardSize: 5, timeControl: TIME_CONTROLS[0] }),
        seats: { player1: { kind: 'human', name: 'Red' }, player2: { kind: 'human', name: 'Blue' } },
      }),
    )
    for (const by of ['player1', 'player2'] as const) {
      const action = legalActions(host.getSnapshot().state.position).find((a) => a.type === 'move')!
      host.submit(by, { type: 'engine', action })
    }
    return host
  }

  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  test('switching to another app pauses a local clock, and coming back resumes it', () => {
    const host = runningClock()
    expect(host.getSnapshot().state.clock?.running).toBe('player1')
    renderHook(() => useMatchPersistence(host))
    setHidden(true)
    expect(host.getSnapshot().state.clock?.paused).toBe(true)
    setHidden(false)
    expect(host.getSnapshot().state.clock?.paused).toBe(false)
  })
})
