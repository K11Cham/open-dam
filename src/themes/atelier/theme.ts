import type { ThemeDefinition, ThemeTokens } from '../types'
import { BoardFrame, CellDecor, EndSequence, Piece } from './parts'
import './theme.css'

/**
 * Atelier: a quiet, print-like look. Hairline rules instead of borders,
 * generous whitespace, a serif display face, and pieces that read in pure
 * greyscale — a solid black disc against an open white ring — so the sides
 * are called Black and White here.
 */
const tokens: ThemeTokens = {
  '--dam-bg': '#FAF9F6',
  '--dam-bg-pattern': 'none',
  '--dam-surface': '#FFFFFF',
  '--dam-surface-2': '#F3F1EC',
  '--dam-surface-hover': '#ECE9E2',
  '--dam-overlay': 'rgba(28, 27, 25, 0.32)',

  '--dam-ink': '#1C1B19',
  '--dam-ink-muted': '#6B665D',
  '--dam-ink-inverse': '#FAF9F6',

  '--dam-border': '#1C1B19',
  '--dam-border-soft': '#DCD7CD',
  '--dam-border-width': '1px',
  '--dam-radius-sm': '2px',
  '--dam-radius': '3px',
  '--dam-radius-lg': '4px',
  '--dam-shadow': 'none',
  '--dam-shadow-lg': '0 18px 48px rgba(28, 27, 25, 0.10)',
  '--dam-focus': '#1C1B19',

  '--dam-accent': '#1C1B19',
  '--dam-accent-ink': '#FAF9F6',
  '--dam-accent-soft': '#EFECE5',
  '--dam-danger': '#9B3A2E',
  '--dam-danger-ink': '#FFFFFF',
  '--dam-success': '#3F5E37',
  '--dam-warning': '#8A6B2F',

  '--dam-board-bg': '#FFFFFF',
  '--dam-cell-light': '#FFFFFF',
  '--dam-cell-dark': '#FFFFFF',
  '--dam-cell-line': '#DCD7CD',
  '--dam-highlight': '#1C1B19',
  '--dam-target': '#8F897D',
  '--dam-capture-target': '#9B3A2E',
  '--dam-offender': '#8A6B2F',

  '--dam-p1': '#1C1B19',
  '--dam-p1-edge': '#1C1B19',
  '--dam-p2': '#FFFFFF',
  '--dam-p2-edge': '#1C1B19',
  '--dam-crown': '#8A6B2F',

  '--dam-font-display': "'Fraunces Variable', 'Fraunces', Georgia, 'Times New Roman', serif",
  '--dam-font-body': "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  '--dam-font-mono': "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace",
  '--dam-display-transform': 'none',
  '--dam-display-spacing': '-0.01em',
  '--dam-display-weight': '500',
}

export const atelierTheme: ThemeDefinition = {
  key: 'atelier',
  name: 'Atelier',
  blurb: 'Hairlines, whitespace, and black and white pieces that read in greyscale.',
  colorScheme: 'light',
  tokens,
  parts: { Piece, CellDecor, BoardFrame, EndSequence },
  motion: {
    hoverScale: 1.0,
    tapScale: 0.96,
    // No bounce: the piece arrives, it does not spring.
    moveTransition: { duration: 0.22 },
    captureDurationMs: 300,
  },
  sides: { player1: { name: 'Black' }, player2: { name: 'White' } },
  boardGap: 0,
}
