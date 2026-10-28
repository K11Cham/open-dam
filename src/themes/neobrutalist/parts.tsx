import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import type { BoardFrameProps, CellDecorProps, EndSequenceProps, PieceViewProps } from '../types'

/**
 * Flat disc, thick outline, hard offset shadow. Blue carries an inner ring so
 * the two sides differ in shape, not only colour. Kings wear a star.
 */
export function Piece({ piece, scale = 0.74, selected, offender, justPromoted }: PieceViewProps) {
  const isP1 = piece.player === 'player1'
  return (
    <motion.div
      className={['nb-piece', isP1 ? 'is-p1' : 'is-p2', selected && 'is-selected', offender && 'is-offender']
        .filter(Boolean)
        .join(' ')}
      style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
      animate={justPromoted ? { rotate: [0, -12, 12, 0], scale: [1, 1.22, 1] } : { rotate: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {!isP1 && <span className="nb-piece-ring" />}
      {piece.isKing && <Star className="nb-piece-crown" strokeWidth={3} aria-hidden />}
    </motion.div>
  )
}

/** Solid dots for quiet moves, a red ring for captures, a throbbing dot for chain continuations. */
export function CellDecor({ isTarget, isCaptureTarget, isChainTarget, isLastMove, isSelected }: CellDecorProps) {
  return (
    <>
      {isLastMove && <span className="nb-last-move" />}
      {isSelected && <span className="nb-selected" />}
      {isTarget && !isCaptureTarget && <span className="nb-dot nb-dot-move" />}
      {isCaptureTarget && !isChainTarget && <span className="nb-dot nb-dot-capture" />}
      {isChainTarget && <span className="nb-dot nb-dot-chain" />}
    </>
  )
}

export function BoardFrame({ children }: BoardFrameProps) {
  return <div className="nb-board-frame">{children}</div>
}

/** The board flashes, then the surviving pieces jolt in place. */
export function EndSequence({ status, survivors, gridSize, perspective }: EndSequenceProps) {
  if (status.kind === 'playing') return null
  const drew = status.kind === 'draw'
  const won = status.kind === 'win' && (perspective === null || status.winner === perspective)

  return (
    <div className="nb-end-layer" aria-hidden>
      <motion.div
        className={`nb-end-flash ${drew ? 'is-draw' : won ? 'is-win' : 'is-loss'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.85, 0] }}
        transition={{ duration: 0.7, times: [0, 0.25, 1] }}
      />
      {survivors.map(({ piece, at }, index) => {
        const isWinner = status.kind === 'win' && piece.player === status.winner
        return (
          <motion.span
            key={piece.id}
            className={`nb-end-marker ${piece.player === 'player1' ? 'is-p1' : 'is-p2'}`}
            style={{ left: `${((at.col + 0.5) / gridSize) * 100}%`, top: `${((at.row + 0.5) / gridSize) * 100}%` }}
            initial={{ scale: 0, rotate: -20 }}
            animate={
              drew
                ? { scale: [0, 1.1, 0.95], rotate: [0, 8, -8, 0] }
                : isWinner
                  ? { scale: [0, 1.4, 1], rotate: [0, 18, -10, 0], y: [0, -14, 0] }
                  : { scale: [0, 1, 0.8], rotate: [0, 0, 90], opacity: [1, 1, 0.35] }
            }
            transition={{ duration: 0.9, delay: 0.15 + index * 0.05, ease: 'easeOut' }}
          />
        )
      })}
    </div>
  )
}
