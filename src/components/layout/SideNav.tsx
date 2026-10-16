import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navItems'

interface SideNavProps {
  open: boolean
  onClose: () => void
}

export default function SideNav({ open, onClose }: SideNavProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="dam-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            className="dam-sidenav"
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
          >
            <div
              className="dam-sidenav-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px',
              }}
            >
              <span className="dam-wordmark">Open Dam</span>
              <button type="button" className="dam-icon-button" onClick={onClose} aria-label="Close menu">
                <X size={16} />
              </button>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, flex: 1 }}>
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) => `dam-sidenav-link ${isActive ? 'is-active' : ''}`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            <p style={{ padding: 16, fontSize: 11, color: 'var(--dam-ink-muted)', margin: 0 }}>
              Open Dam — open-source draughts variant.
            </p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
