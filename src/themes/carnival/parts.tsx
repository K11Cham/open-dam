import { motion, useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'
import type { BoardFrameProps, CellDecorProps, EndSequenceProps, PieceViewProps } from '../types'

/**
 * Painted festival tokens, like the wooden counters and bottle caps the game
 * is often played with. The two sides differ in outline as well as colour, so
 * they stay distinct for colour-blind players and in greyscale: Coral has a
 * scalloped bottle-cap edge with a sun at its centre, Sky is smooth-edged with
 * a ring of beads. A king is two tokens stacked, the oldest draughts sign for
 * a crowned piece, with a gold rim and star on top.
 */
export function Piece({ piece, scale = 0.84, selected, offender, justPromoted }: PieceViewProps) {
  const isP1 = piece.player === 'player1'
  const body = isP1 ? 'var(--dam-p1)' : 'var(--dam-p2)'
  const edge = isP1 ? 'var(--dam-p1-edge)' : 'var(--dam-p2-edge)'
  // A king's top token sits higher, so the one beneath shows.
  const top = piece.isKing ? 20 : 23

  return (
    <motion.div
      className={['cv-piece', selected && 'is-selected', offender && 'is-offender'].filter(Boolean).join(' ')}
      style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
      initial={false}
      animate={justPromoted ? { y: [-12, 0, -3, 0], scale: [1.12, 1, 1.03, 1] } : { y: 0, scale: 1 }}
      transition={justPromoted ? { duration: 0.6, ease: 'easeOut' } : { duration: 0.2 }}
    >
      <svg viewBox="0 0 48 48" className="cv-piece-svg" aria-hidden focusable="false">
        <ellipse cx="24" cy="43" rx="16" ry="3.5" className="cv-piece-shade" />
        {piece.isKing && <TokenOutline isP1={isP1} cy={29} fill={edge} />}
        {piece.isKing && <TokenOutline isP1={isP1} cy={27} fill={body} />}
        <TokenOutline isP1={isP1} cy={top + 2.5} fill={edge} />
        <TokenOutline isP1={isP1} cy={top} fill={body} />
        {piece.isKing && <circle cx="24" cy={top} r="15.2" fill="none" stroke="var(--dam-crown)" strokeWidth="2.2" />}
        {isP1 ? <SunMotif cy={top} king={piece.isKing} /> : <BeadMotif cy={top} king={piece.isKing} />}
        {piece.isKing && <Star cy={top} />}
      </svg>
    </motion.div>
  )
}

const CREAM = '#FFF4E2'

/** Scalloped bottle-cap outline: sixteen rounded bumps around the rim. */
const scallopPath = (cx: number, cy: number): string => {
  const bumps = 16
  const valley = 17.6
  const peak = 21.4
  const step = (Math.PI * 2) / bumps
  const point = (angle: number, radius: number) =>
    `${(cx + Math.cos(angle) * radius).toFixed(2)} ${(cy + Math.sin(angle) * radius).toFixed(2)}`
  let d = `M${point(0, valley)}`
  for (let i = 0; i < bumps; i++) d += ` Q${point((i + 0.5) * step, peak)} ${point((i + 1) * step, valley)}`
  return `${d}Z`
}

function TokenOutline({ isP1, cy, fill }: { isP1: boolean; cy: number; fill: string }) {
  return isP1 ? <path d={scallopPath(24, cy)} fill={fill} /> : <circle cx="24" cy={cy} r="18.6" fill={fill} />
}

/** Coral: a dashed painted ring and a small sun. */
function SunMotif({ cy, king }: { cy: number; king: boolean }) {
  const rays = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)
  return (
    <g>
      <circle cx="24" cy={cy} r="12.5" fill="none" stroke={CREAM} strokeWidth="1.6" strokeDasharray="3.2 2.6" opacity="0.75" />
      {!king && (
        <>
          {rays.map((angle) => (
            <line
              key={angle}
              x1={24 + Math.cos(angle) * 5.4}
              y1={cy + Math.sin(angle) * 5.4}
              x2={24 + Math.cos(angle) * 8.2}
              y2={cy + Math.sin(angle) * 8.2}
              stroke={CREAM}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          ))}
          <circle cx="24" cy={cy} r="3.6" fill={CREAM} />
        </>
      )}
    </g>
  )
}

/** Sky: a darker inner band with a ring of cream beads. */
function BeadMotif({ cy, king }: { cy: number; king: boolean }) {
  const beads = Array.from({ length: 10 }, (_, i) => (i * Math.PI) / 5)
  return (
    <g>
      <circle cx="24" cy={cy} r="11.5" fill="none" stroke="var(--dam-p2-edge)" strokeWidth="3" opacity="0.55" />
      {beads.map((angle) => (
        <circle key={angle} cx={24 + Math.cos(angle) * 11.5} cy={cy + Math.sin(angle) * 11.5} r="1.55" fill={CREAM} />
      ))}
      {!king && <circle cx="24" cy={cy} r="4.2" fill={CREAM} />}
    </g>
  )
}

/** The king's star, in the theme's gold. */
function Star({ cy }: { cy: number }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const radius = i % 2 === 0 ? 7.2 : 3.1
    return `${(24 + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`
  })
  return <polygon points={points.join(' ')} fill="var(--dam-crown)" stroke="#8A5A00" strokeWidth="1" strokeLinejoin="round" />
}

export function CellDecor({ isTarget, isCaptureTarget, isChainTarget, isSelected, isLastMove }: CellDecorProps) {
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

/** Confetti for a win you care about, or a draw. */
export function EndSequence({ status, gridSize, perspective }: EndSequenceProps) {
  // With reduced motion the confetti could only flash in place, so it is left out.
  const reducedMotion = useReducedMotion()
  const confetti = useMemo(() => {
    const rand = seeded(gridSize + 7)
    return Array.from({ length: 26 }, (_, i) => ({
      id: i,
      left: rand() * 100,
      delay: rand() * 0.5,
      drift: (rand() - 0.5) * 60,
      rotate: rand() * 720 - 360,
      hue: ['var(--dam-accent)', 'var(--dam-p1)', 'var(--dam-p2)', 'var(--dam-success)'][i % 4],
    }))
  }, [gridSize])

  if (status.kind === 'playing') return null
  const drew = status.kind === 'draw'
  const winner = status.kind === 'win' ? status.winner : null
  const celebrate = !reducedMotion && (drew || (winner !== null && (perspective === null || winner === perspective)))

  return (
    <div className="cv-end-layer" aria-hidden>
      {celebrate &&
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
    </div>
  )
}
