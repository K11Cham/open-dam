import { motion } from 'framer-motion'
import type {
  BoardFrameProps,
  CellDecorProps,
  EndSequenceProps,
  PieceViewProps,
} from '../types'

/**
 * Solid disc for player one, open ring for player two. Kings gain a concentric
 * inner rule rather than an icon — no glyphs anywhere in this theme.
 */
export function Piece({ piece, scale = 0.62, selected, justPromoted }: PieceViewProps) {
  const isP1 = piece.player === 'player1'
  return (
    <motion.div
      className={`at-piece ${isP1 ? 'is-p1' : 'is-p2'} ${selected ? 'is-selected' : ''}`}
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
 * ring, a capture gets a cross, a chain continuation gets a thicker ring that
 * breathes.
 */
export function CellDecor({
  isTarget,
  isCaptureTarget,
  isChainTarget,
  isSelected,
  isLastMove,
}: CellDecorProps) {
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
 * Nothing flashes. The losing side's pieces are erased one at a time with a
 * short delay between them; the winner's remaining pieces get a single
 * expanding rule. A tie holds both sides at half weight.
 */
export function EndSequence({ status, survivors, gridSize, viewer }: EndSequenceProps) {
  if (status.kind === 'playing') return null
  const drew = status.kind === 'draw'
  const winner = status.kind === 'win' ? status.winner : null
  const viewerWon = winner === viewer

  return (
    <div className="at-end-layer" aria-hidden>
      {survivors.map(({ piece, at }, index) => {
        const isWinnerPiece = winner !== null && piece.player === winner
        return (
          <motion.span
            key={piece.id}
            className={`at-end-ring ${isWinnerPiece ? 'is-winner' : ''}`}
            style={{
              left: `${((at.col + 0.5) / gridSize) * 100}%`,
              top: `${((at.row + 0.5) / gridSize) * 100}%`,
            }}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={
              drew
                ? { scale: [0.2, 1.6], opacity: [0, 0.35, 0] }
                : isWinnerPiece
                  ? { scale: [0.2, 2.6], opacity: [0, 0.55, 0] }
                  : { scale: [0.2, 0.6], opacity: [0, 0.2, 0] }
            }
            transition={{ duration: 1.4, delay: index * 0.09, ease: [0.16, 1, 0.3, 1] }}
          />
        )
      })}
      <motion.span
        className="at-end-rule"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{ backgroundColor: drew ? 'var(--dam-ink-muted)' : viewerWon ? 'var(--dam-ink)' : 'var(--dam-danger)' }}
      />
    </div>
  )
}
