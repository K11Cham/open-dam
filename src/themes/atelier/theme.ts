import type { ThemeDefinition, ThemeTokens } from '../types'
import { BoardFrame, CellDecor, EndSequence, Piece } from './parts'
import './theme.css'

/**
 * Atelier — the restrained one. Hairlines instead of borders, no shadows, no
 * fills on the board (the grid is drawn with rules, not with alternating
 * squares), and the two sides are distinguished by *form* as well as colour:
 * player one is a solid disc, player two is an open ring. That distinction
 * survives in greyscale, which the colour-only themes do not.
 */
const tokens: ThemeTokens = {
  '--dam-bg': '#FBFAF8',
  '--dam-bg-pattern': 'none',
  '--dam-surface': '#FFFFFF',
  '--dam-surface-2': '#F4F2EE',
  '--dam-surface-hover': '#EDEAE4',

  '--dam-ink': '#1C1B19',
  '--dam-ink-muted': '#8A857C',
  '--dam-ink-inverse': '#FBFAF8',

  '--dam-border': '#1C1B19',
  '--dam-border-soft': '#DDD8CE',
  '--dam-border-width': '1px',
  '--dam-radius-sm': '0px',
  '--dam-radius': '2px',
  '--dam-radius-lg': '2px',
  '--dam-shadow': 'none',
  '--dam-shadow-lg': 'none',

  '--dam-accent': '#1C1B19',
  '--dam-accent-ink': '#FBFAF8',
  '--dam-accent-soft': '#F0EDE6',
  '--dam-danger': '#9B3A2E',
  '--dam-success': '#4A6741',
  '--dam-warning': '#9A7B3F',

  '--dam-board-bg': '#FFFFFF',
  '--dam-cell-light': '#FFFFFF',
  '--dam-cell-dark': '#FFFFFF',
  '--dam-cell-line': '#DDD8CE',
  '--dam-highlight': '#1C1B19',
  '--dam-target': '#B4AEA2',
  '--dam-capture-target': '#9B3A2E',
  '--dam-offender': '#9A7B3F',

  '--dam-p1': '#1C1B19',
  '--dam-p1-edge': '#1C1B19',
  '--dam-p2': '#FFFFFF',
  '--dam-p2-edge': '#1C1B19',
  '--dam-crown': '#9A7B3F',

  '--dam-font-display': "'Inter', system-ui, -apple-system, sans-serif",
  '--dam-font-body': "'Inter', system-ui, -apple-system, sans-serif",
  '--dam-font-mono': "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace",
  '--dam-display-transform': 'uppercase',
  '--dam-display-spacing': '0.18em',
}

export const atelierTheme: ThemeDefinition = {
  key: 'atelier',
  name: 'Atelier',
  blurb: 'Hairlines, whitespace, and shapes that still read in greyscale.',
  tokens,
  parts: { Piece, CellDecor, BoardFrame, EndSequence },
  motion: {
    hoverScale: 1.0,
    tapScale: 0.96,
    // No bounce: the piece arrives, it does not spring.
    moveTransition: { duration: 0.22 },
    captureDurationMs: 300,
    endSequenceMs: 2600,
  },
  boardGap: 0,
  boardStyle: 'grid-lines',
}
