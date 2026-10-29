import { motion } from 'framer-motion'
import type { BoardFrameProps, CellDecorProps, EndSequenceProps, PieceViewProps } from '../types'

/**
 * Solid disc for Black, open ring for White. Kings gain a concentric inner
 * rule rather than an icon — no glyphs anywhere in this theme.
 */
export function Piece({ piece, scale = 0.6, selected, offender, justPromoted }: PieceViewProps) {
  const isP1 = piece.player === 'player1'
  return (
    <motion.div
      className={['at-piece', isP1 ? 'is-p1' : 'is-p2', selected && 'is-selected', offender && 'is-offender']
        .filter(Boolean)
        .join(' ')}
      style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
      animate={justPromoted ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {piece.isKing && <span className="at-piece-crown" />}
    </motion.div>
  )
}

/**
 * Targets are drawn as open rules, not filled dots — a quiet move gets a thin
 * ring, a capture gets a cross, a chain continuation gets a thicker ring.
 */
export function CellDecor({ isTarget, isCaptureTarget, isChainTarget, isSelected, isLastMove }: CellDecorProps) {
  return (
    <>
      {isLastMove && <span className="at-last-move" />}
      {isSelected && <span className="at-selected-frame" />}
      {isTarget && !isCaptureTarget && <span className="at-ring" />}
      {isCaptureTarget && !isChainTarget && <span className="at-cross" />}
      {isChainTarget && <span className="at-ring is-chain" />}
    </>
  )
}

export function BoardFrame({ children }: BoardFrameProps) {
  return <div className="at-board-frame">{children}</div>
}

/**
 * Nothing flashes. The winner's pieces get a slowly expanding rule, the
 * loser's barely register, and a line is ruled under the board.
 */
export function EndSequence({ status, perspective }: EndSequenceProps) {
  if (status.kind === 'playing') return null
  const drew = status.kind === 'draw'
  const winner = status.kind === 'win' ? status.winner : null
  const good = winner !== null && (perspective === null || winner === perspective)

  return (
    <div className="at-end-layer" aria-hidden>
      <motion.span
        className={`at-end-rule ${drew ? 'is-draw' : good ? 'is-good' : 'is-bad'}`}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}
