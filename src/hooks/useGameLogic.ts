import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  agreeDraw as engineAgreeDraw,
  applyCall,
  applyMove,
  canCall as engineCanCall,
  createAnalysisState,
  createInitialState,
  declineChain,
  destinationsFor,
  flagTimeout,
  isOffenderSquare,
  resign as engineResign,
} from '../game/engine'
import { toMoveRows } from '../game/notation'
import type {
  Coord,
  EngineResult,
  EngineState,
  GameStatus,
  PieceData,
  PlayerId,
  RuleSettings,
} from '../game/types'
import { useTheme } from '../context/ThemeContext'
import { useBoardAnimations } from './useBoardAnimations'
import { useGameClock } from './useGameClock'
import { useMatchOffers } from './useMatchOffers'
import type { OfferDecision } from './useMatchOffers'

const TIMELINE_CAP = 400

export interface UseGameLogicOptions {
  settings: Partial<RuleSettings>
  /** Which side the local player is looking from; affects "you win" wording. */
  viewer?: PlayerId
  /** Analysis mode starts empty, enforces no outcome, and skips the clock. */
  mode?: 'match' | 'analysis'
  /** Swapped for AI accept/reject logic in a later message. */
  onUndoRequest?: (requester: PlayerId) => OfferDecision
  /**
   * Seed state for resuming a saved match. Read once, when the controller is
   * first created — later changes are ignored on purpose, because the live
   * state is the source of truth from that point on.
   */
  initialState?: EngineState | null
}

/**
 * Orchestrates the pure engine for React: selection, timeline/undo, animation
 * queue, clock and offers. Every rule decision still lives in `src/game` — this
 * file only sequences them, which is why it is a couple of hundred lines rather
 * than the eight hundred the previous version had grown to.
 */
export function useGameLogic(options: UseGameLogicOptions) {
  const { settings, viewer = 'player1', mode = 'match' } = options
  const { theme } = useTheme()

  const settingsKey = JSON.stringify(settings)
  const initial = useMemo(
    () =>
      options.initialState ??
      (mode === 'analysis' ? createAnalysisState(settings) : createInitialState(settings)),
    [settingsKey, mode],
  )

  const [state, setState] = useState<EngineState>(initial)
  const [timeline, setTimeline] = useState<EngineState[]>([initial])
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [selected, setSelected] = useState<Coord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [callPickerOpen, setCallPickerOpen] = useState(false)

  const animations = useBoardAnimations(theme.motion.captureDurationMs)
  const clockStartedRef = useRef(false)

  const clock = useGameClock(state.settings.timeControl, {
    enabled: mode === 'match' && state.status.kind === 'playing',
    onFlag: (player) => {
      setState((prev) => flagTimeout(prev, player).state)
    },
  })

  // Reset everything when the match configuration changes.
  useEffect(() => {
    setState(initial)
    setTimeline([initial])
    setReviewIndex(null)
    setSelected(null)
    setError(null)
    setCallPickerOpen(false)
    animations.reset()
    clock.reset()
    clockStartedRef.current = false
  }, [initial])

  const offers = useMatchOffers({
    canRequestUndo: (requester) => canUndoFor(timeline, requester, state),
    onUndoRequest: options.onUndoRequest,
    onUndoAccepted: (requester) => rollbackTo(requester),
    onDrawAccepted: () => commit(engineAgreeDraw(state)),
  })

  // -- committing engine results --------------------------------------------

  const commit = useCallback(
    (result: EngineResult, opts: { skipTravel?: boolean } = {}) => {
      if (result.error) {
        setError(result.error)
        window.setTimeout(() => setError(null), 2200)
        return false
      }
      const previousPlayer = state.currentPlayer

      // The analysis board runs the same engine but reports no result: you are
      // setting up positions, so "player one has no pieces" is a normal state
      // there rather than a loss.
      const playing: GameStatus = { kind: 'playing' }
      const next: EngineState =
        mode === 'analysis' ? { ...result.state, status: playing } : result.state

      setState(next)
      setTimeline((prev) => [...prev, next].slice(-TIMELINE_CAP))
      setReviewIndex(null)
      animations.ingest(result.events, opts)

      if (mode === 'match' && state.settings.timeControl) {
        if (!clockStartedRef.current) {
          clockStartedRef.current = true
        }
        if (next.currentPlayer !== previousPlayer) {
          clock.handOver(previousPlayer)
          offers.onTurnChanged()
        }
        if (next.status.kind !== 'playing') clock.stop()
      } else if (next.currentPlayer !== previousPlayer) {
        offers.onTurnChanged()
      }
      return true
    },
    [state, mode, animations, clock, offers],
  )

  // -- selection and movement ------------------------------------------------

  const reviewing = reviewIndex !== null
  const viewState = reviewing ? (timeline[reviewIndex] ?? state) : state

  const destinations = useMemo(
    () => (selected && !reviewing ? destinationsFor(state, selected) : { slides: [], captures: [] }),
    [state, selected, reviewing],
  )

  const move = useCallback(
    (from: Coord, to: Coord, origin?: 'drag' | 'tap') => {
      if (reviewing) return
      const result = applyMove(state, from, to)
      // A dragged piece is already where it is going — replaying the travel
      // spring under the pointer reads as a glitch, so drag drops skip it while
      // keeping every capture/call/promotion effect.
      if (commit(result, origin === 'drag' ? { skipTravel: true } : undefined)) {
        // Staying selected mid-chain keeps the continuation targets on screen.
        setSelected(result.state.chain.active ? result.state.chain.at : null)
      }
    },
    [state, commit, reviewing],
  )

  // -- calling ----------------------------------------------------------------

  const call = useCallback(
    (targetPieceId?: string) => {
      if (state.settings.call.scope === 'choose-one' && state.offenders.length > 1 && !targetPieceId) {
        setCallPickerOpen(true)
        return
      }
      setCallPickerOpen(false)
      commit(applyCall(state, targetPieceId), { skipTravel: true })
    },
    [state, commit],
  )

  const tapCell = useCallback(
    (coord: Coord) => {
      if (reviewing) {
        setReviewIndex(null)
        return
      }
      // With the call picker open the offender pieces are live buttons: tap
      // the one you want removed right on the board, instead of using the
      // coordinate list in the prompt.
      if (callPickerOpen) {
        const tapped = state.board[coord.row]?.[coord.col]
        if (tapped && state.offenders.some((o) => o.at.row === coord.row && o.at.col === coord.col)) {
          call(tapped.id)
          return
        }
      }
      const piece = state.board[coord.row]?.[coord.col]

      if (piece && piece.player === state.currentPlayer) {
        setSelected((prev) =>
          prev && prev.row === coord.row && prev.col === coord.col ? null : coord,
        )
        return
      }
      if (selected) {
        move(selected, coord)
        return
      }
      setSelected(null)
    },
    [state, selected, move, reviewing, callPickerOpen, call],
  )

  // -- turn control -----------------------------------------------------------

  const endChain = useCallback(() => {
    if (!state.chain.active) return
    setSelected(null)
    commit(declineChain(state), { skipTravel: true })
  }, [state, commit])

  const resign = useCallback(
    (player: PlayerId) => {
      setSelected(null)
      clock.stop()
      commit(engineResign(state, player), { skipTravel: true })
    },
    [state, commit, clock],
  )

  // -- undo / timeline --------------------------------------------------------

  /**
   * The state an undo by `requester` would roll back to. Exposed so the AI can
   * price an undo request before answering it, and so nothing else has to
   * duplicate the scan `rollbackTo` performs.
   */
  const getUndoTarget = useCallback(
    (requester: PlayerId): EngineState | null => {
      for (let i = timeline.length - 1; i >= 0; i--) {
        const candidate = timeline[i]
        if (candidate === state) continue
        if (candidate.currentPlayer === requester && !candidate.chain.active) return candidate
      }
      return null
    },
    [timeline, state],
  )

  /**
   * Exact ply -> timeline index. The state produced by ply `n` is the first
   * entry holding `n + 1` records, which stays correct even when an action
   * appends a timeline entry without appending a move record (declining a
   * chain edits the previous record in place).
   */
  const plyToTimelineIndex = useCallback(
    (ply: number): number => {
      const wanted = ply + 1
      for (let i = 0; i < timeline.length; i++) {
        if (timeline[i].moves.length >= wanted) return i
      }
      return timeline.length - 1
    },
    [timeline],
  )

  const rollbackTo = useCallback(
    (requester: PlayerId) => {
      for (let i = timeline.length - 1; i >= 0; i--) {
        const candidate = timeline[i]
        if (candidate.currentPlayer === requester && !candidate.chain.active) {
          if (candidate === state) continue
          setState(candidate)
          setTimeline(timeline.slice(0, i + 1))
          setSelected(null)
          setReviewIndex(null)
          animations.reset()
          return
        }
      }
    },
    [timeline, state, animations],
  )

  const goToPly = useCallback(
    (index: number | null) => {
      if (index === null) {
        setReviewIndex(null)
        return
      }
      const clamped = Math.max(0, Math.min(index, timeline.length - 1))
      setReviewIndex(clamped === timeline.length - 1 ? null : clamped)
    },
    [timeline.length],
  )

  const stepBack = useCallback(() => {
    const current = reviewIndex ?? timeline.length - 1
    goToPly(current - 1)
  }, [reviewIndex, timeline.length, goToPly])

  const stepForward = useCallback(() => {
    const current = reviewIndex ?? timeline.length - 1
    goToPly(current + 1)
  }, [reviewIndex, timeline.length, goToPly])

  // -- start the clock on the first interaction -------------------------------

  useEffect(() => {
    if (mode !== 'match') return
    if (!state.settings.timeControl) return
    if (state.moves.length === 0) return
    if (clockStartedRef.current) return
    clockStartedRef.current = true
    clock.start(state.currentPlayer)
  }, [state.moves.length, mode, state.settings.timeControl])

  // -- analysis-only board editing --------------------------------------------

  const setSquare = useCallback((coord: Coord, piece: PieceData | null) => {
    setState((prev) => {
      const board = prev.board.map((row) => row.slice())
      board[coord.row][coord.col] = piece
      const next: EngineState = {
        ...prev,
        board,
        status: { kind: 'playing' },
        offenders: [],
        chain: { active: false, at: null, pendingPromotionPieceId: null, legs: [] },
      }
      setTimeline([next])
      return next
    })
    setReviewIndex(null)
  }, [])

  const setTurn = useCallback((player: PlayerId) => {
    setState((prev) => ({ ...prev, currentPlayer: player, offenders: [], chain: { active: false, at: null, pendingPromotionPieceId: null, legs: [] } }))
    setSelected(null)
  }, [])

  const reset = useCallback(() => {
    setState(initial)
    setTimeline([initial])
    setReviewIndex(null)
    setSelected(null)
    animations.reset()
    clock.reset()
    clockStartedRef.current = false
    offers.reset()
  }, [initial, animations, clock, offers])

  const survivors = useMemo(() => {
    const out: Array<{ piece: PieceData; at: Coord }> = []
    state.board.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell) out.push({ piece: cell, at: { row: r, col: c } })
      }),
    )
    return out
  }, [state.board])

  return {
    // state
    state,
    viewState,
    viewer,
    mode,
    selected,
    destinations,
    error,
    reviewing,
    reviewIndex,
    timelineLength: timeline.length,
    moveRows: useMemo(() => toMoveRows(state.moves), [state.moves]),
    survivors,

    // derived rule queries
    canCall: engineCanCall(state),
    isOffender: (row: number, col: number) => isOffenderSquare(state, row, col),
    callPickerOpen,
    closeCallPicker: () => setCallPickerOpen(false),

    // actions
    tapCell,
    move,
    call,
    endChain,
    resign,
    reset,
    setSelected,

    // offers
    offer: offers.offer,
    requestUndo: offers.requestUndo,
    requestDraw: offers.requestDraw,
    acceptOffer: offers.accept,
    declineOffer: offers.decline,
    canRequestUndo: (requester: PlayerId) =>
      !offers.undoUsedThisTurn && canUndoFor(timeline, requester, state),

    // timeline
    stepBack,
    stepForward,
    goToPly,
    plyToTimelineIndex,
    getUndoTarget,

    // clock
    clock: clock.clock,

    // animation
    animations: animations.animations,
    promotedIds: animations.promotedIds,
    travelDestinations: animations.travelDestinations,
    lastMove: animations.lastMove,
    completeAnimation: animations.complete,

    // analysis
    setSquare,
    setTurn,
  }
}

export type GameController = ReturnType<typeof useGameLogic>

/** Is there an earlier state this player could roll back to? */
function canUndoFor(timeline: EngineState[], requester: PlayerId, current: EngineState): boolean {
  if (current.status.kind !== 'playing') return false
  if (current.chain.active) return false
  for (let i = timeline.length - 1; i >= 0; i--) {
    const candidate = timeline[i]
    if (candidate === current) continue
    if (candidate.currentPlayer === requester && !candidate.chain.active) return true
  }
  return false
}
