import type { ThemeDefinition, ThemeTokens } from '../types'
import { BoardFrame, CellDecor, EndSequence, Piece } from './parts'
import './theme.css'

/**
 * Carnival — the illustrative one. Pieces are drawn SVG characters with faces
 * rather than CSS circles, the board is a set of separated rounded tiles rather
 * than a continuous grid, and everything moves on a spring. Grandstander gives
 * the fairground signage voice Fredoka's rounded geometry kept drifting into
 * Roblox-logo territory with.
 */
const tokens: ThemeTokens = {
  '--dam-bg': '#1B1033',
  '--dam-bg-pattern': 'none',
  '--dam-surface': '#2A1A4D',
  '--dam-surface-2': '#20134099',
  '--dam-surface-hover': '#38246B',

  '--dam-ink': '#FFF3E0',
  '--dam-ink-muted': '#B49FD8',
  '--dam-ink-inverse': '#1B1033',

  '--dam-border': '#120A24',
  '--dam-border-soft': '#4B2F86',
  '--dam-border-width': '0px',
  '--dam-radius-sm': '10px',
  '--dam-radius': '18px',
  '--dam-radius-lg': '28px',
  '--dam-shadow': '0 6px 0 0 #120A24, 0 10px 24px rgba(0,0,0,0.45)',
  '--dam-shadow-lg': '0 10px 0 0 #120A24, 0 22px 44px rgba(0,0,0,0.5)',

  '--dam-accent': '#FFC93C',
  '--dam-accent-ink': '#2A1A4D',
  '--dam-accent-soft': '#4B2F86',
  '--dam-danger': '#FF5C8A',
  '--dam-success': '#5BE7A9',
  '--dam-warning': '#FFA552',

  '--dam-board-bg': '#2A1A4D',
  '--dam-cell-light': '#3A2568',
  '--dam-cell-dark': '#311F5A',
  '--dam-cell-line': 'transparent',
  '--dam-highlight': '#FFC93C',
  '--dam-target': '#5BE7A9',
  '--dam-capture-target': '#FF5C8A',
  '--dam-offender': '#FFA552',

  '--dam-p1': '#FF7A5C',
  '--dam-p1-edge': '#C6412A',
  '--dam-p2': '#54C6F2',
  '--dam-p2-edge': '#1E7FA8',
  '--dam-crown': '#FFC93C',

  '--dam-font-display': "'Grandstander', 'Trebuchet MS', 'Inter', sans-serif",
  '--dam-font-body': "'Grandstander', 'Trebuchet MS', 'Inter', sans-serif",
  '--dam-font-mono': "'IBM Plex Mono', ui-monospace, monospace",
  '--dam-display-transform': 'none',
  '--dam-display-spacing': '0em',
}

export const carnivalTheme: ThemeDefinition = {
  key: 'carnival',
  name: 'Carnival',
  blurb: 'Drawn characters, springy tiles, and a board that celebrates.',
  tokens,
  parts: { Piece, CellDecor, BoardFrame, EndSequence },
  motion: {
    hoverScale: 1.14,
    tapScale: 0.88,
    moveTransition: { type: 'spring', stiffness: 260, damping: 18 },
    captureDurationMs: 520,
    endSequenceMs: 3000,
  },
  boardGap: 4,
  boardStyle: 'tiles',
}
