import type { Board, PlayerId } from '../../game/types'

interface BoardThumbnailProps {
  board: Board
  /** Which side sits at the bottom. */
  orientation?: PlayerId
  /** Spoken description. Leave it out when nearby text already says what the board shows. */
  label?: string
  className?: string
}

const CELL = 10

/**
 * A small, static picture of a position for cards and lists. It is one SVG
 * drawn from theme tokens, so it follows the theme like the real board does,
 * but it has none of the board's input handling or animation, which keeps a
 * page full of them cheap.
 */
export default function BoardThumbnail({ board, orientation = 'player1', label, className }: BoardThumbnailProps) {
  const size = board.length
  const flip = orientation === 'player2'
  const extent = size * CELL

  return (
    <svg
      className={['thumb', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${extent} ${extent}`}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {board.map((line, row) =>
        line.map((piece, col) => {
          const r = flip ? size - 1 - row : row
          const c = flip ? size - 1 - col : col
          const x = c * CELL
          const y = r * CELL
          return (
            <g key={`${row}-${col}`}>
              <rect
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                className={(row + col) % 2 === 0 ? 'thumb__cell' : 'thumb__cell thumb__cell--dark'}
              />
              {piece && (
                <>
                  <circle
                    cx={x + CELL / 2}
                    cy={y + CELL / 2}
                    r={CELL * 0.34}
                    className={piece.player === 'player1' ? 'thumb__piece thumb__piece--p1' : 'thumb__piece thumb__piece--p2'}
                  />
                  {piece.isKing && <circle cx={x + CELL / 2} cy={y + CELL / 2} r={CELL * 0.13} className="thumb__crown" />}
                </>
              )}
            </g>
          )
        }),
      )}
    </svg>
  )
}
