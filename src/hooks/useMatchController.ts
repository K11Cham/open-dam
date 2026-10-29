import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cueForStep } from '../audio/cues'
import type { SoundCue } from '../audio/types'
import { canCall as engineCanCall, destinationsFor } from '../game/engine'
import type { Destinations } from '../game/engine'
import { toMoveRows } from '../game/notation'
import type { Coord, EngineAction, PlayerId } from '../game/types'
import { flagTime } from '../match/clock'
import type { MatchSession, SessionUpdate } from '../match/session'
import type { OfferKind } from '../match/types'
import { noticeText, seatLabel, spokenMove } from '../lib/describe'
import type { Names } from '../lib/describe'
import { useBoardAnimations } from './useBoardAnimations'
import { useMatchSession } from './useMatchSession'

const NO_DESTINATIONS: Destinations = { slides: [], captures: [] }
const sameSquare = (a: Coord | null, b: Coord | null) => !!a && !!b && a.row === b.row && a.col === b.col

export interface MatchControllerOptions {
  session: MatchSession
  /** Sides operated by people on this device. */
  localSeats: PlayerId[]
  /** True when this device owns the log (local games, the online host): it calls time. */
  authoritative: boolean
  sideNames: Names
  captureDurationMs: number
  /** Where messages for people go (toasts). */
  notify: (message: string, tone?: 'info' | 'error' | 'success') => void
  /** Called with the sound each step (or refusal) should make; the screen decides how it sounds. */
  onCue?: (cue: SoundCue) => void
}

/**
 * Everything the match screen needs, derived from a session: what to draw,
 * what can be clicked, and the actions behind each control. It holds only UI
 * state of its own (selection, review position, the call picker); the game
 * itself lives in the session.
 */
export function useMatchController({
  session,
  localSeats,
  authoritative,
  sideNames,
  captureDurationMs,
  notify,
  onCue,
}: MatchControllerOptions) {
  const animations = useBoardAnimations(captureDurationMs)
  const [selected, setSelected] = useState<Coord | null>(null)
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [callPicking, setCallPicking] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  /** Set while a drag-and-drop move is in flight, so its travel animation is skipped. */
  const dragOrigin = useRef(false)

  const snapshot = useMatchSession(session, (update: SessionUpdate) => {
    if (update.error) {
      notify(update.error, 'error')
      onCue?.('illegal')
    }
    if (!update.step) return
    const { action, events, notices } = update.step
    const cue = cueForStep(events, notices, localSeats)
    if (cue) onCue?.(cue)
    const fromThisDevice = action.by !== 'system' && localSeats.includes(action.by)
    // A dragged piece is already where it is going; replaying its travel would look like a glitch.
    animations.ingest(events, { skipTravel: fromThisDevice && dragOrigin.current })
    dragOrigin.current = false
    const seatsNow = update.snapshot.record.config.seats
    const namesNow: Names = {
      player1: seatLabel(seatsNow.player1, 'player1', sideNames),
      player2: seatLabel(seatsNow.player2, 'player2', sideNames),
    }
    for (const notice of notices) {
      const text = noticeText(notice, namesNow, localSeats)
      if (text) notify(text, notice.type === 'offer-declined' ? 'info' : 'success')
      if (notice.type === 'undo-applied' && text) setAnnouncement(text)
    }
    if (action.intent.type === 'engine' || (action.intent.type === 'answer-offer' && action.intent.accept)) {
      const latest = update.snapshot.state.position.moves.at(-1)
      if (latest) setAnnouncement(spokenMove(latest, namesNow))
    }
    // Keep the chain piece selected so its next jumps stay on screen.
    const position = update.snapshot.state.position
    setSelected(position.chain.active && localSeats.includes(position.currentPlayer) ? position.chain.at : null)
    setCallPicking(false)
    if (action.intent.type === 'answer-offer') setReviewIndex(null)
  })

  const { state, record } = snapshot
  const position = state.position
  const seats = record.config.seats
  const names: Names = {
    player1: seatLabel(seats.player1, 'player1', sideNames),
    player2: seatLabel(seats.player2, 'player2', sideNames),
  }
  const over = position.status.kind !== 'playing'
  const reviewing = reviewIndex !== null && reviewIndex < state.timeline.length - 1
  const viewPosition = reviewing ? state.timeline[reviewIndex] : position
  const toMove = position.currentPlayer
  const myTurn = !over && localSeats.includes(toMove)
  // Online, nobody moves until both players are connected.
  const connected = snapshot.connection === 'local' || snapshot.connection === 'connected'
  const canAct = myTurn && !reviewing && connected

  // -- clock flags ----------------------------------------------------------
  const flagAt = state.clock && !over ? flagTime(state.clock) : null
  useEffect(() => {
    if (!authoritative || flagAt === null) return
    const running = state.clock?.running
    if (!running) return
    let retry: number | undefined
    const claim = () => {
      if (session.submit('system', { type: 'engine', action: { type: 'timeout', player: running } })) {
        retry = window.setTimeout(claim, 200)
      }
    }
    const handle = window.setTimeout(claim, Math.max(0, flagAt - Date.now()))
    return () => {
      window.clearTimeout(handle)
      window.clearTimeout(retry)
    }
  }, [authoritative, flagAt, session, state.clock?.running])

  // -- board interaction ------------------------------------------------------
  const destinations = useMemo(
    () => (selected && canAct ? destinationsFor(position, selected) : NO_DESTINATIONS),
    [selected, canAct, position],
  )

  const offenderIds = useMemo(
    () => new Set(engineCanCall(position) && !reviewing ? position.offenders.map((o) => o.pieceId) : []),
    [position, reviewing],
  )

  const submitEngine = useCallback(
    (action: EngineAction, by: PlayerId = toMove) => session.submit(by, { type: 'engine', action }),
    [session, toMove],
  )

  const canDragFrom = useCallback(
    (coord: Coord) => {
      if (!canAct) return false
      const piece = position.board[coord.row]?.[coord.col]
      if (!piece || piece.player !== toMove) return false
      if (position.chain.active) return sameSquare(position.chain.at, coord)
      return true
    },
    [canAct, position, toMove],
  )

  const call = useCallback(
    (pieceId?: string) => {
      if (!canAct || !engineCanCall(position)) return
      const needsChoice = position.settings.call.scope === 'choose-one' && position.offenders.length > 1
      if (needsChoice && !pieceId) {
        setCallPicking(true)
        notify('Choose which piece to call: tap it on the board or pick its square.')
        return
      }
      submitEngine({ type: 'call', pieceId })
    },
    [canAct, position, submitEngine, notify],
  )

  const onSquare = useCallback(
    (coord: Coord) => {
      if (reviewing) {
        setReviewIndex(null)
        return
      }
      if (!canAct) return
      const piece = position.board[coord.row]?.[coord.col]

      // Calling: tapping an offender calls it.
      if (piece && offenderIds.has(piece.id) && piece.player !== toMove) {
        call(piece.id)
        return
      }
      if (piece && piece.player === toMove) {
        if (position.chain.active && !sameSquare(position.chain.at, coord)) {
          notify('Finish the chain with the same piece, or end your turn.', 'error')
          return
        }
        setSelected((prev) => (sameSquare(prev, coord) && !position.chain.active ? null : coord))
        return
      }
      if (selected) {
        const legal = [...destinations.slides, ...destinations.captures].some((d) => sameSquare(d, coord))
        if (legal) submitEngine({ type: 'move', from: selected, to: coord })
        else setSelected(position.chain.active ? selected : null)
      }
    },
    [reviewing, canAct, position, offenderIds, toMove, call, notify, selected, destinations, submitEngine],
  )

  const onDrop = useCallback(
    (from: Coord, to: Coord) => {
      if (!canAct) return
      dragOrigin.current = true
      if (submitEngine({ type: 'move', from, to })) dragOrigin.current = false
    },
    [canAct, submitEngine],
  )

  const onEscape = useCallback(() => {
    if (!position.chain.active) setSelected(null)
    setCallPicking(false)
  }, [position.chain.active])

  // -- turn and offer actions -------------------------------------------------
  const endChain = useCallback(() => {
    if (canAct && position.chain.active) submitEngine({ type: 'end-chain' })
  }, [canAct, position.chain.active, submitEngine])

  const resign = useCallback((player: PlayerId) => submitEngine({ type: 'resign', player }, player), [submitEngine])

  const offer = useCallback((player: PlayerId, kind: OfferKind) => session.submit(player, { type: 'offer', kind }), [session])
  const answerOffer = useCallback(
    (player: PlayerId, accept: boolean) => session.submit(player, { type: 'answer-offer', accept }),
    [session],
  )
  const cancelOffer = useCallback((player: PlayerId) => session.submit(player, { type: 'cancel-offer' }), [session])

  // -- review -----------------------------------------------------------------
  const lastIndex = state.timeline.length - 1
  const goTo = useCallback(
    (index: number | null) => {
      if (index === null) return setReviewIndex(null)
      const clamped = Math.max(0, Math.min(index, lastIndex))
      setSelected(null)
      setReviewIndex(clamped === lastIndex ? null : clamped)
    },
    [lastIndex],
  )
  const viewIndex = reviewing ? reviewIndex! : lastIndex

  /** Timeline index of the position right after a given ply. */
  const indexAfterPly = useCallback(
    (ply: number) => {
      const index = state.timeline.findIndex((entry) => entry.moves.length > ply)
      return index === -1 ? lastIndex : index
    },
    [state.timeline, lastIndex],
  )

  const moveRows = useMemo(() => toMoveRows(position.moves), [position.moves])

  return {
    snapshot,
    state,
    record,
    position,
    viewPosition,
    names,
    seats,
    over,
    toMove,
    myTurn,
    canAct,
    // board
    selected: reviewing ? null : selected,
    destinations: reviewing ? NO_DESTINATIONS : destinations,
    offenderIds,
    callPicking,
    setCallPicking,
    canDragFrom,
    onSquare,
    onDrop,
    onEscape,
    animations: animations.animations,
    promotedIds: animations.promotedIds,
    lastMove: reviewing ? null : animations.lastMove,
    completeAnimation: animations.complete,
    resetAnimations: animations.reset,
    announcement,
    // actions
    call,
    endChain,
    resign,
    offer,
    answerOffer,
    cancelOffer,
    // review
    reviewing,
    viewIndex,
    lastIndex,
    goTo,
    indexAfterPly,
    moveRows,
    totalMoves: position.moves.length,
  }
}

export type MatchController = ReturnType<typeof useMatchController>
