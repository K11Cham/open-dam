import { MARK_GRID_PATH, MARK_PIECES, MARK_SIZE, STICK, STONE_RADIUS } from '../../themes/brand'

/**
 * The Open Dam mark in the current theme's colours: the sticks are the second
 * side's colour and the stones the first's, so it always matches the board.
 * The fixed-colour version for icons comes from the same geometry
 * (src/themes/brand.ts).
 */
export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg className={`brand-mark ${className}`} viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`} aria-hidden focusable="false">
      <path className="brand-mark__grid" d={MARK_GRID_PATH} />
      {MARK_PIECES.map(({ kind, x, y }) =>
        kind === 'stone' ? (
          <circle key={`${x},${y}`} className="brand-mark__stone" cx={x} cy={y} r={STONE_RADIUS} />
        ) : (
          <rect
            key={`${x},${y}`}
            className="brand-mark__stick"
            x={x - STICK.width / 2}
            y={y - STICK.length / 2}
            width={STICK.width}
            height={STICK.length}
            rx={STICK.width / 2}
            transform={`rotate(${STICK.angle} ${x} ${y})`}
          />
        ),
      )}
    </svg>
  )
}
