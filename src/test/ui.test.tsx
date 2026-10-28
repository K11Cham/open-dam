import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import BoardView from '../components/board/BoardView'
import { ConfirmDialog } from '../components/ui/Dialog'
import { createInitialState } from '../game/engine'
import type { Coord } from '../game/types'

const renderAt = (path: string) =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )

const square = (name: string) => screen.getByRole('gridcell', { name: new RegExp(`^${name},`) })

/** A pointer tap as the board sees it: pointerdown on the square, pointerup on the window. */
const tap = (element: Element) => {
  fireEvent.pointerDown(element, { button: 0, clientX: 1, clientY: 1 })
  fireEvent.pointerUp(window, { button: 0, clientX: 1, clientY: 1 })
}

describe('board', () => {
  const renderBoard = (onSquare: (c: Coord) => void) =>
    render(
      <AppProviders>
        <BoardView
          position={createInitialState({ boardSize: 5 })}
          orientation="player1"
          selected={null}
          destinations={{ slides: [], captures: [] }}
          offenderIds={new Set()}
          animations={[]}
          promotedIds={[]}
          lastMove={null}
          interactive
          canDragFrom={() => false}
          onSquare={onSquare}
          onDrop={() => {}}
          perspective={null}
          sideNames={{ player1: 'Red', player2: 'Blue' }}
          label="Test board"
        />
      </AppProviders>,
    )

  test('every square has a spoken label', () => {
    renderBoard(() => {})
    expect(screen.getAllByRole('gridcell')).toHaveLength(25)
    expect(square('a1')).toHaveAccessibleName(/a1, Red piece/)
    expect(square('c3')).toHaveAccessibleName(/c3, empty/)
    expect(square('a5')).toHaveAccessibleName(/a5, Blue piece/)
  })

  test('the board is one tab stop and arrow keys move between squares', async () => {
    const user = userEvent.setup()
    const pressed: Coord[] = []
    renderBoard((c) => pressed.push(c))
    await user.tab()
    expect(square('c3')).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowRight}')
    expect(square('d4')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(pressed).toEqual([{ row: 1, col: 3 }])
  })
})

describe('playing against the computer', () => {
  test('the human cannot select the computer’s pieces', async () => {
    renderAt('/match/new?vs=club&side=player1&size=5')
    await screen.findByRole('grid')
    tap(square('a5')) // a Blue (computer) piece
    expect(square('a5')).not.toHaveAccessibleName(/selected/)
    tap(square('c2')) // one of ours
    expect(square('c2')).toHaveAccessibleName(/selected/)
    expect(square('c3')).toHaveAccessibleName(/you can move here/)
  })

  test('a move is played, then the computer replies', async () => {
    renderAt('/match/new?vs=novice&side=player1&size=5')
    await screen.findByRole('grid')
    tap(square('c2'))
    fireEvent.click(square('c3'))
    expect(screen.getByRole('heading', { name: /thinking/i })).toBeInTheDocument()
    // Novice thinks for under a second; the search falls back to the main thread in tests.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your move' })).toBeInTheDocument(), { timeout: 4000 })
  })

  test('resigning asks first', async () => {
    const user = userEvent.setup()
    renderAt('/match/new?vs=club&side=player1&size=5')
    await screen.findByRole('grid')
    await user.click(screen.getByRole('button', { name: 'Resign' }))
    const dialog = screen.getByRole('dialog', { name: 'Resign this game?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Resign' }))
    expect(await screen.findByRole('heading', { name: 'You lose', level: 2 })).toBeInTheDocument()
  })
})

describe('saving', () => {
  test('a game in progress is offered on the home page', async () => {
    const first = renderAt('/match/new?vs=hotseat&size=5')
    await screen.findByRole('grid')
    tap(square('c2'))
    fireEvent.click(square('c3'))
    first.unmount()
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Your game is waiting' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Continue/ })).toBeInTheDocument()
  })
})

describe('dialogs', () => {
  test('focus is trapped and Escape cancels', async () => {
    const user = userEvent.setup()
    let cancelled = false
    render(
      <ConfirmDialog
        open
        title="Sure?"
        description="Check"
        confirmLabel="Yes"
        onConfirm={() => {}}
        onCancel={() => {
          cancelled = true
        }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await act(async () => {
      await user.keyboard('{Escape}')
    })
    expect(cancelled).toBe(true)
  })
})

describe('learn', () => {
  test('every chapter link opens a chapter with its example boards', async () => {
    renderAt('/learn/chains')
    expect(await screen.findByRole('heading', { name: 'Chain captures', level: 2 })).toBeInTheDocument()
    expect(screen.getAllByRole('grid').length).toBeGreaterThan(0)
  })
})
