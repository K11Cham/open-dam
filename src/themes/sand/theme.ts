import type { ThemeDefinition, ThemeTokens } from '../types'
import { BoardFrame, CellDecor, EndSequence, Piece } from './parts'
import './theme.css'

/** Fine grains of sand: SVG noise tinted brown, used on the page and on the board. */
const SAND_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.36 0 0 0 0 0.25 0 0 0 0 0.12 0.55 0 0 0 -0.2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")"

/**
 * Sand: the game as it is played outdoors in The Gambia, on a grid drawn in
 * the sand with stones against sticks. Warm daylight colours, an indigo
 * accent like dyed cloth, and a board tilted in 3D with pieces that have
 * real height.
 */
const tokens: ThemeTokens = {
  '--dam-bg': '#E9D9BC',
  '--dam-bg-pattern': SAND_GRAIN,
  '--dam-surface': '#F6EBD8',
  '--dam-surface-2': '#EFE1C8',
  '--dam-surface-hover': '#E6D3B2',
  '--dam-overlay': 'rgba(46, 34, 22, 0.42)',

  '--dam-ink': '#2E2216',
  '--dam-ink-muted': '#69553F',
  '--dam-ink-inverse': '#F8EFDF',

  '--dam-border': '#5B4630',
  '--dam-border-soft': '#D6C09C',
  '--dam-border-width': '1.5px',
  '--dam-radius-sm': '6px',
  '--dam-radius': '10px',
  '--dam-radius-lg': '16px',
  '--dam-shadow': '0 1px 0 rgba(91, 70, 48, 0.16), 0 6px 16px rgba(91, 70, 48, 0.10)',
  '--dam-shadow-lg': '0 18px 40px rgba(70, 48, 24, 0.22)',
  '--dam-focus': '#2F4A7A',

  '--dam-accent': '#2F4A7A',
  '--dam-accent-ink': '#F8EFDF',
  '--dam-accent-soft': '#D9DBDF',
  '--dam-danger': '#A8442A',
  '--dam-danger-ink': '#FFF6EC',
  '--dam-success': '#4E6B3A',
  '--dam-warning': '#8F6218',

  '--dam-board-bg': '#E2CCA2',
  '--dam-cell-light': 'transparent',
  '--dam-cell-dark': 'transparent',
  '--dam-cell-line': '#8C6A40',
  '--dam-highlight': '#2F4A7A',
  '--dam-target': '#6E4F2C',
  '--dam-capture-target': '#A8442A',
  '--dam-offender': '#C27A12',

  '--dam-p1': '#6A655E',
  '--dam-p1-edge': '#2F2C29',
  '--dam-p2': '#B07A48',
  '--dam-p2-edge': '#5A3818',
  '--dam-crown': '#C9962E',

  '--dam-font-display': "'Fraunces Variable', 'Fraunces', Georgia, 'Times New Roman', serif",
  '--dam-font-body': "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  '--dam-font-mono': "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace",
  '--dam-display-transform': 'none',
  '--dam-display-spacing': '-0.01em',
  '--dam-display-weight': '650',
}

export const sandTheme: ThemeDefinition = {
  key: 'sand',
  name: 'Sand',
  blurb: 'A grid drawn in the sand, in 3D, played with stones and sticks.',
  colorScheme: 'light',
  tokens,
  parts: { Piece, CellDecor, BoardFrame, EndSequence },
  motion: {
    // Pieces lift off the sand on hover (theme.css) instead of growing.
    hoverScale: 1,
    tapScale: 0.96,
    // Pushed across sand: smooth, no bounce.
    moveTransition: { type: 'spring', stiffness: 300, damping: 32 },
    captureDurationMs: 380,
  },
  sides: { player1: { name: 'Stone' }, player2: { name: 'Stick' } },
  boardGap: 0,
}
