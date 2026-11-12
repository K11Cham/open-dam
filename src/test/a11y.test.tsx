import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import { STORAGE_KEYS, storage } from '../services/storage'
import { THEME_KEYS } from '../themes/registry'

/**
 * axe-core on the main pages, in every theme: names, roles, landmarks,
 * headings, labels and ARIA used correctly. Colour contrast is checked from
 * the theme tokens instead (src/themes/contrast.test.ts), because jsdom does
 * no layout and axe cannot see what is drawn over what.
 */

const PAGES = [
  '/',
  '/play',
  '/match/new?vs=ndo&side=player1&size=5',
  '/learn',
  '/about',
  '/analysis',
  '/leaderboards',
  '/settings',
  '/signin',
  '/signup',
  '/privacy',
  '/terms',
  '/no-such-page',
]

beforeEach(() => {
  // A server that knows nobody and has no ratings yet.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname
      if (path === '/api/leaderboards') return new Response(JSON.stringify({ pools: [] }))
      if (path.startsWith('/api/leaderboards/')) return new Response(JSON.stringify({ pool: '5x5:10+1', entries: [], total: 0 }))
      return new Response(JSON.stringify({ user: null }))
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  for (const key of Object.values(STORAGE_KEYS)) storage.remove(key)
})

async function violations(path: string) {
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })
  const results = await axe.run(document.body, {
    rules: {
      // Needs layout and painting, which jsdom does not do; see contrast.test.ts.
      'color-contrast': { enabled: false },
    },
  })
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`)
}

/**
 * A theme changes the markup only where it draws its own parts (pieces,
 * board frame, the Home page's demo board); everything else is the same
 * markup in another stylesheet. So every page runs in the default theme, and
 * the pages with a board run in every theme.
 */
const BOARD_PAGES = ['/', '/match/new?vs=ndo&side=player1&size=5', '/analysis']

describe('accessibility (axe)', () => {
  const runs = [
    ...PAGES.map((path) => [THEME_KEYS[0], path] as const),
    ...THEME_KEYS.slice(1).flatMap((theme) => BOARD_PAGES.map((path) => [theme, path] as const)),
  ]
  test.each(runs)(
    '%s: %s has no violations',
    async (theme, path) => {
      storage.set(STORAGE_KEYS.theme, theme)
      expect(await violations(path)).toEqual([])
    },
    15_000,
  )
})
