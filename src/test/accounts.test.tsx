import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import type { GameSummary, LeaderboardEntry, PrivateUser } from '../net/account'
import { STORAGE_KEYS, storage } from '../services/storage'

/**
 * The account pages through the real routes, against a pretend server: a
 * `fetch` that answers the account routes from memory. The real server's
 * logic has its own tests (worker/accountStore.test.ts) and a check against
 * a running one (`npm run check:online`); these check what the pages do with
 * its answers.
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
  bio: 'Plays 5×5 after lunch.',
  createdAt: Date.UTC(2026, 9, 1),
  showGames: true,
}

const entry = (rank: number, username: string, rating: number, games = 25): LeaderboardEntry => ({
  rank,
  player: { id: `id-${username}`, username, displayName: username.toUpperCase(), avatar: 'accent' },
  rating,
  games,
  wins: games - 5,
  losses: 3,
  draws: 2,
  peak: rating + 10,
})

interface FakeServer {
  me: PrivateUser | null
  data: Record<string, { value: unknown; updatedAt: number }>
  calls: Array<{ method: string; path: string; body: unknown }>
  leaderboard: LeaderboardEntry[]
  games: GameSummary[]
}

let server: FakeServer

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const url = new URL(String(input), 'http://localhost')
  const method = init.method ?? 'GET'
  const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
  server.calls.push({ method, path: url.pathname, body })
  const route = `${method} ${url.pathname}`
  switch (route) {
    case 'GET /api/me':
      return reply({ user: server.me })
    case 'GET /api/auth/username':
      return reply({ problem: url.searchParams.get('name') === 'taken' ? 'That username is taken.' : null })
    case 'POST /api/auth/signup':
      server.me = {
        ...kylar,
        id: 'new',
        username: String(body?.username),
        displayName: String(body?.displayName || body?.username),
      }
      return reply({ user: server.me, recoveryCode: 'ABCDE-FGHJK-LMNPQ-RSTUV' }, 201)
    case 'POST /api/auth/signin':
      if (body?.username !== 'kylar') return reply({ error: 'That username and password do not match.' }, 401)
      server.me = kylar
      return reply({ user: kylar })
    case 'POST /api/auth/signout':
      server.me = null
      return reply({})
    case 'PATCH /api/me':
      server.me = { ...server.me!, ...(body as Partial<PrivateUser>) }
      return reply({ user: server.me })
    case 'GET /api/me/data':
      return reply({ data: server.data })
    case 'PUT /api/me/data':
      Object.assign(server.data, body?.entries)
      return reply({})
    case 'GET /api/me/archive':
      return reply({ games: [] })
    case 'GET /api/me/sessions':
      return reply({ sessions: [{ id: 's1', device: 'Chrome on Windows', createdAt: 0, lastSeenAt: Date.now(), current: true }] })
    case 'GET /api/leaderboards':
      return reply({ pools: [{ pool: '5x5:untimed', players: server.leaderboard.length }] })
    case 'GET /api/users/kylar':
      return reply({
        user: kylar,
        ratings: [{ pool: '5x5:10+1', rating: 1612, games: 30, wins: 20, losses: 8, draws: 2, peak: 1650, lastPlayedAt: 0 }],
        totals: { games: 30, wins: 20, losses: 8, draws: 2 },
        recent: server.games,
      })
  }
  if (method === 'GET' && url.pathname.startsWith('/api/leaderboards/')) {
    const pool = decodeURIComponent(url.pathname.split('/').pop()!)
    const entries = pool === '5x5:untimed' ? server.leaderboard : []
    return reply({ pool, entries, total: entries.length })
  }
  if (method === 'GET' && url.pathname.startsWith('/api/users/')) return reply({ error: 'No such player.' }, 404)
  return reply({ error: 'Not found.' }, 404)
}

beforeEach(() => {
  server = { me: null, data: {}, calls: [], leaderboard: [], games: [] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => fakeFetch(input, init)),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signing up and in', () => {
  test('a new account is made, its recovery code shown once, and the player is signed in', async () => {
    const user = userEvent.setup()
    renderAt('/signup')
    await user.type(await screen.findByLabelText('Username'), 'amadou')
    await user.type(screen.getByLabelText('Display name (optional)'), 'Amadou B')
    await user.type(screen.getByLabelText('Password'), 'sticks and stones')
    await user.type(screen.getByLabelText('Repeat the password'), 'sticks and stones')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Welcome, Amadou B' })).toBeInTheDocument()
    expect(screen.getByLabelText('Recovery code')).toHaveTextContent('ABCDE-FGHJK-LMNPQ-RSTUV')
    // The password itself never leaves the browser: only its stretched key does.
    const signup = server.calls.find((c) => c.path === '/api/auth/signup')!
    expect(JSON.stringify(signup.body)).not.toContain('sticks and stones')
    expect(signup.body).toMatchObject({ username: 'amadou', key: expect.stringMatching(/^[0-9a-f]{64}$/) })

    await user.click(screen.getByRole('button', { name: 'I have saved it' }))
    expect(await screen.findByRole('button', { name: 'Account: Amadou B' })).toBeInTheDocument()
  })

  test('the sign-up form says what is wrong before sending anything', async () => {
    const user = userEvent.setup()
    renderAt('/signup')
    await user.type(await screen.findByLabelText('Username'), 'taken')
    expect(await screen.findByText('That username is taken.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Username'))
    await user.type(screen.getByLabelText('Username'), 'no spaces allowed')
    expect(screen.getByText(/Use letters, digits/)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Username'))
    await user.type(screen.getByLabelText('Username'), 'fine_name')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Repeat the password'), 'shorter')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getAllByText(/at least 8 characters/).length).toBeGreaterThan(0)
    expect(server.calls.some((c) => c.path === '/api/auth/signup')).toBe(false)
  })

  test('signing in shows a refusal in the form, then signs in and returns to the page asked for', async () => {
    const user = userEvent.setup()
    renderAt('/signin?next=%2Fleaderboards')
    await user.type(await screen.findByLabelText('Username'), 'someone')
    await user.type(screen.getByLabelText('Password'), 'whatever123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('That username and password do not match.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Username'))
    await user.type(screen.getByLabelText('Username'), 'kylar')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Leaderboards' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Account: Kylar' })).toBeInTheDocument()
  })

  test('a link that would send someone off the site after signing in goes home instead', async () => {
    server.me = kylar
    renderAt('/signin?next=%2F%2Fevil.example')
    expect(await screen.findByRole('heading', { name: 'Open Dam' })).toBeInTheDocument()
  })

  test('signing out from the account menu takes the account’s games and puzzles off the device', async () => {
    const user = userEvent.setup()
    server.me = kylar
    storage.set(STORAGE_KEYS.puzzles, ['p1'])
    renderAt('/')
    await user.click(await screen.findByRole('button', { name: 'Account: Kylar' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(storage.get(STORAGE_KEYS.puzzles)).toBeNull()
  })
})

describe('settings follow the account', () => {
  test('signing in brings the account’s theme to this device', async () => {
    server.me = kylar
    server.data = { theme: { value: 'carnival', updatedAt: Date.now() } }
    renderAt('/')
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('carnival'))
  })

  test('a preference changed here is sent to the account', async () => {
    const user = userEvent.setup()
    server.me = kylar
    renderAt('/settings')
    await user.click(await screen.findByRole('switch', { name: /Premoves/ }))
    await waitFor(() => expect(server.data.prefs?.value).toMatchObject({ premoves: false }), { timeout: 3000 })
  })

  test('the profile form saves the changes', async () => {
    const user = userEvent.setup()
    server.me = kylar
    renderAt('/settings')
    const name = await screen.findByLabelText('Display name')
    await user.clear(name)
    await user.type(name, 'K. Cham')
    await user.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(server.me?.displayName).toBe('K. Cham'))
    expect(await screen.findByRole('button', { name: 'Account: K. Cham' })).toBeInTheDocument()
  })

  test('signed out, settings offers an account and keeps preferences on the device', async () => {
    renderAt('/settings')
    expect(await screen.findByRole('heading', { name: 'Keep your settings everywhere' })).toBeInTheDocument()
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Devices' })).not.toBeInTheDocument()
  })
})

describe('leaderboards and profiles', () => {
  test('the leaderboard lists rated players, marks provisional ratings, and says when a pool is empty', async () => {
    const user = userEvent.setup()
    server.leaderboard = [entry(1, 'awa', 1720), entry(2, 'binta', 1650, 4)]
    renderAt('/leaderboards')
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('AWA')
    expect(rows[1]).toHaveTextContent('1720')
    expect(within(rows[2]).getByTitle(/Provisional/)).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: /AWA/ })).toHaveAttribute('href', '/u/awa')

    await user.click(screen.getByRole('radio', { name: '9×9' }))
    expect(await screen.findByRole('heading', { name: /Nobody is rated in 9×9/ })).toBeInTheDocument()
  })

  test('a profile shows ratings and recent games', async () => {
    server.games = [
      {
        id: 'g1',
        pool: '5x5:10+1',
        rated: true,
        finishedAt: Date.now() - 60_000,
        players: { player1: { id: 'u1', username: 'kylar', displayName: 'Kylar', avatar: 'p2' }, player2: null },
        winner: 'player1',
        reason: 'resignation',
        plies: 31,
        ratings: { player1: { before: 1600, after: 1612 }, player2: null },
      },
    ]
    renderAt('/u/kylar')
    expect(await screen.findByRole('heading', { name: 'Kylar' })).toBeInTheDocument()
    expect(screen.getByText('Plays 5×5 after lunch.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '5×5 · 10+1' })).toBeInTheDocument()
    const [game] = within(screen.getByRole('region', { name: 'Online games' })).getAllByRole('listitem')
    expect(game).toHaveTextContent('Won')
    expect(game).toHaveTextContent('+12')
    expect(game).toHaveTextContent('by resignation')
    expect(screen.getByRole('link', { name: /Review the game/ })).toHaveAttribute('href', '/game/g1')
  })

  test('an unknown player says so', async () => {
    renderAt('/u/nobody')
    expect(await screen.findByRole('heading', { name: 'No such player' })).toBeInTheDocument()
  })
})

describe('finding a rated game', () => {
  test('signed out, the Play page explains that rated games need an account', async () => {
    const user = userEvent.setup()
    renderAt('/play?online=find')
    expect(await screen.findByRole('radio', { name: /^Find a rated game/ })).toBeChecked()
    expect(screen.getByText(/Rated games need an account/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Find a game' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
