import { createContext } from 'react'
import type { ThemeDefinition, ThemeKey } from '../themes/types'

export interface ThemeContextValue {
  themeKey: ThemeKey
  theme: ThemeDefinition
  setTheme: (key: ThemeKey) => void
  availableThemes: ThemeDefinition[]
  /** True on coarse pointers, so themes can skip hover-only affordances. */
  isTouch: boolean
}

/** The context object, kept apart from the provider so fast refresh works. */
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
