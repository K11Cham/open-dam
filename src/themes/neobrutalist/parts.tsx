import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import type {
  BoardFrameProps,
  CellDecorProps,
  EndSequenceProps,
  PieceViewProps,
} from '../types'

/** Flat disc, thick outline, hard offset shadow, star for the crown. */
export function Piece({ piece, scale = 0.75, selected, justPromoted }: PieceViewProps) {
  const fill = piece.player === 'player1' ? 'var(--dam-p1)' : 'var(--dam-p2)'
  return (
    <motion.div
      className="nb-piece"
      style={{
        width: `${scale * 100}%`,
        height: `${scale * 100}%`,
        backgroundColor: fill,
        outline: selected ? '3px solid var(--dam-highlight)' : undefined,
        outlineOffset: '2px',
      }}
      animate={justPromoted ? { rotate: [0, -12, 12, 0], scale: [1, 1.25, 1] } : { rotate: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {piece.isKing && <Star className="nb-piece-crown" strokeWidth={3} />}
    </motion.div>
  )
}

/** Solid dots for quiet moves, a bigger pulsing dot for a forced-looking chain. */
export function CellDecor({
  isTarget,
  isCaptureTarget,
  isChainTarget,
  isLastMove,
}: CellDecorProps) {
  return (
    <>
      {isLastMove && <span className="nb-last-move" />}
      {isTarget && !isCaptureTarget && <span className="nb-dot nb-dot-move" />}
      {isCaptureTarget && !isChainTarget && <span className="nb-dot nb-dot-capture" />}
      {isChainTarget && <span className="nb-dot nb-dot-chain" />}
    </>
  )
}

export function BoardFrame({ children }: BoardFrameProps) {
  return <div className="nb-board-frame">{children}</div>
}

/**
 * Outcome is played on the board itself: the frame slams, then the surviving
 * pieces jolt in place. No modal — the result banner is a strip under the board
 * that the GameScreen renders from the same status.
 */
export function EndSequence({ status, survivors, gridSize, viewer }: EndSequenceProps) {
  if (status.kind === 'playing') return null
  const won = status.kind === 'win' && status.winner === viewer
  const drew = status.kind === 'draw'

  return (
    <div className="nb-end-layer" aria-hidden>
      <motion.div
        className={`nb-end-flash ${drew ? 'is-draw' : won ? 'is-win' : 'is-loss'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0] }}
        transition={{ duration: 0.7, times: [0, 0.25, 1] }}
      />
      {survivors.map(({ piece, at }, index) => (
        <motion.span
          key={piece.id}
          className="nb-end-marker"
          style={{
            left: `${((at.col + 0.5) / gridSize) * 100}%`,
            top: `${((at.row + 0.5) / gridSize) * 100}%`,
            backgroundColor: piece.player === 'player1' ? 'var(--dam-p1)' : 'var(--dam-p2)',
          }}
          initial={{ scale: 0, rotate: -20 }}
          animate={
            drew
              ? { scale: [0, 1.1, 0.95], rotate: [0, 8, -8, 0] }
              : won
                ? { scale: [0, 1.4, 1], rotate: [0, 18, -10, 0], y: [0, -14, 0] }
                : { scale: [0, 1, 0.8], rotate: [0, 0, 90], opacity: [1, 1, 0.35] }
          }
          transition={{ duration: 0.9, delay: 0.15 + index * 0.05, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}
