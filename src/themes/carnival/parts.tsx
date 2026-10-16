import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type {
  BoardFrameProps,
  CellDecorProps,
  EndSequenceProps,
  PieceViewProps,
} from '../types'

/**
 * Drawn character rather than a styled div: body, highlight, eyes, mouth, and
 * for kings an actual crown shape. Kings bob gently so they are readable at a
 * glance without relying on colour.
 */
export function Piece({ piece, scale = 0.8, selected, offender, justPromoted }: PieceViewProps) {
  const isP1 = piece.player === 'player1'
  const body = isP1 ? 'var(--dam-p1)' : 'var(--dam-p2)'
  const edge = isP1 ? 'var(--dam-p1-edge)' : 'var(--dam-p2-edge)'

  return (
    <motion.div
      className={`cv-piece ${selected ? 'is-selected' : ''} ${offender ? 'is-offender' : ''}`}
      style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
      animate={
        justPromoted
          ? { rotate: [0, -14, 14, -6, 0], y: [0, -10, 0] }
          : piece.isKing
            ? { y: [0, -2.5, 0] }
            : { y: 0, rotate: 0 }
      }
      transition={
        justPromoted
          ? { duration: 0.7, ease: 'easeOut' }
          : piece.isKing
            ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.2 }
      }
    >
      <svg viewBox="0 0 48 48" className="cv-piece-svg" role="img" aria-label={isP1 ? 'Red piece' : 'Blue piece'}>
        <ellipse cx="24" cy="42" rx="15" ry="3.5" className="cv-piece-shade" />
        <circle cx="24" cy="24" r="19" fill={edge} />
        <circle cx="24" cy="22" r="18" fill={body} />
        <ellipse cx="17" cy="15" rx="6.5" ry="4.5" fill="#FFFFFF" opacity="0.28" />
        <circle cx="18" cy="23" r="2.6" fill="#1B1033" />
        <circle cx="30" cy="23" r="2.6" fill="#1B1033" />
        <circle cx="18.9" cy="22.2" r="0.9" fill="#FFFFFF" />
        <circle cx="30.9" cy="22.2" r="0.9" fill="#FFFFFF" />
        <path
          d="M18 29.5c1.8 2.4 4 3.6 6 3.6s4.2-1.2 6-3.6"
          stroke="#1B1033"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        {piece.isKing && (
          <g className="cv-piece-crown">
            <path
              d="M12.5 10.5 16 4.5l5 4.5 3-6 3 6 5-4.5 3.5 6z"
              fill="var(--dam-crown)"
              stroke="#8A5A00"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="2.6" r="1.8" fill="#FFF3E0" stroke="#8A5A00" strokeWidth="1" />
          </g>
        )}
      </svg>
    </motion.div>
  )
}

export function CellDecor({
  isTarget,
  isCaptureTarget,
  isChainTarget,
  isSelected,
  isLastMove,
}: CellDecorProps) {
  return (
    <>
      {isLastMove && <span className="cv-last-move" />}
      {isSelected && <span className="cv-selected-glow" />}
      {isTarget && !isCaptureTarget && <span className="cv-blob" />}
      {isCaptureTarget && !isChainTarget && <span className="cv-spark" />}
      {isChainTarget && <span className="cv-spark is-chain" />}
    </>
  )
}

export function BoardFrame({ children }: BoardFrameProps) {
  return (
    <div className="cv-board-frame">
      <span className="cv-board-bunting" aria-hidden />
      {children}
    </div>
  )
}

/** Deterministic pseudo-random so confetti does not re-roll on every render. */
const seeded = (seed: number) => {
  let value = seed * 9301 + 49297
  return () => {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

/**
 * Winner's pieces launch confetti and jump; the loser's pieces spin down and
 * shrink; a tie has everything bow toward the middle. All on the board.
 */
export function EndSequence({ status, survivors, gridSize, viewer }: EndSequenceProps) {
  const confetti = useMemo(() => {
    const rand = seeded(survivors.length + gridSize + 7)
    return Array.from({ length: 26 }, (_, i) => ({
      id: i,
      left: rand() * 100,
      delay: rand() * 0.5,
      drift: (rand() - 0.5) * 60,
      rotate: rand() * 720 - 360,
      hue: ['var(--dam-accent)', 'var(--dam-p1)', 'var(--dam-p2)', 'var(--dam-success)'][i % 4],
    }))
  }, [survivors.length, gridSize])

  if (status.kind === 'playing') return null
  const drew = status.kind === 'draw'
  const winner = status.kind === 'win' ? status.winner : null
  const viewerWon = winner === viewer

  return (
    <div className="cv-end-layer" aria-hidden>
      {(viewerWon || drew) &&
        confetti.map((bit) => (
          <motion.span
            key={bit.id}
            className="cv-confetti"
            style={{ left: `${bit.left}%`, backgroundColor: bit.hue }}
            initial={{ y: '-10%', opacity: 0, rotate: 0 }}
            animate={{ y: '110%', x: bit.drift, opacity: [0, 1, 1, 0], rotate: bit.rotate }}
            transition={{ duration: 2.2, delay: bit.delay, ease: 'easeIn' }}
          />
        ))}

      {survivors.map(({ piece, at }, index) => {
        const isWinnerPiece = winner !== null && piece.player === winner
        return (
          <motion.span
            key={piece.id}
            className={`cv-end-halo ${isWinnerPiece ? 'is-winner' : ''}`}
            style={{
              left: `${((at.col + 0.5) / gridSize) * 100}%`,
              top: `${((at.row + 0.5) / gridSize) * 100}%`,
              borderColor: piece.player === 'player1' ? 'var(--dam-p1)' : 'var(--dam-p2)',
            }}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={
              drew
                ? { scale: [0.3, 1.5, 1.2], opacity: [0, 0.7, 0], rotate: [0, 12, -12, 0] }
                : isWinnerPiece
                  ? { scale: [0.3, 2.2, 1.6], opacity: [0, 0.9, 0] }
                  : { scale: [0.3, 0.9, 0.2], opacity: [0, 0.6, 0], rotate: [0, 180] }
            }
            transition={{ duration: 1.5, delay: 0.1 + index * 0.07, ease: 'easeOut' }}
          />
        )
      })}
    </div>
  )
}
