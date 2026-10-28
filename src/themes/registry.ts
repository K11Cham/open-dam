import { atelierTheme } from './atelier/theme'
import { carnivalTheme } from './carnival/theme'
import { neobrutalistTheme } from './neobrutalist/theme'
import { sandTheme } from './sand/theme'
import type { ThemeDefinition, ThemeKey } from './types'

/**
 * The full set of themes: the original neobrutalist look sealed into its own
 * module, two flat alternatives, and Sand, a 3D board drawn in the sand. Adding
 * another means writing its `parts.tsx` and `theme.css` too — a token map alone
 * is not a theme in this system.
 */
export const THEMES: Record<ThemeKey, ThemeDefinition> = {
  neobrutalist: neobrutalistTheme,
  atelier: atelierTheme,
  carnival: carnivalTheme,
  sand: sandTheme,
}

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[]
export const DEFAULT_THEME: ThemeKey = 'neobrutalist'

export const isThemeKey = (value: unknown): value is ThemeKey => typeof value === 'string' && value in THEMES
