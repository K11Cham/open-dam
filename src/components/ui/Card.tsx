import type { HTMLAttributes, ReactNode } from 'react'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/** Themed surface container. Shape and elevation come from the active theme. */
export default function Card({ children, className = '', ...rest }: PanelProps) {
  return (
    <div className={`dam-panel dam-split-panel ${className}`} {...rest}>
      {children}
    </div>
  )
}
