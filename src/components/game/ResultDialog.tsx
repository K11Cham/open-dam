import { Eye, Plus, RotateCcw } from 'lucide-react'
import { countPieces } from '../../game/board'
import { formatClock } from '../../game/clock'
import type { PlayerId } from '../../game/types'
import type { MatchController } from '../../hooks/useMatchController'
import { countOf, outcomeReason, outcomeTitle, outcomeTone, signedChange, timeControlLabel } from '../../lib/describe'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

interface ResultDialogProps {
  open: boolean
  onClose: () => void
  controller: MatchController
  perspective: PlayerId | null
  onRematch?: () => void
  onNewGame: () => void
}

/**
 * End-of-game summary. Times come from the match clock, which stops when the
 * game ends, so they match what the player bars show.
 */
export default function ResultDialog({ open, onClose, controller, perspective, onRematch, onNewGame }: ResultDialogProps) {
  const { position, state, names } = controller
  if (position.status.kind === 'playing') return null
  const status = position.status
  const winner = status.kind === 'win' ? status.winner : null
  const turns = position.moves.filter((m) => m.kind === 'move' || m.kind === 'capture').length
  const tone = outcomeTone(status, perspective)
  const accounts = controller.snapshot.accounts

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={outcomeTitle(status, perspective, names)}
      description={outcomeReason(status, position.settings, names, perspective)}
      footer={
        <>
          <Button variant="ghost" icon={<Eye size={16} />} onClick={onClose}>
            See the board
          </Button>
          <Button icon={<Plus size={16} />} onClick={onNewGame}>
            New game
          </Button>
          {onRematch && (
            <Button variant="primary" icon={<RotateCcw size={16} />} onClick={onRematch} data-autofocus>
              Rematch
            </Button>
          )}
        </>
      }
    >
      <div className={`result result--${tone}`}>
        {(['player1', 'player2'] as PlayerId[]).map((player) => (
          <div key={player} className={`result__side ${winner === player ? 'is-winner' : ''}`}>
            <span className="result__name">
              {perspective === player ? 'You' : names[player]}
              {winner === player && <span className="tag tag--turn">Winner</span>}
            </span>
            <span className="result__stat">
              {countOf(countPieces(position.board, player), 'piece')} left
              {state.clock ? ` · ${formatClock(state.clock.remaining[player])} on the clock` : ''}
            </span>
            {accounts?.[player]?.change !== undefined && (
              <span className="result__rating">
                Rating {accounts[player]!.rating} ({signedChange(accounts[player]!.change!)})
              </span>
            )}
          </div>
        ))}
        <p className="result__meta">
          {countOf(turns, 'move')} · {position.settings.boardSize}×{position.settings.boardSize} ·{' '}
          {timeControlLabel(position.settings)}
          {controller.snapshot.rated ? ' · Rated' : ''}
        </p>
      </div>
    </Dialog>
  )
}
