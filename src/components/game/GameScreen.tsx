import { AnimatePresence, motion } from 'framer-motion'
import { Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { GameStatus, PlayerId } from '../../game/types'
import type { GameController } from '../../hooks/useGameLogic'
import BoardView from '../board/BoardView'
import Button from '../ui/Button'
import CallPicker from './CallPicker'
import GameOverModal from './GameOverModal'
import MoveHistory from './MoveHistory'
import PlayerBar from './PlayerBar'

interface GameScreenProps {
  controller: GameController
  onNewGame: () => void
  onRematch: () => void
  /** Display names per side; defaults to Red / Blue. */
  playerNames?: Partial<Record<PlayerId, string>>
  /** Sides a human is operating. An AI side gets no action buttons. */
  humanSides?: PlayerId[]
  /** The side currently searching, if any. */
  thinking?: PlayerId | null
}

/**
 * Match layout. The board is always drawn from player one's side; there is no
 * flip for a player-two viewer yet, which is fine for hot-seat play and is
 * noted as a gap for when online play arrives.
 *
 * When the game concludes, an animated chess.com-style outcome modal pops up
 * with celebrations, stats, and rematch/new-game/review actions.
 */
export default function GameScreen({
  controller,
  onNewGame,
  onRematch,
  playerNames,
  humanSides = ['player1', 'player2'],
  thinking = null,
}: GameScreenProps) {
  const { state, viewState, viewer } = controller
  const gameOver = state.status.kind !== 'playing'
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    if (gameOver) {
      const timer = window.setTimeout(() => setModalOpen(true), 500)
      return () => window.clearTimeout(timer)
    } else {
      setModalOpen(false)
    }
  }, [gameOver])

  // The human always sits at the bottom of the board.
  const flipped = viewer === 'player2'
  const top: PlayerId = flipped ? 'player1' : 'player2'
  const bottom: PlayerId = flipped ? 'player2' : 'player1'
  const nameOf = (player: PlayerId) =>
    playerNames?.[player] ?? (player === 'player1' ? 'Red' : 'Blue')

  return (
    <div className="dam-match">
      <div className="dam-board-column">
        <div className="dam-board-stack">
          <PlayerBar
            controller={controller}
            player={top}
            name={nameOf(top)}
            controllable={humanSides.includes(top)}
            thinking={thinking === top}
          />

          <div style={{ width: '100%', aspectRatio: '1 / 1', position: 'relative' }}>
            <BoardView
              state={state}
              viewState={viewState}
              viewer={viewer}
              selected={controller.selected}
              destinations={controller.destinations}
              animations={controller.animations}
              promotedIds={controller.promotedIds}
              travelDestinations={controller.travelDestinations}
              lastMove={controller.lastMove}
              isOffender={controller.isOffender}
              onTap={controller.tapCell}
              onMove={controller.move}
              interactive={!gameOver && !controller.reviewing}
              flipped={flipped}
              onAnimationComplete={controller.completeAnimation}
            />
          </div>

          <PlayerBar
            controller={controller}
            player={bottom}
            name={nameOf(bottom)}
            controllable={humanSides.includes(bottom)}
            thinking={thinking === bottom}
          />

          <CallPicker controller={controller} />

          <AnimatePresence>
            {controller.reviewing && (
              <motion.div
                className="dam-inline-prompt"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
              >
                <span>Reviewing an earlier position — the board is read-only.</span>
                <Button size="small" onClick={() => controller.goToPly(null)}>
                  Back to live
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {gameOver && (
              <motion.div
                className="dam-result-strip"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.3 }}
              >
                <span>{describeOutcome(state.status, viewer)}</span>
                <Button size="small" onClick={() => setModalOpen(true)}>
                  <Trophy size={13} />
                  Summary
                </Button>
                <Button size="small" variant="primary" onClick={onRematch}>
                  Rematch
                </Button>
                <Button size="small" onClick={onNewGame}>
                  New game
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <MoveHistory controller={controller} />

      <GameOverModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onRematch={onRematch}
        onNewGame={onNewGame}
        state={state}
        viewer={viewer}
        playerNames={playerNames}
        humanSides={humanSides}
      />

      <AnimatePresence>
        {controller.error && (
          <motion.div
            className="dam-toast"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {controller.error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function describeOutcome(status: GameStatus, viewer: PlayerId): string {
  if (status.kind === 'playing') return ''
  if (status.kind === 'draw') {
    const reasons: Record<string, string> = {
      'one-each-stalemate': 'Tie — one piece each and nothing left to play',
      threefold: 'Tie — threefold repetition',
      'no-captures': 'Tie — 25 moves each without a capture',
      agreement: 'Tie — agreed',
    }
    return reasons[status.reason] ?? 'Tie'
  }
  const name = status.winner === 'player1' ? 'Red' : 'Blue'
  const suffix =
    status.reason === 'resignation'
      ? ' by resignation'
      : status.reason === 'timeout'
        ? ' on time'
        : ''
  const you = status.winner === viewer ? 'You win' : `${name} wins`
  return `${you}${suffix}`
}
