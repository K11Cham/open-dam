import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppProviders } from '../App'
import BoardView from '../components/board/BoardView'
import { createInitialState } from '../game/engine'
import type { GameEvent } from '../game/types'
import { TRAVEL_FALLBACK_MS, useBoardAnimations } from './useBoardAnimations'
import type { BoardAnimation } from './useBoardAnimations'

// The owner's online game lost pieces: each moved piece stayed hidden because
// its slide never reported landing while the page was in the background.

const move: GameEvent = {
  type: 'move',
  player: 'player1',
  pieceId: 'p-1',
  from: { row: 3, col: 0 },
  to: { row: 2, col: 2 },
  isKing: false,
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('a slide that never reports landing is dropped anyway, so the piece shows', () => {
  const { result } = renderHook(() => useBoardAnimations(300))
  act(() => result.current.ingest([move]))
  expect(result.current.animations).toHaveLength(1)
  act(() => {
    vi.advanceTimersByTime(TRAVEL_FALLBACK_MS)
  })
  expect(result.current.animations).toEqual([])
  expect(result.current.lastMove).toEqual({ from: move.from, to: move.to })
})

test('a stale slide does not hide a different piece standing on its square', () => {
  const position = createInitialState({ boardSize: 5 })
  // A slide onto c2 left over from another piece must not hide Red's piece standing there now.
  const stale: BoardAnimation = {
    id: 'anim-old',
    kind: 'travel',
    piece: { player: 'player2', isKing: true, id: 'someone-else' },
    from: { row: 0, col: 2 },
    to: { row: 3, col: 2 },
  }
  const { getByRole } = render(
    <AppProviders>
      <BoardView
        position={position}
        orientation="player1"
        selected={null}
        destinations={{ slides: [], captures: [] }}
        offenderIds={new Set()}
        animations={[stale]}
        promotedIds={[]}
        lastMove={null}
        interactive={false}
        canDragFrom={() => false}
        onSquare={() => {}}
        onDrop={() => {}}
        perspective={null}
        sideNames={{ player1: 'Red', player2: 'Blue' }}
        label="Test board"
      />
    </AppProviders>,
  )
  const c2 = getByRole('gridcell', { name: /^c2,/ })
  expect(c2).toHaveAccessibleName(/Red piece/)
  expect(c2.querySelector('.piece-slot')).not.toBeNull()
})
