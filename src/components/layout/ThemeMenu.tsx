import { AnimatePresence, motion } from 'framer-motion'
import { Palette } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'

/**
 * Theme switcher. Each entry shows its own blurb because the three themes are
 * genuinely different experiences, not palette variants.
 */
export default function ThemeMenu() {
  const { theme, setTheme, availableThemes } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="dam-icon-button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change theme"
        aria-expanded={open}
      >
        <Palette size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="dam-panel"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 70,
              width: 248,
              padding: 8,
            }}
          >
            <span className="dam-section-label" style={{ padding: '4px 8px', display: 'block' }}>
              Theme
            </span>
            {availableThemes.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  setTheme(entry.key)
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 10px',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 'var(--dam-radius-sm)',
                  background:
                    entry.key === theme.key ? 'var(--dam-accent-soft)' : 'transparent',
                  color: 'var(--dam-ink)',
                }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{entry.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--dam-ink-muted)' }}>
                  {entry.blurb}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
