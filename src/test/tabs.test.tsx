import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import { makeSettings } from '../game/settings'
import { createRecord } from '../match/session'
import { STORAGE_KEYS } from '../services/storage'

/**
 * One saved game, two tabs. jsdom has one document, so the "other tab" is
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
