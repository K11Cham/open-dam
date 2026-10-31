import { LogIn, Menu, Settings, User } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAccount } from '../../context/useAccount'
import { Dialog } from '../ui/Dialog'
import { IconButton } from '../ui/Button'
import AccountMenu from './AccountMenu'
import SoundToggle from './SoundToggle'
import ThemeMenu from './ThemeMenu'
import { NAV_ITEMS, nextAfterSignIn } from './navItems'

/** The board-mark used as the logo: a 3x3 grid with the centre left open, as at the start of a game. */
export function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 24 24" aria-hidden focusable="false">
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) =>
          r === 1 && c === 1 ? null : (
            <circle
              key={`${r}${c}`}
              cx={4 + c * 8}
              cy={4 + r * 8}
              r="3.1"
              className={r < 1 || (r === 1 && c < 1) ? 'brand__dot is-p2' : 'brand__dot is-p1'}
            />
          ),
        ),
      )}
    </svg>
  )
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const account = useAccount()
  const location = useLocation()
  const drawerLink = ({ isActive }: { isActive: boolean }) => `drawer-nav__link ${isActive ? 'is-active' : ''}`

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <IconButton
          className="topbar__menu"
          label="Open navigation"
          icon={<Menu size={18} />}
          onClick={() => setMenuOpen(true)}
          aria-haspopup="dialog"
        />
        <Link to="/" className="brand" aria-label="Open Dam, home">
          <BrandMark />
          <span className="brand__name">Open Dam</span>
        </Link>

        <nav className="topbar__nav" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `navlink ${isActive ? 'is-active' : ''}`}>
              <Icon size={16} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="topbar__end">
          <SoundToggle />
          <ThemeMenu />
          <AccountMenu />
        </div>
      </div>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Open Dam" variant="drawer">
        <nav aria-label="Main" className="drawer-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `drawer-nav__link ${isActive ? 'is-active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            Home
          </NavLink>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `drawer-nav__link ${isActive ? 'is-active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
          {account.user && (
            <NavLink to={`/u/${account.user.username}`} className={drawerLink} onClick={() => setMenuOpen(false)}>
              <User size={18} aria-hidden />
              <span>Profile</span>
            </NavLink>
          )}
          <NavLink to="/settings" className={drawerLink} onClick={() => setMenuOpen(false)}>
            <Settings size={18} aria-hidden />
            <span>Settings</span>
          </NavLink>
          {account.status === 'signed-out' && (
            <NavLink
              to={`/signin?next=${encodeURIComponent(nextAfterSignIn(location.pathname, location.search))}`}
              className={drawerLink}
              onClick={() => setMenuOpen(false)}
            >
              <LogIn size={18} aria-hidden />
              <span>Sign in</span>
            </NavLink>
          )}
        </nav>
      </Dialog>
    </header>
  )
}
