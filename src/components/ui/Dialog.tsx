import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  /** Short text under the title, read out with it. */
  description?: ReactNode
  children?: ReactNode
  /** Buttons row at the bottom. */
  footer?: ReactNode
  size?: 'sm' | 'md'
  /** `drawer` slides in from the left edge, for navigation. */
  variant?: 'dialog' | 'drawer'
  /** Hide the visible title (still announced). */
  hideTitle?: boolean
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal: `role="dialog"` with `aria-modal`, focus moves inside when
 * it opens, Tab is trapped within it, Escape and the backdrop close it, and
 * focus returns to whatever opened it. Every modal in the app uses this.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  variant = 'dialog',
  hideTitle,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [open])

  const isDrawer = variant === 'drawer'

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={`dialog-root ${isDrawer ? 'is-drawer' : ''}`}>
          <motion.div
            className="dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={`dialog ${isDrawer ? 'dialog--drawer' : `dialog--${size}`}`}
            initial={isDrawer ? { x: '-100%' } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={isDrawer ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isDrawer ? { x: '-100%' } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={
              isDrawer ? { type: 'spring', stiffness: 360, damping: 36 } : { type: 'spring', stiffness: 380, damping: 30 }
            }
          >
            <div className="dialog__head">
              <h2 id={titleId} className={hideTitle ? 'visually-hidden' : 'dialog__title'}>
                {title}
              </h2>
              <IconButton label="Close" icon={<X size={18} />} onClick={onClose} className="dialog__close" />
            </div>
            {description && (
              <p id={descriptionId} className="dialog__description">
                {description}
              </p>
            )}
            {children && <div className="dialog__body">{children}</div>}
            {footer && <div className="dialog__footer">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

/** A yes/no question. The safe answer (cancel) gets focus first. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel} data-autofocus>
            <span className="btn__label">{cancelLabel}</span>
          </button>
          <button type="button" className={`btn btn--${tone}`} onClick={onConfirm}>
            <span className="btn__label">{confirmLabel}</span>
          </button>
        </>
      }
    />
  )
}
