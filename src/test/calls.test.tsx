import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import BoardView from '../components/board/BoardView'
import { applyAction, canCall, createInitialState, destinationsFor, legalActions } from '../game/engine'
import { makeSettings } from '../game/settings'
import type { EngineAction, EngineState } from '../game/types'
import { CALL_MIN_MS } from '../hooks/useBoardAnimations'
import { missingPieces } from '../lib/boardDebug'
import { callExplanation } from '../lib/describe'
import { MatchHost } from '../match/session'
import { recordFromSetup } from '../match/setup'
import { saveActiveMatch } from '../match/storage'
import { STORAGE_KEYS, storage } from '../services/storage'

// The computer calls whenever it can, so the test knows what it will do.
vi.mock('../ai/client', async (original) => {
  const actual = await original<typeof import('../ai/client')>()
  const { canCall: callable, legalActions: legal } = await import('../game/engine')
  return {
    ...actual,
    searchAsync: async (state: EngineState) => ({
      action: callable(state) ? { type: 'call', pieceId: state.offenders[0].pieceId } : legal(state)[0],
      score: 0,
      nodes: 1,
      depthReached: 1,
      blundered: false,
    }),
  }
})

afterEach(() => {
  for (const key of Object.values(STORAGE_KEYS)) storage.remove(key)
  vi.restoreAllMocks()
})

const captures = (state: EngineState) =>
  legalActions(state).filter(
    (action) =>
      action.type === 'move' &&
      destinationsFor(state, action.from).captures.some((c) => c.row === action.to.row && c.col === action.to.col),
  )

/** Moves from the start in which Red, with a capture on offer, plays something else: Blue may then call. */
function skippedCapture(): EngineAction[] | null {
  const search = (state: EngineState, line: EngineAction[], depth: number): EngineAction[] | null => {
    if (depth === 0 || state.status.kind !== 'playing') return null
    for (const action of legalActions(state)) {
      if (action.type !== 'move') continue
      const next = applyAction(state, action).state
      const skipped = state.currentPlayer === 'player1' && captures(state).length > 0 && !captures(state).includes(action)
      if (skipped && next.currentPlayer === 'player2' && canCall(next)) return [...line, action]
      const found = search(next, [...line, action], depth - 1)
      if (found) return found
    }
    return null
  }
  return search(createInitialState(makeSettings({ boardSize: 5 })), [], 5)
}

describe('when the computer calls a piece', () => {
  test('the player is told which piece went and why, and the piece is ringed before it goes', async () => {
    const line = skippedCapture()
    expect(line).not.toBeNull()
    const record = recordFromSetup({ opponent: 'serin', side: 'player1', settings: makeSettings({ boardSize: 5 }) })
    const host = new MatchHost(record)
    for (const action of line!) {
      const seat = host.getSnapshot().state.position.currentPlayer
      expect(host.submit(seat, { type: 'engine', action })).toBeNull()
    }
    const before = host.getSnapshot().state.position
    const called = before.offenders[0]
    saveActiveMatch(host.getSnapshot().record)
    host.dispose()
    // jsdom lays nothing out; give the board a width so it draws its animation layer.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400)

    // Every called piece drawn, with when it appeared and went; the computer moves on quickly, so this watches rather than polls.
    const seen = new Map<string, { at: number; gone?: number }>()
    const observer = new MutationObserver(() => {
      for (const element of document.querySelectorAll<HTMLElement>('.board__anim-piece.is-called')) {
        const square = element.dataset.at ?? '?'
        if (!seen.has(square)) seen.set(square, { at: performance.now() })
      }
      for (const [square, entry] of seen) {
        if (entry.gone === undefined && !document.querySelector(`.is-called[data-at="${square}"]`)) entry.gone = performance.now()
      }
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true })
    const { container } = render(
      <AppProviders>
        <MemoryRouter initialEntries={[`/match/${record.config.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>,
    )
    const square = String.fromCharCode(97 + called.at.col) + (5 - called.at.row)
    const text = `Seriñ called your piece on ${square} — you skipped a capture.`
    expect(await screen.findByText(text, {}, { timeout: 4000 })).toBeInTheDocument()
    // The called piece was drawn, ringed, where it stood, and stayed long enough to be seen.
    await waitFor(() => expect(container.querySelector('.is-called')).toBeNull(), { timeout: CALL_MIN_MS + 1000 })
    observer.disconnect()
    const shown = seen.get(square)
    expect(shown).toBeDefined()
    expect(shown!.gone! - shown!.at).toBeGreaterThanOrEqual(CALL_MIN_MS - 50)
  })
})

describe('call wording', () => {
  test('names the caller, the squares and whose capture was skipped', () => {
    const names = { player1: 'Red', player2: 'Seriñ' }
    const one = { caller: 'player2' as const, removed: [{ at: { row: 2, col: 2 } }] }
    expect(callExplanation(one, names, ['player1'], 5)).toBe('Seriñ called your piece on c3 — you skipped a capture.')
    const two = { caller: 'player2' as const, removed: [{ at: { row: 4, col: 0 } }, { at: { row: 3, col: 1 } }] }
    expect(callExplanation(two, names, ['player1'], 5)).toBe('Seriñ called your pieces on a1 and b2 — you skipped a capture.')
    // Pass and play: both sides are here, so the line names the side.
    expect(callExplanation(one, names, ['player1', 'player2'], 5)).toBe('Seriñ called Red’s piece on c3 — Red skipped a capture.')
    // Whoever called needs no explanation.
    expect(callExplanation(one, names, ['player2'], 5)).toBeNull()
  })
})

describe('the board check (?debug=board)', () => {
  const props = {
    orientation: 'player1' as const,
    selected: null,
    destinations: { slides: [], captures: [] },
    offenderIds: new Set<string>(),
    promotedIds: [],
    lastMove: null,
    interactive: false,
    canDragFrom: () => false,
    onSquare: () => {},
    onDrop: () => {},
    perspective: null,
    sideNames: { player1: 'Red', player2: 'Blue' },
    label: 'Board',
    hideEndSequence: true,
  }

  test('finds every piece drawn on an ordinary board', () => {
    const position = createInitialState(makeSettings({ boardSize: 5 }))
    const { container } = render(
      <AppProviders>
        <BoardView {...props} position={position} animations={[]} />
      </AppProviders>,
    )
    expect(missingPieces(position, container.querySelector<HTMLElement>('.board')!)).toEqual([])
  })

  test('reports a piece hidden for a slide that is not on screen', () => {
    const position = createInitialState(makeSettings({ boardSize: 5 }))
    const piece = position.board[4][0]!
    // A slide onto a1 hides the real piece there; with no layout (as here, or a board not measured yet) nothing flies.
    const animations = [{ id: 'a', kind: 'travel' as const, piece, from: { row: 3, col: 0 }, to: { row: 4, col: 0 } }]
    const { container } = render(
      <AppProviders>
        <BoardView {...props} position={position} animations={animations} />
      </AppProviders>,
    )
    expect(missingPieces(position, container.querySelector<HTMLElement>('.board')!)).toEqual(['a1'])
  })
})
