import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'default' | 'primary' | 'danger'
  size?: 'default' | 'small'
}

/**
 * The only button in the app. It carries no visual opinion of its own beyond
 * layout — each theme's stylesheet decides whether `.dam-button` is a slab with
 * a hard shadow, an underlined label, or a rounded pill.
 */
export default function Button({
  children,
  variant = 'default',
  size = 'default',
  className = '',
  ...rest
}: ButtonProps) {
  const classes = [
    'dam-button',
    variant === 'primary' && 'is-primary',
    variant === 'danger' && 'is-danger',
    size === 'small' && 'is-small',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
