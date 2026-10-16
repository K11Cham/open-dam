import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_THEME, THEMES, THEME_KEYS, isThemeKey } from '../themes/registry'
import type { ThemeDefinition, ThemeKey } from '../themes/types'

interface ThemeContextValue {
  themeKey: ThemeKey
  theme: ThemeDefinition
  setTheme: (key: ThemeKey) => void
  availableThemes: ThemeDefinition[]
  /** True on coarse pointers, so themes can skip hover-only affordances. */
  isTouch: boolean
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const STORAGE_KEY = 'openDamTheme'

const readStored = (): ThemeKey => {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME
  const saved = localStorage.getItem(STORAGE_KEY)
  return isThemeKey(saved) ? saved : DEFAULT_THEME
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>(readStored)
  const [isTouch, setIsTouch] = useState(false)

  const theme = THEMES[themeKey]

  // Tokens are written onto <html>, and `data-theme` gates each theme's
  // stylesheet. Because every rule in those stylesheets is scoped to its own
  // `[data-theme=...]`, switching themes swaps the entire visual language
  // without any theme's CSS surviving into the next.
  useEffect(() => {
    const root = document.documentElement
    for (const [token, value] of Object.entries(theme.tokens)) {
      root.style.setProperty(token, value)
    }
    root.setAttribute('data-theme', theme.key)
    root.style.setProperty('--dam-board-gap', `${theme.boardGap}px`)
  }, [theme])

  useEffect(() => {
    const query = window.matchMedia('(hover: none), (pointer: coarse)')
    const update = () => setIsTouch(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const setTheme = (key: ThemeKey) => {
    setThemeKey(key)
    localStorage.setItem(STORAGE_KEY, key)
  }

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeKey,
      theme,
      setTheme,
      availableThemes: THEME_KEYS.map((key) => THEMES[key]),
      isTouch,
    }),
    [themeKey, theme, isTouch],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

/** Shortcut for components that only need the theme's component slots. */
export const useThemeParts = () => useTheme().theme.parts
