import type { ReactNode } from 'react'
import Navbar from './Navbar'

interface AppShellProps {
  children: ReactNode
  showNewGame?: boolean
  /** Match view fills the viewport instead of scrolling as a document. */
  fill?: boolean
}

/** Page frame: themed background, navbar, content slot, footer. */
export default function AppShell({ children, showNewGame = true, fill = false }: AppShellProps) {
  return (
    <div className="dam-app" style={fill ? { height: '100svh' } : undefined}>
      <Navbar showNewGame={showNewGame} />
      <main className="dam-main" style={fill ? { overflow: 'hidden' } : { overflowY: 'auto' }}>
        {children}
      </main>
      {!fill && (
        <footer className="dam-footer">
          <span>© 2026 Open Dam</span>
        </footer>
      )}
    </div>
  )
}
