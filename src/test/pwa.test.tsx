import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import type { PrivateUser } from '../net/account'
import { startPwa } from '../pwa/pwa'
import { STORAGE_KEYS, storage } from '../services/storage'

/**
 * The app without a network: the notice that says what still works, opening
 * signed in as the account last seen, and catching up when the connection
 * returns. The service worker itself is checked in a browser (it only runs
 * in a production build); its rules are in src/pwa/policy.test.ts.
 */

const renderAt = (path: string) =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )

const kylar: PrivateUser = {
  id: 'u1',
  username: 'kylar',
  displayName: 'Kylar',
  avatar: 'p2',
  bio: '',
  createdAt: 0,
  showGames: true,
}

beforeAll(() => startPwa())

afterEach(() => {
  vi.unstubAllGlobals()
  act(() => {
    window.dispatchEvent(new Event('online'))
  })
})

describe('offline', () => {
  test('every page says when the device is offline, and what still works', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ user: null }))),
    )
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Open Dam' })).toBeInTheDocument()
    expect(screen.queryByText('You are offline.')).not.toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByText('You are offline.')).toBeInTheDocument()
    expect(screen.getByText(/analysis board all still work/)).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByText('You are offline.')).not.toBeInTheDocument()
  })

  test('opened with no network, the app is signed in as the account last seen, and catches up when it is back', async () => {
    storage.set(STORAGE_KEYS.account, kylar)
    const calls: string[] = []
    let reachable = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input), 'http://localhost').pathname
        if (!reachable) throw new TypeError('Failed to fetch')
        calls.push(path)
        if (path === '/api/me') return new Response(JSON.stringify({ user: kylar }))
        if (path === '/api/me/data') return new Response(JSON.stringify({ data: {} }))
        if (path === '/api/me/archive') return new Response(JSON.stringify({ games: [] }))
        return new Response('{}')
      }),
    )
    renderAt('/')
    expect(await screen.findByRole('button', { name: 'Account: Kylar' })).toBeInTheDocument()

    reachable = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await vi.waitFor(() => expect(calls).toContain('/api/me/data'))
  })

  test('settings explains installing the app and what works offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ user: null }))),
    )
    renderAt('/settings')
    expect(await screen.findByRole('heading', { name: 'App' })).toBeInTheDocument()
    expect(screen.getByText(/Online games, accounts, leaderboards/)).toBeInTheDocument()
  })
})
