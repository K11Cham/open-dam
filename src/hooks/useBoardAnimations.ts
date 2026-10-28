import { useCallback, useEffect, useRef, useState } from 'react'
import type { Coord, GameEvent, PieceData } from '../game/types'

/**
 * Turns the engine's event stream into a short-lived animation queue.
 *
 * The engine emits `move`, `capture`, `promotion`, `call`, `auto-king` and
 * friends for every state change; this hook is the only place that decides how
 * long each one lives on screen. The board reads the queue and renders it in
 * whatever style the theme wants.
 */

export type BoardAnimation =
  | { id: string; kind: 'travel'; piece: PieceData; from: Coord; to: Coord }
  | { id: string; kind: 'capture'; piece: PieceData; at: Coord }
  | { id: string; kind: 'call'; piece: PieceData; at: Coord }

export interface BoardAnimationState {
  animations: BoardAnimation[]
  /** Piece ids that should play their "just crowned" animation. */
  promotedIds: string[]
  lastMove: { from: Coord; to: Coord } | null
}

const PROMOTION_MS = 900

export function useBoardAnimations(captureDurationMs: number) {
  const [animations, setAnimations] = useState<BoardAnimation[]>([])
  const [promotedIds, setPromotedIds] = useState<string[]>([])
  const [lastMove, setLastMove] = useState<{ from: Coord; to: Coord } | null>(null)
  const counter = useRef(0)
  const timers = useRef<number[]>([])

  const schedule = useCallback((fn: () => void, delay: number) => {
    timers.current.push(window.setTimeout(fn, delay))
  }, [])

  useEffect(() => () => timers.current.forEach((handle) => window.clearTimeout(handle)), [])

  const ingest = useCallback(
    (events: GameEvent[], options: { skipTravel?: boolean } = {}) => {
      const added: BoardAnimation[] = []
      const crowned: string[] = []
      const nextId = () => `anim-${counter.current++}`

      for (const event of events) {
        switch (event.type) {
          case 'move':
            setLastMove({ from: event.from, to: event.to })
            if (!options.skipTravel) {
              added.push({
                id: nextId(),
                kind: 'travel',
                piece: { player: event.player, isKing: event.isKing, id: event.pieceId },
                from: event.from,
                to: event.to,
              })
            }
            break
          case 'capture':
            added.push({ id: nextId(), kind: 'capture', piece: event.captured, at: event.at })
            break
          case 'call':
            for (const removed of event.removed) added.push({ id: nextId(), kind: 'call', piece: removed.piece, at: removed.at })
            break
          case 'promotion':
            if (!event.deferred) crowned.push(event.pieceId)
            break
          case 'auto-king':
            crowned.push(event.pieceId)
            break
          default:
            break
        }
      }

      if (crowned.length > 0) {
        setPromotedIds((prev) => [...prev, ...crowned])
        schedule(() => setPromotedIds((prev) => prev.filter((id) => !crowned.includes(id))), PROMOTION_MS)
      }
      if (added.length === 0) return
      setAnimations((prev) => [...prev, ...added])
      // Exits are timed; travel animations remove themselves when they land.
      const exits = added.filter((a) => a.kind !== 'travel').map((a) => a.id)
      if (exits.length > 0) schedule(() => setAnimations((prev) => prev.filter((a) => !exits.includes(a.id))), captureDurationMs)
    },
    [captureDurationMs, schedule],
  )

  const complete = useCallback((id: string) => {
    setAnimations((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const reset = useCallback(() => {
    timers.current.forEach((handle) => window.clearTimeout(handle))
    timers.current = []
    setAnimations([])
    setPromotedIds([])
    setLastMove(null)
  }, [])

  return { animations, promotedIds, lastMove, ingest, complete, reset }
}
