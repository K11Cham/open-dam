import { coordToNotation } from '../game/notation'
import type { EngineState } from '../game/types'

/** The checks behind the board debug overlay (src/components/board/BoardDebug.tsx, which explains them). */

/** Longer than any slide (and its fallback), so a piece in flight is never reported. */
export const GRACE_MS = 1800

const FLAG_KEY = 'openDam.debug'

/** Whether the board check is on for this tab: `?debug=board` turns it on, `?debug=off` off. */
export function boardDebugEnabled(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get('debug')
    if (asked === 'board') sessionStorage.setItem(FLAG_KEY, 'board')
    if (asked === 'off') sessionStorage.removeItem(FLAG_KEY)
    return sessionStorage.getItem(FLAG_KEY) === 'board'
  } catch {
    return false
  }
}

export interface Mismatch {
  at: string
  squares: string[]
  moves: string
}

/** Squares whose engine piece has no visible piece drawn, given the board element. */
export function missingPieces(position: EngineState, board: HTMLElement): string[] {
  const size = position.settings.boardSize
  const inFlight = new Set(
    [...board.querySelectorAll<HTMLElement>('.board__anim-piece[data-to]')].map((element) => element.dataset.to),
  )
  const missing: string[] = []
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!position.board[row]?.[col]) continue
      const name = coordToNotation(row, col, size)
      if (inFlight.has(name)) continue
      const slot = board.querySelector<HTMLElement>(`.cell[data-row="${row}"][data-col="${col}"] .piece-slot`)
      if (!slot || !isShown(slot)) missing.push(name)
    }
  }
  return missing
}

function isShown(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
  }
  const rect = element.getBoundingClientRect()
  // jsdom lays nothing out, so a zero-sized box there says nothing.
  return rect.width > 0 || rect.height > 0 || navigator.userAgent.includes('jsdom')
}
