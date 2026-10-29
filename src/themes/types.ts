import type { ComponentType, ReactNode } from 'react'
import type { ThemeSounds } from '../audio/types'
import type { GameStatus, PieceData, PlayerId } from '../game/types'

/**
 * A theme is a complete visual language, not a palette:
 *
 *   1. `tokens`  — CSS custom properties written onto <html>. Every shared
 *                  component styles itself from these and nothing else.
 *   2. `parts`   — React components for the pieces of the UI whose STRUCTURE
 *                  differs between themes (a flat disc vs a painted token).
 *   3. `motion`  — how things move.
 *   4. `sides`   — what the two sides are called in this theme. The pieces
 *                  are black and white in Atelier, so calling them "Red" and
 *                  "Blue" there would be wrong.
 *   5. `sounds`  — what the game sounds like: one sound per cue, kept in the
 *                  theme's own `sounds.ts` (plain data, see src/audio).
 *
 * Structural rules better expressed in CSS live in each theme's stylesheet,
 * scoped to `[data-theme="<key>"]` so one theme can never leak into another.
 */

export type ThemeKey = 'neobrutalist' | 'atelier' | 'carnival' | 'sand'

/** Semantic token set. Components use these, never raw colours. */
export interface ThemeTokens {
  // surfaces
  '--dam-bg': string
  '--dam-bg-pattern': string
  '--dam-surface': string
  '--dam-surface-2': string
  '--dam-surface-hover': string
  '--dam-overlay': string
  // ink
  '--dam-ink': string
  '--dam-ink-muted': string
  '--dam-ink-inverse': string
  // structure
  '--dam-border': string
  '--dam-border-soft': string
  '--dam-border-width': string
  '--dam-radius-sm': string
  '--dam-radius': string
  '--dam-radius-lg': string
  '--dam-shadow': string
  '--dam-shadow-lg': string
  '--dam-focus': string
  // accents
  '--dam-accent': string
  '--dam-accent-ink': string
  '--dam-accent-soft': string
  '--dam-danger': string
  '--dam-danger-ink': string
  '--dam-success': string
  '--dam-warning': string
  // board
  '--dam-board-bg': string
  '--dam-cell-light': string
  '--dam-cell-dark': string
  '--dam-cell-line': string
  '--dam-highlight': string
  '--dam-target': string
  '--dam-capture-target': string
  '--dam-offender': string
  // pieces
  '--dam-p1': string
  '--dam-p1-edge': string
  '--dam-p2': string
  '--dam-p2-edge': string
  '--dam-crown': string
  // type
  '--dam-font-display': string
  '--dam-font-body': string
  '--dam-font-mono': string
  '--dam-display-transform': string
  '--dam-display-spacing': string
  '--dam-display-weight': string
}

export interface PieceViewProps {
  piece: PieceData
  /** Fraction of the cell the piece should occupy, 0-1. */
  scale?: number
  selected?: boolean
  offender?: boolean
  /** Drives the crowning animation once. */
  justPromoted?: boolean
}

export interface CellDecorProps {
  row: number
  col: number
  isLight: boolean
  isTarget: boolean
  isCaptureTarget: boolean
  isChainTarget: boolean
  isSelected: boolean
  isOffender: boolean
  isLastMove: boolean
}

export interface BoardFrameProps {
  gridSize: number
  children: ReactNode
}

export interface EndSequenceProps {
  status: GameStatus
  gridSize: number
  /**
   * The side whose win counts as "ours" on this device, or null when both
   * sides are local (hot seat) and neither result is a loss for the viewer.
   */
  perspective: PlayerId | null
}

export interface ThemeParts {
  Piece: ComponentType<PieceViewProps>
  CellDecor: ComponentType<CellDecorProps>
  BoardFrame: ComponentType<BoardFrameProps>
  /** Board-level win/lose/tie choreography, drawn over the board. */
  EndSequence: ComponentType<EndSequenceProps>
}

export interface ThemeMotion {
  /** Scale applied on hover (mouse) — touch devices get the tap state instead. */
  hoverScale: number
  tapScale: number
  /** Spring used when a piece travels between squares. */
  moveTransition: { type: 'spring'; stiffness: number; damping: number } | { duration: number }
  /** How long the capture exit animation runs, in ms. */
  captureDurationMs: number
}

export interface SideStyle {
  /** What this side is called in this theme, e.g. "Red" or "Black". */
  name: string
}

export interface ThemeDefinition {
  key: ThemeKey
  name: string
  blurb: string
  /** Light or dark, so the browser chrome and form controls match. */
  colorScheme: 'light' | 'dark'
  tokens: ThemeTokens
  parts: ThemeParts
  motion: ThemeMotion
  sides: Record<PlayerId, SideStyle>
  /** Board grid gap in px — a structural, not cosmetic, difference. */
  boardGap: number
  sounds: ThemeSounds
}
