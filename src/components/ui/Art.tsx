import { useId } from 'react'
import { THEME_PALETTE, paintArt, swapSides } from '../../art/paint'

interface ArtProps {
  /** A file from `src/art`, imported with `?raw`. */
  svg: string
  className?: string
  /** Paint the first side's pieces in the second side's colour, and back: for pictures about the viewer, who may be either. */
  swapSides?: boolean
}

const SWAPPED = swapSides(THEME_PALETTE)

/**
 * A decorative illustration in the current theme's colours. Hidden from
 * screen readers: every picture sits beside words that say the same thing.
 * The markup is our own committed files, checked by `src/art/art.test.ts`.
 */
export default function Art({ svg, className, swapSides }: ArtProps) {
  // useId's characters are not all valid in an SVG id, and url(#…) needs a plain one.
  const prefix = `art${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-`
  return (
    <span
      className={className ? `art ${className}` : 'art'}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paintArt(svg, swapSides ? SWAPPED : THEME_PALETTE, prefix) }}
    />
  )
}
