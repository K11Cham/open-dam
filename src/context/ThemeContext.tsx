import { createContext, useContext, useState } from 'react'

const themes = {
  chesscom: {
    name: 'Chess.com',
    bg: '#FFFFFF',
    board: '#F5F5F5',
    boardBorder: '#E0E0E0',
    cell: '#FFFFFF',
    p1: '#D32F2F',
    p1Border: '#B71C1C',
    p2: '#1976D2',
    p2Border: '#0D47A1',
    king: '#FFD700',
    text: '#212121',
    textMuted: '#757575',
    highlight: '#E3F2FD',
    accent: '#1976D2',
    surface: '#FFFFFF',
    surfaceHover: '#F5F5F5',
    border: '#E0E0E0',
  },
  dark: {
    name: 'Dark',
    bg: '#1a1a2e',
    board: '#2d2d44',
    boardBorder: '#4a4a6a',
    cell: '#252540',
    p1: '#ef4444',
    p1Border: '#dc2626',
    p2: '#3b82f6',
    p2Border: '#2563eb',
    king: '#ffd700',
    text: '#e5e5e5',
    textMuted: '#a3a3a3',
    highlight: '#3a3a5a',
    accent: '#8b5cf6',
    surface: '#2a2a45',
    surfaceHover: '#3a3a55',
    border: '#4a4a6a',
  },
  midnight: {
    name: 'Midnight',
    bg: '#16213e',
    board: '#1f3a5f',
    boardBorder: '#4a6fa5',
    cell: '#1a3a5f',
    p1: '#E63946',
    p1Border: '#c1121f',
    p2: '#4a6fa5',
    p2Border: '#3a5a85',
    king: '#FFD700',
    text: '#E0E1DD',
    textMuted: '#778DA9',
    highlight: '#2d4a6f',
    accent: '#8b5cf6',
    surface: '#1f3a5f',
    surfaceHover: '#2d4a6f',
    border: '#4a6fa5',
  },
  nordic: {
    name: 'Nordic',
    bg: '#3b4252',
    board: '#434c5e',
    boardBorder: '#5c6a7f',
    cell: '#434c5e',
    p1: '#BF616A',
    p1Border: '#a3444d',
    p2: '#5E81AC',
    p2Border: '#4a6a8f',
    king: '#EBCB8B',
    text: '#ECEFF4',
    textMuted: '#D8DEE9',
    highlight: '#4c566a',
    accent: '#8b5cf6',
    surface: '#434c5e',
    surfaceHover: '#4c566a',
    border: '#5c6a7f',
  },
  dracula: {
    name: 'Dracula',
    bg: '#2d2d44',
    board: '#3d3d5c',
    boardBorder: '#6a6a9a',
    cell: '#3a3a5a',
    p1: '#FF5555',
    p1Border: '#e03e3e',
    p2: '#BD93F9',
    p2Border: '#a070f0',
    king: '#F1FA8C',
    text: '#F8F8F2',
    textMuted: '#6a6a9a',
    highlight: '#4a4a6a',
    accent: '#8b5cf6',
    surface: '#3a3a5a',
    surfaceHover: '#4a4a6a',
    border: '#6a6a9a',
  },
  neon: {
    name: 'Neon',
    bg: '#1a1a2e',
    board: '#2a2a4e',
    boardBorder: '#8b5cf6',
    cell: '#222244',
    p1: '#FF0055',
    p1Border: '#cc0044',
    p2: '#00FFFF',
    p2Border: '#00cccc',
    king: '#FFFF00',
    text: '#FFFFFF',
    textMuted: '#888888',
    highlight: '#3a3a5a',
    accent: '#8b5cf6',
    surface: '#2a2a4e',
    surfaceHover: '#3a3a5a',
    border: '#4a4a6a',
  },
  retro: {
    name: 'Retro',
    bg: '#3d2817',
    board: '#4e372e',
    boardBorder: '#8d6e63',
    cell: '#4e372e',
    p1: '#D84315',
    p1Border: '#bf360c',
    p2: '#1565C0',
    p2Border: '#0d47a1',
    king: '#FFD700',
    text: '#FFF8E1',
    textMuted: '#BCAAA4',
    highlight: '#5e473e',
    accent: '#8b5cf6',
    surface: '#4e372e',
    surfaceHover: '#5e473e',
    border: '#7d5747',
  },
  cherry: {
    name: 'Cherry Blossom',
    bg: '#2a1a20',
    board: '#3d2330',
    boardBorder: '#C2185B',
    cell: '#3d2330',
    p1: '#AD1457',
    p1Border: '#880e4f',
    p2: '#00695C',
    p2Border: '#004d40',
    king: '#FFD700',
    text: '#FCE4EC',
    textMuted: '#F48FB1',
    highlight: '#4d2a3a',
    accent: '#8b5cf6',
    surface: '#3d2330',
    surfaceHover: '#4d2a3a',
    border: '#7d3050',
  },
  monochrome: {
    name: 'Monochrome',
    bg: '#1a1a1a',
    board: '#2a2a2a',
    boardBorder: '#555555',
    cell: '#2a2a2a',
    p1: '#FFFFFF',
    p1Border: '#cccccc',
    p2: '#888888',
    p2Border: '#666666',
    king: '#FFD700',
    text: '#FFFFFF',
    textMuted: '#888888',
    highlight: '#3a3a3a',
    accent: '#8b5cf6',
    surface: '#2a2a2a',
    surfaceHover: '#3a3a3a',
    border: '#444444',
  },
}

type ThemeKey = keyof typeof themes
type Theme = typeof themes.dark

interface ThemeContextType {
  currentTheme: ThemeKey
  setTheme: (theme: ThemeKey) => void
  theme: Theme
  allThemes: typeof themes
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'openDamTheme'

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return (saved && saved in themes ? saved : 'chesscom') as ThemeKey
  })

  const setTheme = (theme: ThemeKey) => {
    setCurrentTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }

  return (
    <ThemeContext.Provider value={{
      currentTheme,
      setTheme,
      theme: themes[currentTheme],
      allThemes: themes,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export type { ThemeKey, Theme }