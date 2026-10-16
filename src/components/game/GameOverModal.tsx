import { AnimatePresence, motion } from 'framer-motion'
import {
  Clock,
  Eye,
  Plus,
  RotateCcw,
  Scale,
  ShieldAlert,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'
import { useEffect, useMemo } from 'react'
import type { EngineState, PlayerId } from '../../game/types'
import Button from '../ui/Button'

interface GameOverModalProps {
  open: boolean
  onClose: () => void
  onRematch: () => void
  onNewGame: () => void
  state: EngineState
  viewer?: PlayerId
  playerNames?: Partial<Record<PlayerId, string>>
  humanSides?: PlayerId[]
}

const CONFETTI_COLORS = [
  'var(--dam-accent, #ffc73c)',
  'var(--dam-p1, #e0534c)',
  'var(--dam-p2, #3c78d8)',
  '#48bb78',
  '#ed8936',
  '#9f7aea',
  '#f6e05e',
]

export default function GameOverModal({
  open,
  onClose,
  onRematch,
  onNewGame,
  state,
  viewer = 'player1',
  playerNames,
  humanSides = ['player1', 'player2'],
}: GameOverModalProps) {
  const { status, board, moves, settings, clock } = state

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const nameOf = (player: PlayerId) =>
    playerNames?.[player] ?? (player === 'player1' ? 'Red' : 'Blue')

  const pieceCounts = useMemo(() => {
    let p1 = 0
    let p2 = 0
    for (const row of board) {
      for (const cell of row) {
        if (!cell) continue
        if (cell.player === 'player1') p1++
        else p2++
      }
    }
    return { p1, p2 }
  }, [board])

  if (status.kind === 'playing') return null

  const isWin = status.kind === 'win'
  const isDraw = status.kind === 'draw'
  const winner = isWin ? status.winner : null
  const isLocalWinner = isWin && winner === viewer
  const isHotSeat = humanSides.length > 1

  let title = 'Game Over'
  let subtitle = ''
  let badgeColorClass = 'is-draw'

  if (isWin && winner) {
    const winnerName = nameOf(winner)
    if (isHotSeat) {
      title = `${winnerName} Wins!`
      badgeColorClass = winner === 'player1' ? 'is-p1' : 'is-p2'
    } else if (isLocalWinner) {
      title = 'Victory!'
      badgeColorClass = 'is-win'
    } else {
      title = 'Defeat'
      badgeColorClass = 'is-loss'
    }

    switch (status.reason) {
      case 'no-pieces':
        subtitle = 'by elimination — opponent has no pieces left'
        break
      case 'resignation':
        subtitle = `${nameOf(winner === 'player1' ? 'player2' : 'player1')} resigned`
        break
      case 'timeout':
        subtitle = 'on time — clock expired'
        break
      default:
        subtitle = 'by checkmate'
        break
    }
  } else if (isDraw) {
    title = 'Draw'
    badgeColorClass = 'is-draw'
    switch (status.reason) {
      case 'threefold':
        subtitle = 'by threefold repetition of board position'
        break
      case 'no-captures':
        subtitle = 'by 25-move non-capture rule'
        break
      case 'agreement':
        subtitle = 'by mutual agreement'
        break
      case 'one-each-stalemate':
        subtitle = 'by 1v1 king standoff (no captures possible)'
        break
      default:
        subtitle = 'game concluded in a draw'
        break
    }
  }

  const formatClock = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  const showCelebration = isWin && (isLocalWinner || isHotSeat)

  return (
    <AnimatePresence>
      {open && (
        <div className="dam-modal-portal">
          <motion.div
            key="backdrop"
            className="dam-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <div className="dam-modal-wrapper">
            {showCelebration && (
              <div className="dam-confetti-container" aria-hidden="true">
                {Array.from({ length: 28 }).map((_, i) => {
                  const angle = (i / 28) * 360
                  const distance = 140 + (i % 5) * 45
                  const rad = (angle * Math.PI) / 180
                  const x = Math.cos(rad) * distance
                  const y = Math.sin(rad) * distance - 20
                  const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
                  const size = 7 + (i % 4) * 3
                  const isRound = i % 3 === 0

                  return (
                    <motion.span
                      key={i}
                      className="dam-confetti-piece"
                      style={{
                        backgroundColor: color,
                        width: size,
                        height: size,
                        borderRadius: isRound ? '999px' : '2px',
                      }}
                      initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
                      animate={{
                        x,
                        y,
                        scale: [0, 1.3, 0.9],
                        opacity: [1, 1, 0],
                        rotate: [0, (i % 2 === 0 ? 360 : -360) * 1.5],
                      }}
                      transition={{
                        duration: 1.4,
                        delay: 0.1 + (i % 4) * 0.04,
                        ease: [0.18, 0.89, 0.32, 1.2],
                      }}
                    />
                  )
                })}
              </div>
            )}

            <motion.div
              key="modal-card"
              className="dam-game-over-modal"
              initial={{ scale: 0.82, y: 28, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.88, y: 16, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            >
              <button
                type="button"
                className="dam-icon-button dam-modal-close"
                onClick={onClose}
                aria-label="Close summary and view board"
              >
                <X size={16} />
              </button>

              <div className="dam-modal-header">
                <motion.div
                  className={`dam-outcome-badge ${badgeColorClass}`}
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.15 }}
                >
                  {isWin ? (
                    isLocalWinner || isHotSeat ? (
                      <Trophy size={36} strokeWidth={2.4} />
                    ) : (
                      <ShieldAlert size={36} strokeWidth={2.4} />
                    )
                  ) : (
                    <Scale size={36} strokeWidth={2.4} />
                  )}
                </motion.div>

                <motion.h2
                  className="dam-modal-title"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {title}
                </motion.h2>

                <motion.p
                  className="dam-modal-sub"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.28 }}
                >
                  {subtitle}
                </motion.p>
              </div>

              <div className="dam-modal-players">
                <div
                  className={`dam-modal-player-card ${
                    winner === 'player1' ? 'is-winner' : ''
                  }`}
                >
                  <div className="dam-player-identity">
                    <span
                      className="dam-player-dot"
                      style={{ backgroundColor: 'var(--dam-p1)' }}
                    />
                    <span className="dam-modal-player-name">{nameOf('player1')}</span>
                  </div>
                  <div className="dam-modal-player-stats">
                    <span>
                      {pieceCounts.p1} {pieceCounts.p1 === 1 ? 'piece' : 'pieces'}
                    </span>
                    {clock && (
                      <span className="dam-modal-player-time">
                        <Clock size={11} />
                        {formatClock(clock.player1Ms)}
                      </span>
                    )}
                  </div>
                  {winner === 'player1' && (
                    <span className="dam-winner-tag">
                      <Sparkles size={11} /> Winner
                    </span>
                  )}
                </div>

                <span className="dam-modal-vs">VS</span>

                <div
                  className={`dam-modal-player-card ${
                    winner === 'player2' ? 'is-winner' : ''
                  }`}
                >
                  <div className="dam-player-identity">
                    <span
                      className="dam-player-dot"
                      style={{ backgroundColor: 'var(--dam-p2)' }}
                    />
                    <span className="dam-modal-player-name">{nameOf('player2')}</span>
                  </div>
                  <div className="dam-modal-player-stats">
                    <span>
                      {pieceCounts.p2} {pieceCounts.p2 === 1 ? 'piece' : 'pieces'}
                    </span>
                    {clock && (
                      <span className="dam-modal-player-time">
                        <Clock size={11} />
                        {formatClock(clock.player2Ms)}
                      </span>
                    )}
                  </div>
                  {winner === 'player2' && (
                    <span className="dam-winner-tag">
                      <Sparkles size={11} /> Winner
                    </span>
                  )}
                </div>
              </div>

              <div className="dam-modal-meta">
                <span>
                  {moves.length} {moves.length === 1 ? 'ply' : 'plies'} played
                </span>
                <span>•</span>
                <span>
                  {settings.boardSize}×{settings.boardSize} board
                </span>
                {settings.timeControl && (
                  <>
                    <span>•</span>
                    <span>{settings.timeControl.label}</span>
                  </>
                )}
              </div>

              <div className="dam-modal-actions">
                <Button
                  variant="primary"
                  className="dam-modal-btn is-rematch"
                  onClick={onRematch}
                >
                  <RotateCcw size={16} />
                  Rematch
                </Button>
                <Button className="dam-modal-btn" onClick={onNewGame}>
                  <Plus size={16} />
                  New Game
                </Button>
                <Button className="dam-modal-btn is-review" onClick={onClose}>
                  <Eye size={16} />
                  Review Board
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}
