import { useContext } from 'react'
import type { PlayerId } from '../game/types'
import { ThemeContext } from './themeContextObject'

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

/** Shortcut for components that only need the theme's component slots. */
export const useThemeParts = () => useTheme().theme.parts

/** The current theme's name for each side, e.g. "Red" / "Blue" or "Black" / "White". */
export const useSideNames = (): Record<PlayerId, string> => {
  const { sides } = useTheme().theme
  return { player1: sides.player1.name, player2: sides.player2.name }
}
