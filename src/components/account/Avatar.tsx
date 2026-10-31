import { isAvatarColour } from '../../net/account'

interface AvatarProps {
  name: string
  /** A colour role (`AVATAR_COLOURS`); each theme draws it in its own palette. */
  colour: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/** A player's initial on their chosen colour. Decorative: the name beside it says who it is. */
export default function Avatar({ name, colour, size = 'md', className }: AvatarProps) {
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?'
  const role = isAvatarColour(colour) ? colour : 'accent'
  return (
    <span className={['avatar', `avatar--${role}`, `avatar--${size}`, className].filter(Boolean).join(' ')} aria-hidden>
      {initial}
    </span>
  )
}
