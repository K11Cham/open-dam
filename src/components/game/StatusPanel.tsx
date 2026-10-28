import { Megaphone, Plus, RotateCcw, SkipForward } from 'lucide-react'
import { canCall } from '../../game/engine'
import { coordToNotation } from '../../game/notation'
import { opponentOf } from '../../game/board'
import type { PlayerId } from '../../game/types'
import type { MatchController } from '../../hooks/useMatchController'
import { outcomeReason, outcomeTitle } from '../../lib/describe'
import { Button } from '../ui/Button'

interface StatusPanelProps {
  controller: MatchController
  localSeats: PlayerId[]
  /** The side this device plays (for "You"), or null in hot seat. */
  perspective: PlayerId | null
  thinkingSeat: PlayerId | null
  onRematch?: () => void
  onNewGame: () => void
}

/**
 * The "what now?" panel beside the board: whose turn it is, the decisions only
 * this game has (call a skipped capture, keep capturing or stop), any pending
 * offer, and the result with what to do next.
 */
export default function StatusPanel({
  controller,
  localSeats,
  perspective,
  thinkingSeat,
  onRematch,
  onNewGame,
}: StatusPanelProps) {
  const { position, state, names, over, toMove, canAct, snapshot } = controller
  const offer = state.offer
  const you = (player: PlayerId) => perspective === player
  const nameOf = (player: PlayerId) => (you(player) ? 'You' : names[player])

  if (over) {
    return (
      <section className="status status--result" aria-labelledby="status-title">
        <h2 id="status-title" className="status__title">
          {outcomeTitle(position.status, perspective, names)}
        </h2>
        <p className="status__text">{outcomeReason(position.status, position.settings, names, perspective)}</p>
        <div className="status__actions">
          {onRematch && (
            <Button variant="primary" icon={<RotateCcw size={16} />} onClick={onRematch}>
              Rematch
            </Button>
          )}
          <Button icon={<Plus size={16} />} onClick={onNewGame}>
            New game
          </Button>
        </div>
      </section>
    )
  }

  const remoteWaiting = snapshot.connection === 'waiting-for-opponent'
  const headline = remoteWaiting
    ? 'Waiting for your opponent to join'
    : thinkingSeat === toMove || controller.seats[toMove].kind === 'ai'
      ? `${names[toMove]} is thinking…`
      : you(toMove)
        ? 'Your move'
        : localSeats.includes(toMove)
          ? `${names[toMove]} to move`
          : `Waiting for ${names[toMove]}`

  const callable = canAct && canCall(position)
  const chooseOne = position.settings.call.scope === 'choose-one' && position.offenders.length > 1
  const responder = offer ? opponentOf(offer.by) : null

  return (
    <section className="status" aria-labelledby="status-title">
      <h2 id="status-title" className="status__title">
        {headline}
      </h2>

      {canAct && position.isFirstMove && position.settings.boardType === 'yinyang' && (
        <p className="status__text">Opening move: you may send any of your pieces straight into the empty centre square.</p>
      )}

      {canAct && position.chain.active && (
        <div className="status__block">
          <p className="status__text">You can keep capturing with the same piece, or stop here.</p>
          <Button variant="primary" icon={<SkipForward size={16} />} onClick={controller.endChain}>
            End turn
          </Button>
          {position.settings.call.abandonedChainCallable && (
            <p className="status__hint">Stopping while a capture is still available lets your opponent call this piece.</p>
          )}
        </div>
      )}

      {callable && (
        <div className="status__block status__block--call">
          <p className="status__text">
            <strong>{names[opponentOf(toMove)]} passed up a capture.</strong>{' '}
            {position.settings.call.scope === 'all'
              ? 'Calling it removes every piece that could have captured.'
              : chooseOne
                ? 'Calling it removes one piece of your choice from those that could have captured.'
                : 'Calling it removes the piece that could have captured.'}{' '}
            Calling does not use up your turn.
          </p>
          {chooseOne ? (
            <div className="status__choices" role="group" aria-label="Choose a piece to call">
              {position.offenders.map((o) => (
                <Button key={o.pieceId} size="sm" icon={<Megaphone size={15} />} onClick={() => controller.call(o.pieceId)}>
                  Call {coordToNotation(o.at.row, o.at.col, position.settings.boardSize)}
                </Button>
              ))}
            </div>
          ) : (
            <Button variant="primary" icon={<Megaphone size={16} />} onClick={() => controller.call()}>
              Call it
            </Button>
          )}
          <p className="status__hint">You can also tap a highlighted piece on the board.</p>
        </div>
      )}

      {offer && responder && (
        <div className="status__block status__block--offer" role="group" aria-label="Pending offer">
          <p className="status__text">
            {offer.kind === 'draw' ? `${nameOf(offer.by)} offered a draw.` : `${nameOf(offer.by)} asked to take back a move.`}
          </p>
          <div className="status__actions">
            {localSeats.includes(responder) && (
              <>
                <Button variant="primary" size="sm" onClick={() => controller.answerOffer(responder, true)}>
                  Accept{localSeats.length > 1 ? ` as ${names[responder]}` : ''}
                </Button>
                <Button size="sm" onClick={() => controller.answerOffer(responder, false)}>
                  Decline
                </Button>
              </>
            )}
            {localSeats.includes(offer.by) && (
              <Button size="sm" variant="ghost" onClick={() => controller.cancelOffer(offer.by)}>
                Withdraw
              </Button>
            )}
          </div>
          {!localSeats.includes(responder) && <p className="status__hint">Waiting for {names[responder]} to answer.</p>}
        </div>
      )}
    </section>
  )
}
