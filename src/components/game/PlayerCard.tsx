import { Flag, Handshake, Loader2, Undo2 } from 'lucide-react'
import { useThemeParts } from '../../context/useTheme'
import { countPieces } from '../../game/board'
import type { PlayerId } from '../../game/types'
import type { MatchController } from '../../hooks/useMatchController'
import { countOf, signedChange } from '../../lib/describe'
import { undoTargetIndex } from '../../match/reducer'
import { Button } from '../ui/Button'
import ClockDisplay from './ClockDisplay'

interface PlayerCardProps {
  controller: MatchController
  player: PlayerId
  /** Is this side operated from this device? Only then are its actions shown. */
  local: boolean
  /** Shown as "You" instead of the side name. */
  isYou: boolean
  thinking: boolean
  now: number
  onResign: (player: PlayerId) => void
  position: 'top' | 'bottom'
}

/**
 * One side of the table: who it is, whether it is their turn, pieces left,
 * their clock, and — for sides played on this device — the take-back, draw
 * and resign buttons, each labelled.
 */
export default function PlayerCard({ controller, player, local, isYou, thinking, now, onResign, position }: PlayerCardProps) {
  const { Piece } = useThemeParts()
  const { state, names, over, toMove } = controller
  const offer = state.offer
  const canOffer = !over && !offer && controller.snapshot.connection !== 'disconnected'
  const isTurn = !over && toMove === player
  const pieces = countPieces(state.position.board, player)
  const kings = state.position.board.flat().filter((p) => p?.player === player && p.isKing).length
  const undoReady =
    canOffer && !state.undoAskedThisTurn[player] && !state.position.chain.active && undoTargetIndex(state, player) !== null
  const drawReady = canOffer && !state.drawOfferedThisTurn[player]
  // Online, the server says who is signed in at this seat, and their rating in rated games.
  const account = controller.snapshot.accounts?.[player] ?? null

  return (
    <section
      className={['player-card', `is-${position}`, isTurn && 'is-turn'].filter(Boolean).join(' ')}
      aria-label={`${names[player]}${isYou ? ' (you)' : ''}`}
    >
      <div className="player-card__id">
        <span className="player-card__token" aria-hidden>
          <Piece piece={{ id: `token-${player}`, player, isKing: false }} scale={1} />
        </span>
        <span className="player-card__who">
          <span className="player-card__name">{isYou ? 'You' : names[player]}</span>
          <span className="player-card__meta">
            {account?.rating !== undefined && (
              <span className="player-card__rating">
                {account.rating}
                {account.change !== undefined && (
                  <span className={account.change >= 0 ? 'is-up' : 'is-down'}> {signedChange(account.change)}</span>
                )}
                <span className="visually-hidden"> rating</span>
                {' · '}
              </span>
            )}
            {isYou ? `${names[player]} · ` : ''}
            {countOf(pieces, 'piece')}
            {kings > 0 ? `, ${kings} ${kings === 1 ? 'king' : 'kings'}` : ''}
          </span>
        </span>
        {thinking ? (
          <span className="tag tag--live">
            <Loader2 size={12} className="spin" aria-hidden /> Thinking
          </span>
        ) : (
          isTurn && <span className="tag tag--turn">{state.position.chain.active ? 'Capturing' : 'To move'}</span>
        )}
        {offer && offer.by === player && (
          <span className="tag">{offer.kind === 'undo' ? 'Asked to undo' : 'Offered a draw'}</span>
        )}
      </div>

      {state.clock && <ClockDisplay clock={state.clock} player={player} now={now} name={names[player]} />}

      {local && !over && (
        <div className="player-card__actions">
          <Button
            size="sm"
            variant="ghost"
            icon={<Undo2 size={15} />}
            disabled={!undoReady}
            onClick={() => controller.offer(player, 'undo')}
          >
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Handshake size={15} />}
            disabled={!drawReady}
            onClick={() => controller.offer(player, 'draw')}
          >
            Draw
          </Button>
          <Button size="sm" variant="ghost" icon={<Flag size={15} />} onClick={() => onResign(player)}>
            Resign
          </Button>
        </div>
      )}
    </section>
  )
}
