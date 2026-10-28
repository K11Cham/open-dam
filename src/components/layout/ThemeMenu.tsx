import { AnimatePresence, motion } from 'framer-motion'
import { Check, Palette } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTheme } from '../../context/useTheme'
import type { ThemeDefinition } from '../../themes/types'

/** Three swatches that preview a theme's surface and its two piece colours. */
function Swatch({ theme }: { theme: ThemeDefinition }) {
  const t = theme.tokens
  return (
    <span className="theme-swatch" style={{ background: t['--dam-surface'], borderColor: t['--dam-border-soft'] }} aria-hidden>
      <span style={{ background: t['--dam-p1'], borderColor: t['--dam-p1-edge'] }} />
      <span style={{ background: t['--dam-p2'], borderColor: t['--dam-p2-edge'] }} />
      <span style={{ background: t['--dam-accent'] }} />
    </span>
  )
}

/**
 * Theme switcher: a button that opens a small menu of themes. Arrow keys move
 * between themes, Enter picks one, Escape or a click outside closes it, and
 * focus returns to the button.
 */
export default function ThemeMenu() {
  const { theme, setTheme, availableThemes } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    const index = availableThemes.findIndex((t) => t.key === theme.key)
    itemRefs.current[index]?.focus()
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, availableThemes, theme.key])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onMenuKey = (event: KeyboardEvent) => {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[]
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
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

  return (
    <div ref={rootRef} className="theme-menu">
      <button
        ref={buttonRef}
        type="button"
        className="btn btn--icon btn--ghost"
        aria-label={`Theme: ${theme.name}. Change theme`}
        title="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Palette size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label="Theme"
            className="menu"
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
          >
            <span className="menu__label">Theme</span>
            {availableThemes.map((entry, index) => {
              const active = entry.key === theme.key
              return (
                <button
                  key={entry.key}
                  ref={(el) => {
                    itemRefs.current[index] = el
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`menu__item ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    setTheme(entry.key)
                    close()
                  }}
                >
                  <Swatch theme={entry} />
                  <span className="menu__text">
                    <span className="menu__title">{entry.name}</span>
                    <span className="menu__hint">{entry.blurb}</span>
                  </span>
                  {active && <Check size={16} aria-hidden />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
