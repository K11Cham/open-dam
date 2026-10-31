import { AnimatePresence, motion } from 'framer-motion'
import { LogIn, LogOut, Settings, User } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAccount } from '../../context/useAccount'
import Avatar from '../account/Avatar'
import { useToast } from '../ui/Toasts'
import { nextAfterSignIn } from './navItems'

/**
 * The account corner of the top bar. Signed out, a "Sign in" link; signed
 * in, the player's avatar, opening a small menu (profile, settings, sign
 * out) that works like the theme menu: arrow keys, Escape, focus returns.
 */
export default function AccountMenu() {
  const account = useAccount()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLElement | null>>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    itemRefs.current[0]?.focus()
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  if (account.status === 'unavailable' || account.status === 'loading') return null

  if (!account.user) {
    const next = nextAfterSignIn(location.pathname, location.search)
    return (
      <Link className="btn btn--sm btn--secondary account-signin" to={`/signin?next=${encodeURIComponent(next)}`}>
        <LogIn size={15} aria-hidden />
        <span className="btn__label">Sign in</span>
      </Link>
    )
  }

  const { user } = account
  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onMenuKey = (event: KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLElement[]
    const current = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(current + step + items.length) % items.length]?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  const signOut = async () => {
    setOpen(false)
    try {
      await account.signOut()
      toast.show('Signed out.', 'success')
      navigate('/')
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not sign out.', 'error')
    }
  }

  return (
    <div ref={rootRef} className="theme-menu account-menu">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn--icon btn--ghost account-menu__button"
        aria-label={`Account: ${user.displayName}`}
        title={user.displayName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar name={user.displayName} colour={user.avatar} size="sm" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Account"
            className="menu account-menu__menu"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
          >
            <span className="account-menu__who">
              <span className="menu__title">{user.displayName}</span>
              <span className="menu__hint">@{user.username}</span>
            </span>
            <Link
              ref={(el) => {
                itemRefs.current[0] = el
              }}
              role="menuitem"
              className="menu__item"
              to={`/u/${user.username}`}
              onClick={() => setOpen(false)}
            >
              <User size={16} aria-hidden />
              <span className="menu__text">
                <span className="menu__title">Profile</span>
              </span>
            </Link>
            <Link
              ref={(el) => {
                itemRefs.current[1] = el
              }}
              role="menuitem"
              className="menu__item"
              to="/settings"
              onClick={() => setOpen(false)}
            >
              <Settings size={16} aria-hidden />
              <span className="menu__text">
                <span className="menu__title">Settings</span>
              </span>
            </Link>
            <button
              ref={(el) => {
                itemRefs.current[2] = el
              }}
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => void signOut()}
            >
              <LogOut size={16} aria-hidden />
              <span className="menu__text">
                <span className="menu__title">Sign out</span>
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
