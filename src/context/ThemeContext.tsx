import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { STORAGE_KEYS, storage } from '../services/storage'
import { DEFAULT_THEME, THEMES, THEME_KEYS, isThemeKey } from '../themes/registry'
import type { ThemeKey } from '../themes/types'
import { ThemeContext } from './themeContextObject'
import type { ThemeContextValue } from './themeContextObject'

const LEGACY_KEY = 'openDamTheme'

const readStored = (): ThemeKey => {
  const saved = storage.get<string>(STORAGE_KEYS.theme)
  if (isThemeKey(saved)) return saved
  // Older versions stored the bare key, unencoded, under another name.
  try {
    const legacy = typeof localStorage === 'undefined' ? null : localStorage.getItem(LEGACY_KEY)
    if (isThemeKey(legacy)) return legacy
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return DEFAULT_THEME
}

const touchQuery = '(hover: none), (pointer: coarse)'
const initialTouch = () => typeof window !== 'undefined' && !!window.matchMedia?.(touchQuery).matches

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>(readStored)
  const [isTouch, setIsTouch] = useState(initialTouch)
  const theme = THEMES[themeKey]

  // Tokens go onto <html>; `data-theme` switches on that theme's stylesheet,
  // whose rules are all scoped to it, so no theme's CSS survives a switch.
  useEffect(() => {
    const root = document.documentElement
    for (const [token, value] of Object.entries(theme.tokens)) root.style.setProperty(token, value)
    root.style.setProperty('--dam-board-gap', `${theme.boardGap}px`)
    root.setAttribute('data-theme', theme.key)
    root.style.colorScheme = theme.colorScheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.tokens['--dam-bg'])
  }, [theme])

  useEffect(() => {
    const query = window.matchMedia?.(touchQuery)
    if (!query) return
    const update = () => setIsTouch(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeKey,
      theme,
      setTheme: (key: ThemeKey) => {
        setThemeKey(key)
        storage.set(STORAGE_KEYS.theme, key)
      },
      availableThemes: THEME_KEYS.map((key) => THEMES[key]),
      isTouch,
    }),
    [themeKey, theme, isTouch],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
