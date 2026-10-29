import type { ThemeDefinition, ThemeTokens } from '../types'
import { BoardFrame, CellDecor, EndSequence, Piece } from './parts'
import { sounds } from './sounds'
import './theme.css'

/**
 * Neobrutalist Pop: the project's original look. Hard black outlines, flat
 * offset shadows, a dotted paper background and loud flat colour. Red and
 * Blue pieces also differ in shape (Blue carries an inner ring), so the sides
 * read without colour.
 */
const tokens: ThemeTokens = {
  '--dam-bg': '#F5F4F0',
  '--dam-bg-pattern': 'radial-gradient(#C9C7BF 1px, transparent 1px) 0 0 / 16px 16px',
  '--dam-surface': '#FFFFFF',
  '--dam-surface-2': '#F1F0EA',
  '--dam-surface-hover': '#E9E8E1',
  '--dam-overlay': 'rgba(17, 17, 17, 0.45)',

  '--dam-ink': '#111111',
  '--dam-ink-muted': '#5E5E5A',
  '--dam-ink-inverse': '#FFFFFF',

  '--dam-border': '#111111',
  '--dam-border-soft': '#111111',
  '--dam-border-width': '3px',
  '--dam-radius-sm': '8px',
  '--dam-radius': '12px',
  '--dam-radius-lg': '18px',
  '--dam-shadow': '4px 4px 0 0 #111111',
  '--dam-shadow-lg': '7px 7px 0 0 #111111',
  '--dam-focus': '#2E5BFF',

  '--dam-accent': '#C6F252',
  '--dam-accent-ink': '#111111',
  '--dam-accent-soft': '#EEF9CC',
  '--dam-danger': '#E5243B',
  '--dam-danger-ink': '#FFFFFF',
  '--dam-success': '#4E7A00',
  '--dam-warning': '#F2811F',

  '--dam-board-bg': '#FFFFFF',
  '--dam-cell-light': '#F6FDE3',
  '--dam-cell-dark': '#FFFFFF',
  '--dam-cell-line': '#111111',
  '--dam-highlight': '#2E5BFF',
  '--dam-target': '#C6F252',
  '--dam-capture-target': '#E5243B',
  '--dam-offender': '#F2811F',

  '--dam-p1': '#FF4D6D',
  '--dam-p1-edge': '#111111',
  '--dam-p2': '#4361EE',
  '--dam-p2-edge': '#111111',
  '--dam-crown': '#FFD23F',

  '--dam-font-display': "'Archivo Black', 'Arial Black', system-ui, sans-serif",
  '--dam-font-body': "'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  '--dam-font-mono': "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace",
  '--dam-display-transform': 'uppercase',
  '--dam-display-spacing': '0.02em',
  '--dam-display-weight': '400',
}

export const neobrutalistTheme: ThemeDefinition = {
  key: 'neobrutalist',
  name: 'Neobrutalist Pop',
  blurb: 'Hard black outlines, flat offset shadows, and colours that shout.',
  colorScheme: 'light',
  tokens,
  parts: { Piece, CellDecor, BoardFrame, EndSequence },
  motion: {
    hoverScale: 1.08,
    tapScale: 0.92,
    moveTransition: { type: 'spring', stiffness: 380, damping: 32 },
    captureDurationMs: 380,
  },
  sides: { player1: { name: 'Red' }, player2: { name: 'Blue' } },
  boardGap: 0,
  sounds,
}
