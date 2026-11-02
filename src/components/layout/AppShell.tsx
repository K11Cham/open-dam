import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AppNotices from './AppNotices'
import Navbar from './Navbar'

interface AppShellProps {
  children: ReactNode
  /** Wider content area for the match and analysis screens. */
  wide?: boolean
}

/**
 * Page frame: skip link, top bar, the page's own content, footer. Pages scroll
 * as normal documents at every size — nothing is clipped on small screens.
 */
export default function AppShell({ children, wide = false }: AppShellProps) {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Navbar />
      <AppNotices />
      <main id="main" tabIndex={-1} className={`app__main ${wide ? 'is-wide' : ''}`}>
        {children}
      </main>
      <footer className="app__footer">
        <span>Open Dam · a Gambian board game, open source</span>
        <nav aria-label="Footer" className="app__footer-links">
          <Link to="/learn">Rules</Link>
          <a href="https://github.com/k11cham/open-dam" rel="noreferrer">
            Source
          </a>
        </nav>
      </footer>
    </div>
  )
}
