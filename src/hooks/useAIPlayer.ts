import { useEffect, useState } from 'react'
import { searchAsync, searchOptionsFor } from '../ai/client'
import { DIFFICULTIES } from '../ai/difficulty'
import type { DifficultyId } from '../ai/difficulty'
import { decideDrawOffer, decideUndoRequest, thinkingDelay } from '../ai/opponent'
import type { PlayerId } from '../game/types'
import { undoTargetIndex } from '../match/reducer'
import type { MatchSession } from '../match/session'
import { useMatchSession } from './useMatchSession'

const ANSWER_DELAY_MS = 650

/**
 * Plays one seat for the computer. It is just another participant: it reads
 * the session, thinks (in a Web Worker), and submits intents exactly as a
 * person's clicks would. Offers addressed to it are answered first.
 *
 * Returns whether it is thinking, for the "thinking…" indicator.
 */
export function useAIPlayer(session: MatchSession, seat: PlayerId | null, difficultyId: DifficultyId | undefined): boolean {
  const { state } = useMatchSession(session)
  const [thinkingFor, setThinkingFor] = useState<number | null>(null)
  const difficulty = difficultyId ? DIFFICULTIES[difficultyId] : null
  const position = state.position
  const playing = position.status.kind === 'playing'
  const offer = state.offer
  const seq = state.lastSeq

  // Answer an offer from the other side.
  useEffect(() => {
    if (!seat || !difficulty || !offer || offer.by === seat || !playing) return
    const handle = window.setTimeout(() => {
      const live = session.getSnapshot().state
      if (live.lastSeq !== seq) return
      let accept: boolean
      if (offer.kind === 'draw') {
        accept = decideDrawOffer(difficulty, seat, live.position) === 'accept'
      } else {
        const index = undoTargetIndex(live, offer.by)
        accept =
          decideUndoRequest({
            difficulty,
            aiSide: seat,
            current: live.position,
            target: index === null ? null : live.timeline[index],
          }) === 'accept'
      }
      session.submit(seat, { type: 'answer-offer', accept })
    }, ANSWER_DELAY_MS)
    return () => window.clearTimeout(handle)
  }, [seat, difficulty, offer, playing, seq, session])

  // Move when it is our turn and nothing is waiting on us.
  useEffect(() => {
    if (!seat || !difficulty || !playing || position.currentPlayer !== seat || offer) return
    let cancelled = false
    const delay = thinkingDelay(difficulty, Math.random)
    const started = Date.now()
    const show = window.setTimeout(() => setThinkingFor(seq), 0)

    searchAsync(position, searchOptionsFor(difficulty)).then((result) => {
      if (cancelled) return
      // Keep a human-feeling pace even when the search is instant.
      const wait = Math.max(0, delay - (Date.now() - started))
      window.setTimeout(() => {
        if (cancelled) return
        setThinkingFor(null)
        if (session.getSnapshot().state.lastSeq !== seq) return
        if (!result) {
          // No legal action at all. The engine normally ends such games
          // itself; resigning keeps the AI from hanging if it ever does not.
          session.submit(seat, { type: 'engine', action: { type: 'resign', player: seat } })
          return
        }
        session.submit(seat, { type: 'engine', action: result.action })
      }, wait)
    })

    return () => {
      cancelled = true
      window.clearTimeout(show)
      setThinkingFor(null)
    }
  }, [seat, difficulty, playing, position, offer, seq, session])

  return thinkingFor !== null
}
