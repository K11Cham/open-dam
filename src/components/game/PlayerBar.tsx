import { Check, Flag, Handshake, Loader2, Megaphone, RotateCcw, SkipForward, X } from 'lucide-react'
import type { PlayerId } from '../../game/types'
import type { GameController } from '../../hooks/useGameLogic'
import GameClockView from './GameClockView'

interface PlayerBarProps {
  controller: GameController
  player: PlayerId
  /** Display name — the AI tier's name when this side is the computer. */
  name: string
  /** False for an AI side: its buttons are hidden, since nobody presses them. */
  controllable: boolean
  thinking?: boolean
}

/**
 * One bar per side: identity, clock, and the actions that side can take right
 * now. Every action is optional by the rules, so nothing here is ever forced —
 * the buttons simply disable when the engine says they are unavailable.
 */
export default function PlayerBar({
  controller,
  player,
  name,
  controllable,
  thinking = false,
}: PlayerBarProps) {
  const { state, offer } = controller
  const isTurn = state.currentPlayer === player && state.status.kind === 'playing'
  const gameOver = state.status.kind !== 'playing'

  const canCall = isTurn && controller.canCall
  const canUndo = !offer && controller.canRequestUndo(player)
  const inChain = isTurn && state.chain.active

  const isResponder = controllable && !!offer && offer.requester !== player

  return (
    <div className={`dam-player-bar ${isTurn ? 'is-active' : ''}`}>
      <div className="dam-player-identity">
        <span
          className="dam-player-dot"
          style={{ background: player === 'player1' ? 'var(--dam-p1)' : 'var(--dam-p2)' }}
        />
        <span className="dam-player-name">{name}</span>
        {thinking ? (
          <span className="dam-tag" style={{ marginLeft: 2 }}>
            <Loader2 size={11} className="dam-spin" />
            thinking
          </span>
        ) : (
          isTurn && (
            <span className="dam-tag" style={{ marginLeft: 2 }}>
              {inChain ? 'chain' : 'to move'}
            </span>
          )
        )}
      </div>

      <GameClockView clock={controller.clock} player={player} />

      <div className="dam-player-actions">
        {isResponder ? (
          <>
            <span className="dam-tag">{offer.kind === 'undo' ? 'Undo?' : 'Draw?'}</span>
            <button
              type="button"
              className="dam-button is-small"
              onClick={controller.acceptOffer}
              aria-label="Accept offer"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              className="dam-button is-small is-danger"
              onClick={controller.declineOffer}
              aria-label="Decline offer"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          controllable && (
            <>
              {inChain && (
                <button
                  type="button"
                  className="dam-button is-small"
                  onClick={controller.endChain}
                  title="Stop the chain here and end your turn"
                >
                  <SkipForward size={14} />
                  End turn
                </button>
              )}
              <button
                type="button"
                className="dam-button is-small"
                disabled={!canCall}
                onClick={() => controller.call()}
                title="Call a capture your opponent passed up"
                aria-label="Call"
              >
                <Megaphone size={14} />
              </button>
              <button
                type="button"
                className="dam-button is-small"
                disabled={!canUndo}
                onClick={() => controller.requestUndo(player)}
                title="Request an undo"
                aria-label="Request undo"
              >
                <RotateCcw size={14} />
              </button>
              <button
                type="button"
                className="dam-button is-small"
                disabled={gameOver || !!offer}
                onClick={() => controller.requestDraw(player)}
                title="Offer a draw"
                aria-label="Offer draw"
              >
                <Handshake size={14} />
              </button>
              <button
                type="button"
                className="dam-button is-small is-danger"
                disabled={gameOver}
                onClick={() => controller.resign(player)}
                title="Resign"
                aria-label="Resign"
              >
                <Flag size={14} />
              </button>
            </>
          )
        )}
      </div>
    </div>
  )
}
