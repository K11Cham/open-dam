import { useEffect, useRef, useState } from 'react'
import type { Difficulty } from '../ai/difficulty'
import { decideDrawOffer, thinkingDelay } from '../ai/opponent'
import { chooseAction } from '../ai/search'
import type { PlayerId } from '../game/types'
import type { GameController } from './useGameLogic'

interface UseAIOpponentOptions {
  controller: GameController
  aiSide: PlayerId
  difficulty: Difficulty
  enabled: boolean
}

/**
 * Drives the AI side of a match.
 *
 * The search is synchronous and runs on the main thread inside a timeout, with
 * a hard time budget per tier so it cannot lock the UI. A Web Worker would be
 * the right long-term home for it — noted as a gap rather than done here,
 * because it needs a build-level change and the budgets keep the worst case
 * to roughly a second and a half at Master.
 *
 * Chain captures need no special handling: a chain leg leaves the AI still on
 * move, the controller state changes, and this effect simply fires again.
 */
export function useAIOpponent({ controller, aiSide, difficulty, enabled }: UseAIOpponentOptions) {
  const [thinking, setThinking] = useState(false)
  const controllerRef = useRef(controller)
  controllerRef.current = controller

  const { state, reviewing, offer } = controller

  // --- moving ---------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return
    if (state.status.kind !== 'playing') return
    if (state.currentPlayer !== aiSide) return
    if (reviewing) return
    if (offer) return

    setThinking(true)
    const delay = thinkingDelay(difficulty, Math.random)

    const handle = window.setTimeout(() => {
      const live = controllerRef.current
      // Guard against the position having moved on while we waited.
      if (live.state !== state) {
        setThinking(false)
        return
      }

      const result = chooseAction(state, {
        depth: difficulty.depth,
        profile: difficulty.profile,
        timeBudgetMs: difficulty.timeBudgetMs,
        quiescenceDepth: difficulty.quiescenceDepth,
        noise: difficulty.noise,
        blunderChance: difficulty.blunderChance,
        random: Math.random,
      })

      setThinking(false)
      if (!result) {
        // No legal action at all — resigning is the honest outcome.
        live.resign(aiSide)
        return
      }

      if (result.action.kind === 'call') live.call(result.action.pieceId)
      else if (result.action.kind === 'end-chain') live.endChain()
      else live.move(result.action.from, result.action.to)
    }, delay)

    return () => {
      window.clearTimeout(handle)
      setThinking(false)
    }
  }, [state, enabled, aiSide, difficulty, reviewing, offer])

  // --- answering a draw offer ----------------------------------------------
  useEffect(() => {
    if (!enabled) return
    if (!offer) return
    if (offer.requester === aiSide) return
    if (offer.kind !== 'draw') return

    const handle = window.setTimeout(() => {
      const live = controllerRef.current
      const decision = decideDrawOffer(difficulty, aiSide, live.state)
      if (decision === 'accept') live.acceptOffer()
      else live.declineOffer()
    }, 700)

    return () => window.clearTimeout(handle)
  }, [offer, enabled, aiSide, difficulty])

  return { thinking }
}
