import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type ToastTone = 'info' | 'success' | 'error'

interface Toast {
  id: number
  message: string
  tone: ToastTone
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DURATION_MS: Record<ToastTone, number> = { info: 3200, success: 3200, error: 4200 }

/**
 * Short status messages ("Draw declined", "That is not your turn"). They are
 * announced by screen readers through a polite live region (errors
 * assertively), stack at the bottom of the screen, and dismiss themselves.
 * The same message twice in a row just restarts its timer.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)
  const timers = useRef(new Map<number, number>())
  // Mirror of the list, so `show` can check for duplicates without a state updater.
  const live = useRef<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    live.current = live.current.filter((t) => t.id !== id)
    setToasts(live.current)
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const existing = live.current.find((t) => t.message === message)
      const id = existing?.id ?? ++counter.current
      window.clearTimeout(timers.current.get(id))
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION_MS[tone]),
      )
      if (existing) return
      const next = [...live.current.slice(-2), { id, message, tone }]
      live.current = next
      setToasts(next)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              className={`toast toast--${toast.tone}`}
              role={toast.tone === 'error' ? 'alert' : undefined}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {toast.tone === 'error' ? (
                <AlertCircle size={16} />
              ) : toast.tone === 'success' ? (
                <CheckCircle2 size={16} />
              ) : (
                <Info size={16} />
              )}
              <span>{toast.message}</span>
              <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used within ToastProvider')
  return api
}
