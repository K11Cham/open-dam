import { ArrowLeftRight, History } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { opponentOf } from '../../game/board'
import type { PlayerId } from '../../game/types'
import type { MatchController } from '../../hooks/useMatchController'
import { useNow } from '../../hooks/useNow'
import { timeControlLabel } from '../../lib/describe'
import BoardView from '../board/BoardView'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import MoveList from './MoveList'
import PlayerCard from './PlayerCard'
import ResultDialog from './ResultDialog'
import StatusPanel from './StatusPanel'

interface MatchScreenProps {
  controller: MatchController
  /** Sides operated from this device. */
  localSeats: PlayerId[]
  /** The side this device plays, or null in hot seat (both sides local). */
  perspective: PlayerId | null
  thinkingSeat: PlayerId | null
  onRematch?: () => void
  onNewGame: () => void
  /** Extra content above the status panel, e.g. an online invite. */
  aside?: ReactNode
}

const RESULT_DELAY_MS = 900

/**
 * The match layout. Desktop: board column with a player card above and below,
 * and a side column for status, moves and game info. Phones: the same blocks
 * stacked, with the page scrolling normally so nothing is ever clipped.
 */
export default function MatchScreen({
  controller,
  localSeats,
  perspective,
  thinkingSeat,
  onRematch,
  onNewGame,
  aside,
}: MatchScreenProps) {
  const [flipped, setFlipped] = useState(false)
  const [resignFor, setResignFor] = useState<PlayerId | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const { position, state, viewPosition, over, names, toMove } = controller
  const now = useNow(!!state.clock?.running && !state.clock.paused && !over)

  // The side this device plays sits at the bottom; hot seat starts with Red there.
  const baseBottom: PlayerId = perspective ?? 'player1'
  const bottom = flipped ? opponentOf(baseBottom) : baseBottom
  const top = opponentOf(bottom)

  // Open the summary shortly after the game ends, once the board has played its own end animation.
  useEffect(() => {
    if (!over) return
    const handle = window.setTimeout(() => setResultOpen(true), RESULT_DELAY_MS)
    return () => {
      window.clearTimeout(handle)
      setResultOpen(false)
    }
  }, [over])

  const card = (player: PlayerId, place: 'top' | 'bottom') => (
    <PlayerCard
      controller={controller}
      player={player}
      local={localSeats.includes(player)}
      isYou={perspective === player}
      thinking={thinkingSeat === player || (!over && toMove === player && controller.seats[player].kind === 'ai')}
      now={now}
      onResign={setResignFor}
      position={place}
    />
  )

  const boardLabel = `Board, ${position.settings.boardSize} by ${position.settings.boardSize}. ${
    over ? 'Game over.' : `${names[toMove]} to move.`
  }${controller.reviewing ? ' Showing an earlier position.' : ''}`

  return (
    <div className="match">
      <div className="match__board-col">
        {card(top, 'top')}

        {controller.reviewing && (
          <div className="review-bar" role="status">
            <History size={16} aria-hidden />
            <span>
              Viewing position {controller.viewIndex} of {controller.lastIndex}
            </span>
            <Button size="sm" variant="primary" onClick={() => controller.goTo(null)}>
              Back to the game
            </Button>
          </div>
        )}

        <div className="match__board">
          <BoardView
            position={viewPosition}
            orientation={bottom}
            selected={controller.selected}
            destinations={controller.destinations}
            offenderIds={controller.offenderIds}
            animations={controller.reviewing ? [] : controller.animations}
            promotedIds={controller.promotedIds}
            lastMove={controller.lastMove}
            onAnimationComplete={controller.completeAnimation}
            interactive={controller.canAct}
            canDragFrom={controller.canDragFrom}
            onSquare={controller.onSquare}
            onDrop={controller.onDrop}
            onEscape={controller.onEscape}
            perspective={perspective}
            sideNames={names}
            label={boardLabel}
            hideEndSequence={controller.reviewing}
          />
        </div>

        {card(bottom, 'bottom')}
      </div>

      <div className="match__side">
        {aside}
        <StatusPanel
          controller={controller}
          localSeats={localSeats}
          perspective={perspective}
          thinkingSeat={thinkingSeat}
          onRematch={onRematch}
          onNewGame={onNewGame}
        />
        <MoveList controller={controller} />
        <section className="game-info" aria-label="Game settings">
          <dl className="game-info__list">
            <div>
              <dt>Board</dt>
              <dd>
                {position.settings.boardSize}×{position.settings.boardSize}
              </dd>
            </div>
            <div>
              <dt>Clock</dt>
              <dd>{timeControlLabel(position.settings)}</dd>
            </div>
            <div>
              <dt>Calling</dt>
              <dd>{position.settings.call.scope === 'all' ? 'Takes every offender' : 'Takes one offender'}</dd>
            </div>
          </dl>
          <Button size="sm" variant="ghost" icon={<ArrowLeftRight size={15} />} onClick={() => setFlipped((v) => !v)}>
            Flip board
          </Button>
        </section>
      </div>

      {/* Moves are announced for screen-reader users. */}
      <p className="visually-hidden" aria-live="polite">
        {controller.announcement}
      </p>

      <ConfirmDialog
        open={resignFor !== null}
        title="Resign this game?"
        description={
          resignFor && localSeats.length > 1
            ? `${names[resignFor]} gives up and ${names[opponentOf(resignFor)]} wins. This cannot be undone.`
            : 'Your opponent wins. This cannot be undone.'
        }
        confirmLabel="Resign"
        tone="danger"
        onCancel={() => setResignFor(null)}
        onConfirm={() => {
          if (resignFor) controller.resign(resignFor)
          setResignFor(null)
        }}
      />

      <ResultDialog
        open={resultOpen && !controller.reviewing}
        onClose={() => setResultOpen(false)}
        controller={controller}
        perspective={perspective}
        onRematch={onRematch}
        onNewGame={onNewGame}
      />
    </div>
  )
}
