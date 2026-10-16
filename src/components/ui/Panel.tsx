import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** Themed surface container. Shape and elevation come from the active theme. */
export default function Panel({ children, className = '', ...rest }: PanelProps) {
  return (
    <div className={`dam-panel ${className}`} {...rest}>
      {children}
    </div>
  )
}
