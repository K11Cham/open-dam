import type { ThemeDefinition, ThemeTokens } from '../types'
import { BoardFrame, CellDecor, EndSequence, Piece } from './parts'
import { sounds } from './sounds'
import './theme.css'

/**
 * Carnival: a dark, playful night-market look. Separated rounded tiles,
 * floating chrome, painted festival tokens for pieces (Coral has a scalloped
 * bottle-cap edge and a sun, Sky a smooth edge and a ring of beads, so they
 * differ in shape as well as colour), and a board that throws confetti.
 */
const tokens: ThemeTokens = {
  '--dam-bg': '#1B1033',
  '--dam-bg-pattern':
    'radial-gradient(circle at 15% 10%, rgba(255, 201, 60, 0.08), transparent 40%), radial-gradient(circle at 85% 0%, rgba(84, 198, 242, 0.10), transparent 45%)',
  '--dam-surface': '#2A1A4D',
  '--dam-surface-2': '#22143F',
  '--dam-surface-hover': '#38246B',
  '--dam-overlay': 'rgba(10, 5, 22, 0.66)',

  '--dam-ink': '#FFF3E0',
  '--dam-ink-muted': '#C2B0E3',
  '--dam-ink-inverse': '#1B1033',

  '--dam-border': '#120A24',
  '--dam-border-soft': '#4B2F86',
  '--dam-border-width': '0px',
  '--dam-radius-sm': '12px',
  '--dam-radius': '18px',
  '--dam-radius-lg': '28px',
  '--dam-shadow': '0 5px 0 0 #120A24, 0 10px 24px rgba(0, 0, 0, 0.4)',
  '--dam-shadow-lg': '0 9px 0 0 #120A24, 0 22px 44px rgba(0, 0, 0, 0.5)',
  '--dam-focus': '#FFC93C',

  '--dam-accent': '#FFC93C',
  '--dam-accent-ink': '#2A1A4D',
  '--dam-accent-soft': '#4B2F86',
  '--dam-danger': '#FF5C8A',
  '--dam-danger-ink': '#2A0A18',
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

  '--dam-font-display': "'Grandstander Variable', 'Grandstander', 'Trebuchet MS', system-ui, sans-serif",
  '--dam-font-body': "'Nunito Variable', 'Nunito', 'Trebuchet MS', system-ui, sans-serif",
  '--dam-font-mono': "'IBM Plex Mono', ui-monospace, monospace",
  '--dam-display-transform': 'none',
  '--dam-display-spacing': '0em',
  '--dam-display-weight': '700',
}

export const carnivalTheme: ThemeDefinition = {
  key: 'carnival',
  name: 'Carnival',
  blurb: 'Painted festival tokens, springy tiles, and a board that celebrates.',
  colorScheme: 'dark',
  tokens,
  parts: { Piece, CellDecor, BoardFrame, EndSequence },
  motion: {
    hoverScale: 1.12,
    tapScale: 0.88,
    moveTransition: { type: 'spring', stiffness: 260, damping: 18 },
    captureDurationMs: 520,
  },
  sides: { player1: { name: 'Coral' }, player2: { name: 'Sky' } },
  boardGap: 4,
  sounds,
}
