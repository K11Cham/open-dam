import type { ComponentType, ReactNode } from 'react'
import type { Coord, GameStatus, PieceData, PlayerId } from '../game/types'

/**
 * A theme is three things, not one:
 *
 *   1. `tokens`  — CSS custom properties written onto <html>.
 *   2. `parts`   — actual React components for the pieces of the UI whose
 *                  *structure* differs between themes, not just their colour.
 *   3. `motion`  — the interaction and outcome animations.
 *
 * Point 2 is the reason this file exists. The previous ThemeContext held ten
 * entries that were nothing but colour maps rendered by identical components,
 * which meant every "theme" was the same app with a different accent. A theme
 * here can change the DOM: a piece can be a flat disc in one theme and an
 * illustrated token with a face in another, and the board can be a bordered
 * slab or a set of hairlines.
 *
 * Structural rules that are better expressed in CSS than in JSX live in each
 * theme's stylesheet, scoped to `[data-theme="<key>"]` so one theme can never
 * leak into another.
 */

export type ThemeKey = 'neobrutalist' | 'atelier' | 'carnival'

/** Semantic token set. Every component styles itself from these, never raw hex. */
export interface ThemeTokens {
  // surfaces
  '--dam-bg': string
  '--dam-bg-pattern': string
  '--dam-surface': string
  '--dam-surface-2': string
  '--dam-surface-hover': string
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
  // accents
  '--dam-accent': string
  '--dam-accent-ink': string
  '--dam-accent-soft': string
  '--dam-danger': string
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
}

export interface PieceViewProps {
  piece: PieceData
  /** Fraction of the cell the piece should occupy, 0-1. */
  scale?: number
  selected?: boolean
  offender?: boolean
  /** Drives the crowning animation once. */
  justPromoted?: boolean
  interactive?: boolean
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
  /** `null` while the game is in progress. */
  outcome: GameStatus
}

export interface EndSequenceProps {
  status: GameStatus
  /** Board coordinates of the surviving pieces, for per-piece choreography. */
  survivors: Array<{ piece: PieceData; at: Coord }>
  gridSize: number
  /** Which side the local player is on, so "you" reads correctly. */
  viewer: PlayerId
}

export interface ThemeParts {
  Piece: ComponentType<PieceViewProps>
  CellDecor: ComponentType<CellDecorProps>
  BoardFrame: ComponentType<BoardFrameProps>
  /** Board-level win/lose/tie choreography. Never a modal. */
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
  /** How long the end-of-game board animation runs, in ms. */
  endSequenceMs: number
}

export interface ThemeDefinition {
  key: ThemeKey
  name: string
  blurb: string
  tokens: ThemeTokens
  parts: ThemeParts
  motion: ThemeMotion
  /** Board grid gap in px — a structural, not cosmetic, difference. */
  boardGap: number
  /** Whether the board draws alternating cell fills or hairline rules only. */
  boardStyle: 'checker' | 'grid-lines' | 'tiles'
}
