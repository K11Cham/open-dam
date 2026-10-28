import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  /** Render as a <section> with a heading-aware layout. */
  as?: 'div' | 'section' | 'aside' | 'article'
  /** Tighter inner spacing. */
  dense?: boolean
}

/** A themed surface. Shape, border and elevation come from the active theme. */
export default function Panel({ children, className = '', as: Tag = 'div', dense, ...rest }: PanelProps) {
  return (
    <Tag className={['panel', dense && 'panel--dense', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  )
}
