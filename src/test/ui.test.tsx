import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import BoardView from '../components/board/BoardView'
import { ConfirmDialog } from '../components/ui/Dialog'
import { createInitialState, resign } from '../game/engine'
import type { Coord } from '../game/types'
import { STORAGE_KEYS, storage } from '../services/storage'
import { THEMES, THEME_KEYS } from '../themes/registry'

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
  const renderBoard = (onSquare: (c: Coord) => void, canDragFrom: (c: Coord) => boolean = () => false) =>
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
          canDragFrom={canDragFrom}
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

  test('movable pieces do not add Tab stops of their own', () => {
    renderBoard(
      () => {},
      () => true,
    )
    const grid = screen.getByRole('grid')
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  })
})

describe('playing against the computer', () => {
  test('the human cannot select the computer’s pieces', async () => {
    renderAt('/match/new?vs=ndo&side=player1&size=5')
    await screen.findByRole('grid')
    tap(square('a5')) // a Blue (computer) piece
    expect(square('a5')).not.toHaveAccessibleName(/selected/)
    tap(square('c2')) // one of ours
    expect(square('c2')).toHaveAccessibleName(/selected/)
    expect(square('c3')).toHaveAccessibleName(/you can move here/)
  })

  test('a move is played, then the computer replies', async () => {
    renderAt('/match/new?vs=doff&side=player1&size=5')
    await screen.findByRole('grid')
    tap(square('c2'))
    fireEvent.click(square('c3'))
    expect(screen.getByRole('heading', { name: /thinking/i })).toBeInTheDocument()
    // Döff thinks for under a second; the search falls back to the main thread in tests.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your move' })).toBeInTheDocument(), { timeout: 4000 })
  })

  test('resigning asks first', async () => {
    const user = userEvent.setup()
    renderAt('/match/new?vs=ndo&side=player1&size=5')
    await screen.findByRole('grid')
    await user.click(screen.getByRole('button', { name: 'Resign' }))
    const dialog = screen.getByRole('dialog', { name: 'Resign this game?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Resign' }))
    // The result banner plays first; Continue skips it to the summary.
    const skip = await screen.findByRole('button', { name: 'Continue' }, { timeout: 3000 })
    expect(skip).toHaveAccessibleDescription(/You lose\. You resigned\./)
    await user.click(skip)
    expect(await screen.findByRole('dialog', { name: 'You lose' })).toBeInTheDocument()
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

describe('new game', () => {
  test('house rules are summarised, edited in a dialog, and can be reset', async () => {
    const user = userEvent.setup()
    renderAt('/play')
    await screen.findByRole('heading', { name: 'New game' })
    expect(screen.getByText('Standard')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    const dialog = screen.getByRole('dialog', { name: 'House rules' })
    await user.click(within(dialog).getByRole('switch', { name: /threefold repetition/ }))
    expect(screen.queryByText('Standard')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Use standard rules' }))
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Standard')).toBeInTheDocument()
  })

  test('the five computer opponents are offered', async () => {
    renderAt('/play')
    await screen.findByRole('heading', { name: 'New game' })
    for (const name of ['Döff', 'Khàlé', 'Ndö', 'Màam', 'Seriñ']) expect(screen.getByText(name)).toBeInTheDocument()
    expect(screen.getByText('the youngster')).toBeInTheDocument()
  })

  test('the computer opponents only show in computer mode, and the choice survives a switch', async () => {
    const user = userEvent.setup()
    renderAt('/play')
    await screen.findByRole('heading', { name: 'New game' })
    await user.click(screen.getByRole('radio', { name: /Màam/ }))
    await user.click(screen.getByRole('radio', { name: /Pass and play/ }))
    expect(screen.queryByText('Seriñ')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Your side' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /^Computer/ }))
    expect(screen.getByRole('radio', { name: /Màam/ })).toBeChecked()
  })
})

describe('analysis', () => {
  test('moves played are listed and can be stepped back through', async () => {
    const user = userEvent.setup()
    renderAt('/analysis')
    await user.click(await screen.findByRole('button', { name: 'Starting position' }))
    tap(square('d3'))
    fireEvent.click(square('c3'))
    tap(square('b3'))
    fireEvent.click(square('d3'))
    const list = screen.getByRole('region', { name: 'Moves' })
    expect(within(list).getByRole('button', { name: /d3 to c3/ })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: /b3 jumps to d3/ })).toBeInTheDocument()
    await user.click(within(list).getByRole('button', { name: /d3 to c3/ }))
    expect(square('d3')).toHaveAccessibleName(/d3, empty/)
    expect(within(list).getByText('1 / 2')).toBeInTheDocument()
  })
})

describe('after a game', () => {
  test('rematch starts a fresh game, not the finished one', async () => {
    const user = userEvent.setup()
    renderAt('/match/new?vs=hotseat&size=5')
    await screen.findByRole('grid')
    tap(square('d3'))
    fireEvent.click(square('c3'))
    await user.click(screen.getAllByRole('button', { name: 'Resign' })[0])
    await user.click(within(screen.getByRole('dialog', { name: 'Resign this game?' })).getByRole('button', { name: 'Resign' }))
    await screen.findByRole('button', { name: 'Continue' }, { timeout: 3000 })
    await user.keyboard('{Escape}')
    const summary = await screen.findByRole('dialog', { name: /wins/ })
    await user.click(within(summary).getByRole('button', { name: 'Rematch' }))
    await waitFor(() => expect(screen.getByText('No moves yet.')).toBeInTheDocument())
    expect(square('d3')).toHaveAccessibleName(/d3, Red piece/)
  })
})

describe('themes', () => {
  test.each(THEME_KEYS)('%s draws pieces, kings, square marks and the end of a game', (key) => {
    storage.set(STORAGE_KEYS.theme, key)
    const start = createInitialState({ boardSize: 5 })
    // Crown one piece of each side, then end the game, so every part of the theme is drawn.
    const board = start.board.map((row) =>
      row.map((piece) => (piece && piece.id.endsWith('0') ? { ...piece, isKing: true } : piece)),
    )
    const position = { ...resign(start, 'player2').state, board }
    render(
      <AppProviders>
        <BoardView
          position={position}
          orientation="player1"
          selected={{ row: 1, col: 1 }}
          destinations={{ slides: [{ row: 2, col: 2 }], captures: [{ row: 2, col: 3 }] }}
          offenderIds={new Set([board[0][0]!.id])}
          animations={[]}
          promotedIds={[]}
          lastMove={null}
          interactive
          canDragFrom={() => true}
          onSquare={() => {}}
          onDrop={() => {}}
          perspective="player1"
          sideNames={{ player1: THEMES[key].sides.player1.name, player2: THEMES[key].sides.player2.name }}
          label="Test board"
        />
      </AppProviders>,
    )
    expect(document.documentElement.dataset.theme).toBe(key)
    expect(square('a1')).toHaveAccessibleName(new RegExp(`a1, ${THEMES[key].sides.player1.name}`))
  })
})

describe('sound', () => {
  test('the sound toggle reports its state and remembers it', async () => {
    const user = userEvent.setup()
    renderAt('/')
    const toggle = screen.getByRole('button', { name: 'Sound effects' })
    const before = toggle.getAttribute('aria-pressed') === 'true'
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', String(!before))
    expect(storage.get<{ enabled: boolean }>(STORAGE_KEYS.sound)?.enabled).toBe(!before)
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', String(before))
  })
})
