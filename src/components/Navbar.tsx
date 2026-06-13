import { useTheme } from '../context/ThemeContext'
import { Settings, Menu, X, Swords, Puzzle, BookOpen, Trophy, Info, Code2, Plus } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

interface NavbarProps {
  onNewGameClick?: () => void
}

const NAV_ITEMS = [
  { icon: Swords,   label: 'Play',        href: '#', active: true  },
  { icon: Puzzle,   label: 'Puzzles',     href: '#', active: false },
  { icon: BookOpen, label: 'Learn',       href: '#', active: false },
  { icon: Trophy,   label: 'Leaderboard', href: '#', active: false },
  { icon: Info,     label: 'About',       href: '#', active: false },
  { icon: Code2,    label: 'Source',      href: '#', active: false },
]

export default function Navbar({ onNewGameClick }: NavbarProps) {
  const navigate = useNavigate()
  const { theme, setTheme, allThemes } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const themeMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node))
        setShowThemeMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <nav
        className="flex items-center justify-between w-full px-4 py-2.5 shrink-0 relative z-40"
        style={{
          backgroundColor: '#0a0a0a',
          borderBottom: `1px solid ${theme.border}30`,
          backdropFilter: 'blur(14px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-all"
            style={{
              backgroundColor: theme.surface + '60',
              border: `1px solid ${theme.border}30`,
              color: theme.text + '90',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.accent + '30'
              e.currentTarget.style.borderColor = theme.accent + '60'
              e.currentTarget.style.color = theme.accent
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = theme.surface + '60'
              e.currentTarget.style.borderColor = theme.border + '30'
              e.currentTarget.style.color = theme.text + '90'
            }}
            aria-label="Open menu"
          >
            <Menu size={17} />
          </button>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 cursor-pointer transition-all hover:scale-105"
            style={{ backgroundColor: 'transparent', border: 'none' }}
          >
            <span className="text-base font-bold tracking-tight" style={{ color: theme.text }}>
              Open Dam
            </span>
          </button>
        </div>

        {/* Right: theme + new game */}
        <div className="flex items-center gap-2">
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setShowThemeMenu((v) => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-all"
              style={{
                backgroundColor: theme.surface + '60',
                border: `1px solid ${theme.border}30`,
                color: theme.text + '90',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.accent + '30'
                e.currentTarget.style.borderColor = theme.accent + '60'
                e.currentTarget.style.color = theme.accent
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.surface + '60'
                e.currentTarget.style.borderColor = theme.border + '30'
                e.currentTarget.style.color = theme.text + '90'
              }}
              title="Theme"
            >
              <Settings size={16} />
            </button>

            <AnimatePresence>
              {showThemeMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -6 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute top-full right-0 mt-2 p-3 rounded-2xl shadow-xl z-50 min-w-[160px]"
                  style={{
                    backgroundColor: theme.surface,
                    border: `1px solid ${theme.border}50`,
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  <span className="text-xs font-semibold px-2 mb-2 block" style={{ color: theme.textMuted + '80' }}>
                    Theme
                  </span>
                  <div className="flex flex-col gap-1">
                    {Object.keys(allThemes).map((name) => {
                      const isActive = theme === allThemes[name as keyof typeof allThemes]
                      return (
                        <button
                          key={name}
                          onClick={() => { setTheme(name as keyof typeof allThemes); setShowThemeMenu(false) }}
                          className="text-left px-3 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all"
                          style={{
                            backgroundColor: isActive ? theme.accent + '25' : 'transparent',
                            color: isActive ? theme.accent : theme.text + '90',
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) e.currentTarget.style.backgroundColor = theme.border + '30'
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          {name.charAt(0).toUpperCase() + name.slice(1)}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {onNewGameClick && (
            <button
              onClick={onNewGameClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold cursor-pointer transition-all"
              style={{
                backgroundColor: theme.accent + 'dd',
                color: '#ffffff',
                border: `1px solid ${theme.accent}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.accent
                e.currentTarget.style.boxShadow = `0 0 0 3px ${theme.accent}30`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.accent + 'dd'
                e.currentTarget.style.boxShadow = ''
              }}
            >
              <Plus size={14} />
              New Game
            </button>
          )}
        </div>
      </nav>

      {/* ── Sidebar backdrop ────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar panel ───────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            className="fixed top-0 left-0 h-full z-[60] flex flex-col"
            style={{
              width: 260,
              backgroundColor: '#0a0a0a',
              borderRight: `1px solid ${theme.border}40`,
              boxShadow: '4px 0 40px rgba(0,0,0,0.3)',
            }}
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {/* Sidebar header */}
            <div
              className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: `1px solid ${theme.border}30` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight" style={{ color: theme.text }}>
                  Open Dam
                </span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-full cursor-pointer transition-all"
                style={{ color: theme.textMuted, backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.border + '40'
                  e.currentTarget.style.color = theme.text
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = theme.textMuted
                }}
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>

            {/* Nav items — plain <a>, no entry animation */}
            <nav className="flex flex-col gap-1 px-3 py-4 flex-1 overflow-y-auto">
              {NAV_ITEMS.map(({ icon: Icon, label, href, active }) => (
                <a
                  key={label}
                  href={href}
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer"
                  style={{
                    backgroundColor: active ? theme.accent + '20' : 'transparent',
                    color: active ? theme.accent : theme.text + '80',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = theme.border + '30'
                      e.currentTarget.style.color = theme.text
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = theme.text + '80'
                    }
                  }}
                >
                  <Icon size={16} style={{ flexShrink: 0 }} />
                  {label}
                  {active && (
                    <span
                      className="ml-auto text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: theme.accent + '30', color: theme.accent }}
                    >
                      Now
                    </span>
                  )}
                </a>
              ))}
            </nav>

            {/* Sidebar footer */}
            <div
              className="px-4 py-4 shrink-0"
              style={{ borderTop: `1px solid ${theme.border}30` }}
            >
              <p className="text-xs text-center" style={{ color: theme.textMuted + '60' }}>
                © 2026 Open Dam
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}