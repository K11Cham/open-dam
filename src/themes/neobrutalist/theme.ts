import type { ThemeDefinition, ThemeTokens } from '../types'
import { BoardFrame, CellDecor, EndSequence, Piece } from './parts'
import './theme.css'

/**
 * The look the project already had, pulled out of the global stylesheet and
 * sealed inside one theme. Nothing here is referenced by shared components
 * directly — they only read the semantic tokens below — so this style can no
 * longer leak into or override the other two.
 */
const tokens: ThemeTokens = {
  '--dam-bg': '#F5F4F0',
  '--dam-bg-pattern':
    'radial-gradient(#CCCCCC 1px, transparent 1px) 0 0 / 16px 16px',
  '--dam-surface': '#FFFFFF',
  '--dam-surface-2': '#F5F4F0',
  '--dam-surface-hover': '#EDEEF0',

  '--dam-ink': '#111111',
  '--dam-ink-muted': '#6B6B6B',
  '--dam-ink-inverse': '#FFFFFF',

  '--dam-border': '#000000',
  '--dam-border-soft': '#000000',
  '--dam-border-width': '3px',
  '--dam-radius-sm': '6px',
  '--dam-radius': '12px',
  '--dam-radius-lg': '20px',
  '--dam-shadow': '4px 4px 0 0 #000000',
  '--dam-shadow-lg': '8px 8px 0 0 #000000',

  '--dam-accent': '#C6F252',
  '--dam-accent-ink': '#111111',
  '--dam-accent-soft': '#F6FDE3',
  '--dam-danger': '#EF233C',
  '--dam-success': '#70970B',
  '--dam-warning': '#F2811F',

  '--dam-board-bg': '#F5F4F0',
  '--dam-cell-light': '#F6FDE3',
  '--dam-cell-dark': '#FFFFFF',
  '--dam-cell-line': '#000000',
  '--dam-highlight': '#FF7D9F',
  '--dam-target': '#C6F252',
  '--dam-capture-target': '#EF233C',
  '--dam-offender': '#F2811F',

  '--dam-p1': '#FF7D9F',
  '--dam-p1-edge': '#000000',
  '--dam-p2': '#7B52F2',
  '--dam-p2-edge': '#000000',
  '--dam-crown': '#F2811F',

  '--dam-font-display': "'Archivo Black', 'Arial Black', sans-serif",
  '--dam-font-body': "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  '--dam-font-mono': "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', monospace",
  '--dam-display-transform': 'uppercase',
  '--dam-display-spacing': '0.04em',
}

export const neobrutalistTheme: ThemeDefinition = {
  key: 'neobrutalist',
  name: 'Neobrutalist Pop',
  blurb: 'Hard black outlines, flat offset shadows, and colours that shout.',
  tokens,
  parts: { Piece, CellDecor, BoardFrame, EndSequence },
  motion: {
    hoverScale: 1.1,
    tapScale: 0.92,
    moveTransition: { type: 'spring', stiffness: 380, damping: 32 },
    captureDurationMs: 380,
    endSequenceMs: 2200,
  },
  boardGap: 0,
  boardStyle: 'checker',
}
