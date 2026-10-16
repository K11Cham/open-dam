import { useCallback, useEffect, useRef, useState } from 'react'
import { completeMove, createClock, flaggedPlayer, pause, startFor, tick } from '../game/clock'
import type { ClockState, PlayerId, TimeControl } from '../game/types'

const TICK_MS = 100

/**
 * Owns the live clock. The engine stays pure and never counts time; this hook
 * holds the ticking state and calls back when someone flags.
 *
 * Only one clock ever runs: `completeMove` settles the mover's elapsed time,
 * adds their increment, and hands the running flag to the opponent in a single
 * operation, so a move can't leave both clocks live or both paused.
 */
export function useGameClock(
  control: TimeControl | null,
  options: {
    enabled: boolean
    onFlag: (player: PlayerId) => void
  },
) {
  const [clock, setClock] = useState<ClockState | null>(() => createClock(control))
  const flaggedRef = useRef(false)
  const onFlagRef = useRef(options.onFlag)
  onFlagRef.current = options.onFlag

  // Rebuild when the time control itself changes (new game, different preset).
  useEffect(() => {
    setClock(createClock(control))
    flaggedRef.current = false
  }, [control?.label, control?.initialMs, control?.incrementMs])

  useEffect(() => {
    if (!clock || !clock.running || !options.enabled) return
    const handle = window.setInterval(() => {
      setClock((prev) => (prev ? tick(prev, performance.now()) : prev))
    }, TICK_MS)
    return () => window.clearInterval(handle)
  }, [clock?.running, options.enabled, clock === null])

  useEffect(() => {
    if (!clock || flaggedRef.current) return
    const flagged = flaggedPlayer(clock)
    if (flagged) {
      flaggedRef.current = true
      setClock((prev) => (prev ? pause(prev, performance.now()) : prev))
      onFlagRef.current(flagged)
    }
  }, [clock?.player1Ms, clock?.player2Ms])

  /** Start (or restart) counting for a player — used on the first move too. */
  const start = useCallback((player: PlayerId) => {
    setClock((prev) => (prev ? startFor(prev, player, performance.now()) : prev))
  }, [])

  const stop = useCallback(() => {
    setClock((prev) => (prev ? pause(prev, performance.now()) : prev))
  }, [])

  /** Mover finished their turn: settle, increment, hand over. */
  const handOver = useCallback(
    (mover: PlayerId) => {
      if (!control) return
      setClock((prev) => (prev ? completeMove(prev, mover, control, performance.now()) : prev))
    },
    [control],
  )

  const reset = useCallback(() => {
    flaggedRef.current = false
    setClock(createClock(control))
  }, [control])

  const restore = useCallback((saved: ClockState | null) => {
    flaggedRef.current = false
    setClock(saved ? { ...saved, lastTickAt: performance.now() } : null)
  }, [])

  return { clock, start, stop, handOver, reset, restore }
}
