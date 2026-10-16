import { useCallback, useRef, useState } from 'react'
import type { Coord, GameEvent, PieceData } from '../game/types'

/**
 * Turns the engine's event stream into a short-lived animation queue.
 *
 * The engine emits `move`, `capture`, `promotion`, `call`, `auto-king`,
 * `chain-*`, `win` and `tie` for every state change; this hook is the only
 * place that decides how long each one lives on screen. Components read the
 * queue and render it however their theme wants.
 */

export type BoardAnimation =
  | { id: string; kind: 'travel'; piece: PieceData; from: Coord; to: Coord }
  | { id: string; kind: 'capture'; piece: PieceData; at: Coord }
  | { id: string; kind: 'call'; piece: PieceData; at: Coord }
  | { id: string; kind: 'promotion'; pieceId: string; at: Coord }

export interface AnimationBundle {
  animations: BoardAnimation[]
  /** Piece ids that should render their "just crowned" state this frame. */
  promotedIds: string[]
  /** Squares occupied by pieces currently mid-travel — hide the static piece. */
  travelDestinations: Set<string>
  lastMove: { from: Coord; to: Coord } | null
}

export function useBoardAnimations(captureDurationMs: number) {
  const [animations, setAnimations] = useState<BoardAnimation[]>([])
  const [promotedIds, setPromotedIds] = useState<string[]>([])
  const [lastMove, setLastMove] = useState<{ from: Coord; to: Coord } | null>(null)
  const counter = useRef(0)
  const timers = useRef<number[]>([])

  const nextId = () => `anim-${counter.current++}`

  const schedule = useCallback((fn: () => void, delay: number) => {
    const handle = window.setTimeout(fn, delay)
    timers.current.push(handle)
  }, [])

  const ingest = useCallback(
    (events: GameEvent[], options: { skipTravel?: boolean } = {}) => {
      const added: BoardAnimation[] = []

      for (const event of events) {
        switch (event.type) {
          case 'move': {
            setLastMove({ from: event.from, to: event.to })
            if (options.skipTravel) break
            added.push({
              id: nextId(),
              kind: 'travel',
              // The engine gives us ids, not the piece object post-move, so we
              // rebuild the minimum the renderer needs.
              piece: { player: event.player, isKing: event.isKing, id: event.pieceId },
              from: event.from,
              to: event.to,
            })
            break
          }
          case 'capture':
            added.push({ id: nextId(), kind: 'capture', piece: event.captured, at: event.at })
            break
          case 'call':
            for (const removed of event.removed) {
              added.push({ id: nextId(), kind: 'call', piece: removed.piece, at: removed.at })
            }
            break
          case 'promotion':
            if (!event.deferred) {
              added.push({ id: nextId(), kind: 'promotion', pieceId: event.pieceId, at: event.at })
              setPromotedIds((prev) => [...prev, event.pieceId])
              schedule(
                () => setPromotedIds((prev) => prev.filter((id) => id !== event.pieceId)),
                900,
              )
            }
            break
          case 'auto-king':
            setPromotedIds((prev) => [...prev, event.pieceId])
            schedule(() => setPromotedIds((prev) => prev.filter((id) => id !== event.pieceId)), 900)
            break
          default:
            break
        }
      }

      if (added.length === 0) return
      setAnimations((prev) => [...prev, ...added])

      // Exits are timed; travel animations remove themselves on completion so
      // the spring is never cut short.
      const exits = added.filter((a) => a.kind === 'capture' || a.kind === 'call').map((a) => a.id)
      if (exits.length > 0) {
        schedule(
          () => setAnimations((prev) => prev.filter((a) => !exits.includes(a.id))),
          captureDurationMs,
        )
      }
      const promos = added.filter((a) => a.kind === 'promotion').map((a) => a.id)
      if (promos.length > 0) {
        schedule(() => setAnimations((prev) => prev.filter((a) => !promos.includes(a.id))), 900)
      }
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

  const travelDestinations = new Set(
    animations.filter((a) => a.kind === 'travel').map((a) => `${a.to.row},${a.to.col}`),
  )

  return { animations, promotedIds, travelDestinations, lastMove, ingest, complete, reset }
}
