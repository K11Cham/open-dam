import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm' | 'lg'

interface CommonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icon shown before the label. */
  icon?: ReactNode
  /** Stretch to the container width. */
  block?: boolean
}

const classesFor = ({ variant = 'secondary', size = 'md', block }: CommonProps, extra?: string) =>
  ['btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', extra].filter(Boolean).join(' ')

export interface ButtonProps extends CommonProps, ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

/**
 * The app's one button. It owns layout and states; each theme's stylesheet
 * decides whether `.btn` is a slab with a hard shadow, a hairline label, or a
 * rounded pill.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, icon, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={classesFor({ variant, size, block }, className)} {...rest}>
      {icon}
      <span className="btn__label">{children}</span>
    </button>
  )
})

export interface ButtonLinkProps extends CommonProps, Omit<LinkProps, 'className'> {
  className?: string
  children: ReactNode
}

/** A link that looks like a button, for navigation actions. */
export function ButtonLink({ variant, size, icon, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={classesFor({ variant, size, block }, className)} {...rest}>
      {icon}
      <span className="btn__label">{children}</span>
    </Link>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: an icon-only control must still say what it does. */
  label: string
  icon: ReactNode
  variant?: ButtonVariant
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={['btn', 'btn--icon', `btn--${variant}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon}
    </button>
  )
})

export default Button
