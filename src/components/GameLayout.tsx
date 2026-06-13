import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import { useTheme } from '../context/ThemeContext'

interface GameLayoutProps {
  children: ReactNode
}

export default function GameLayout({ children }: GameLayoutProps) {
  const navigate = useNavigate()
  const { theme } = useTheme()

  const handleNewGame = () => {
    navigate('/menu')
  }

  return (
    <div className="flex flex-col h-screen w-full" style={{ background: 'transparent' }}>
      <Navbar onNewGameClick={handleNewGame} />
      {/*
        overflow-y-auto (not overflow-hidden) so that when the sidebar stacks below the board
        on narrow screens, it can be reached by scrolling.
        overflow-x-hidden prevents any accidental horizontal scroll.
      */}
      <main className="flex flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {children}
      </main>
      <footer
        className="px-6 py-3 text-center text-sm"
        style={{
          backgroundColor: theme.surface + '60',
          borderTop: `1px solid ${theme.border}40`,
        }}
      >
        <span style={{ color: theme.textMuted + '60' }}>© 2026 Open Dam. All rights reserved.</span>
      </footer>
    </div>
  )
}