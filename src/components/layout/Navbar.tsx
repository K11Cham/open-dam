import { Menu, Plus } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import SideNav from './SideNav'
import ThemeMenu from './ThemeMenu'
import { NAV_ITEMS } from './navItems'

interface NavbarProps {
  /** Shown on pages where starting a fresh match makes sense. */
  showNewGame?: boolean
}

export default function Navbar({ showNewGame = true }: NavbarProps) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <nav className="dam-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button
            type="button"
            className="dam-icon-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={17} />
          </button>
          <button type="button" className="dam-wordmark" onClick={() => navigate('/')}>
            Open Dam
          </button>
        </div>

        <div className="dam-nav-links">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `dam-nav-link ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeMenu />
          {showNewGame && (
            <Button variant="primary" size="small" onClick={() => navigate('/play')}>
              <Plus size={14} />
              New game
            </Button>
          )}
        </div>
      </nav>

      <SideNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
