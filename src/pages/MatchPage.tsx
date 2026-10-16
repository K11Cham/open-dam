import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DIFFICULTIES, isDifficultyId } from '../ai/difficulty'
import { decideUndoRequest } from '../ai/opponent'
import GameScreen from '../components/game/GameScreen'
import AppShell from '../components/layout/AppShell'
import { opponentOf } from '../game/board'
import type { EngineState, PlayerId } from '../game/types'
import { useAIOpponent } from '../hooks/useAIOpponent'
import { useGameLogic } from '../hooks/useGameLogic'
import type { OfferDecision } from '../hooks/useMatchOffers'
import { STORAGE_KEYS, storage } from '../services/storage'
import { paramsToSettings, settingsToParams } from './matchParams'

/**
 * A live match, hot-seat or against the computer.
 *
 * `?ai=<tier>` turns the opposing side into the engine and `?side=` picks which
 * colour the human takes. The rules themselves are unchanged either way — the
 * AI plays through the same controller actions a human does, including calling
 * and declining chains, so nothing about the position depends on who is moving.
 */
export default function MatchPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const settings = useMemo(() => paramsToSettings(params), [params.toString()])

  const humanSide: PlayerId = params.get('side') === 'player2' ? 'player2' : 'player1'
  const tierId = params.get('ai')
  const difficulty = isDifficultyId(tierId) ? DIFFICULTIES[tierId] : null
  const aiSide = opponentOf(humanSide)

  // Only restore if the saved game was played under these exact rules.
  const [seed] = useState<EngineState | null>(() => {
    const saved = storage.get<EngineState>(STORAGE_KEYS.resumeMatch)
    if (!saved) return null
    const sameRules =
      settingsToParams(saved.settings).toString() === settingsToParams(settings).toString()
    return sameRules && saved.status.kind === 'playing' ? saved : null
  })

  /**
   * The undo decider needs the controller, and the controller needs the
   * decider, so it goes through a ref. The callback only ever fires from a
   * click, long after the effect below has filled the box in.
   */
  const undoDecider = useRef<(requester: PlayerId) => OfferDecision>(() => 'defer')

  const controller = useGameLogic({
    settings,
    viewer: humanSide,
    initialState: seed,
    onUndoRequest: (requester) => undoDecider.current(requester),
  })

  useEffect(() => {
    undoDecider.current = (requester: PlayerId): OfferDecision => {
      // Hot-seat (OTB): hand the decision to the other player. The request
      // becomes a pending offer they accept or refuse from their own bar —
      // undoing is a negotiation, not an app-granted rollback.
      if (!difficulty) return 'defer'
      if (requester === aiSide) return 'accept'
      return decideUndoRequest({
        difficulty,
        aiSide,
        current: controller.state,
        target: controller.getUndoTarget(requester),
      })
    }
  })

  const { thinking } = useAIOpponent({
    controller,
    aiSide,
    difficulty: difficulty ?? DIFFICULTIES.club,
    enabled: difficulty !== null,
  })

  useEffect(() => {
    if (controller.state.moves.length === 0) return
    if (controller.state.status.kind === 'playing') {
      storage.set(STORAGE_KEYS.resumeMatch, controller.state)
    } else {
      storage.remove(STORAGE_KEYS.resumeMatch)
    }
  }, [controller.state])

  const playerNames: Partial<Record<PlayerId, string>> = difficulty
    ? {
        [humanSide]: 'You',
        [aiSide]: `${difficulty.name} (${difficulty.elo})`,
      }
    : {}

  return (
    <AppShell fill showNewGame={false}>
      <GameScreen
        controller={controller}
        playerNames={playerNames}
        humanSides={difficulty ? [humanSide] : ['player1', 'player2']}
        thinking={thinking ? aiSide : null}
        onRematch={() => {
          storage.remove(STORAGE_KEYS.resumeMatch)
          controller.reset()
        }}
        onNewGame={() => {
          storage.remove(STORAGE_KEYS.resumeMatch)
          navigate('/play')
        }}
      />
    </AppShell>
  )
}
