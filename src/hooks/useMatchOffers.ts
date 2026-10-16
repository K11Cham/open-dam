import { useCallback, useState } from 'react'
import type { PlayerId } from '../game/types'

export interface Offer {
  requester: PlayerId
  kind: 'undo' | 'draw'
}

export type OfferDecision = 'accept' | 'decline' | 'defer'

/**
 * Undo and draw offers.
 *
 * An undo without a programmatic decider defers to the other player: the
 * request becomes a pending offer and the responder answers it from their own
 * bar (Accept / Refuse). Nothing is decided for them — over-the-board play
 * should feel like two people negotiating, not like the app granting itself
 * rollbacks. Matches against the AI pass `onUndoRequest` and keep their own
 * policy; draw offers always go through the pending-offer path.
 */
export function useMatchOffers(config: {
  onUndoAccepted: (requester: PlayerId) => void
  onDrawAccepted: () => void
  /** Whether the requester may ask at all — the engine decides, not the UI. */
  canRequestUndo: (requester: PlayerId) => boolean
  onUndoRequest?: (requester: PlayerId) => OfferDecision
}) {
  const [offer, setOffer] = useState<Offer | null>(null)
  const [undoUsedThisTurn, setUndoUsedThisTurn] = useState(false)

  const defaultUndoPolicy = useCallback((): OfferDecision => 'defer', [])

  const requestUndo = useCallback(
    (requester: PlayerId) => {
      if (offer || undoUsedThisTurn) return
      if (!config.canRequestUndo(requester)) return

      const decision = (config.onUndoRequest ?? defaultUndoPolicy)(requester)
      setUndoUsedThisTurn(true)

      if (decision === 'accept') {
        config.onUndoAccepted(requester)
        return
      }
      if (decision === 'decline') return
      setOffer({ requester, kind: 'undo' })
    },
    [offer, undoUsedThisTurn, config, defaultUndoPolicy],
  )

  const requestDraw = useCallback(
    (requester: PlayerId) => {
      if (offer) return
      setOffer({ requester, kind: 'draw' })
    },
    [offer],
  )

  const accept = useCallback(() => {
    if (!offer) return
    if (offer.kind === 'undo') config.onUndoAccepted(offer.requester)
    else config.onDrawAccepted()
    setOffer(null)
  }, [offer, config])

  const decline = useCallback(() => setOffer(null), [])

  const onTurnChanged = useCallback(() => setUndoUsedThisTurn(false), [])

  const reset = useCallback(() => {
    setOffer(null)
    setUndoUsedThisTurn(false)
  }, [])

  return { offer, undoUsedThisTurn, requestUndo, requestDraw, accept, decline, onTurnChanged, reset }
}
