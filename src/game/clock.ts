import type { ClockState, PlayerId, TimeControl } from './types'

/**
 * Clock arithmetic, kept pure so the React layer only owns the interval.
 *
 * The model is "one clock runs at a time": every state change goes through
 * `tick` first (charging the running player for the elapsed wall time) and then
 * switches who is running. That means pausing one player's clock and resuming
 * the other's is a single operation and the two can never both be live.
 */

export const createClock = (control: TimeControl | null): ClockState | null =>
  control
    ? {
        player1Ms: control.initialMs,
        player2Ms: control.initialMs,
        running: null,
        lastTickAt: null,
      }
    : null

export const remainingFor = (clock: ClockState, player: PlayerId): number =>
  player === 'player1' ? clock.player1Ms : clock.player2Ms

const withRemaining = (clock: ClockState, player: PlayerId, ms: number): ClockState =>
  player === 'player1' ? { ...clock, player1Ms: ms } : { ...clock, player2Ms: ms }

/** Charge the running player for time elapsed since the last tick. */
export const tick = (clock: ClockState, now: number): ClockState => {
  if (!clock.running || clock.lastTickAt === null) return { ...clock, lastTickAt: now }
  const elapsed = Math.max(0, now - clock.lastTickAt)
  const next = Math.max(0, remainingFor(clock, clock.running) - elapsed)
  return { ...withRemaining(clock, clock.running, next), lastTickAt: now }
}

/** Pause whoever is running and start `player`'s clock. */
export const startFor = (clock: ClockState, player: PlayerId, now: number): ClockState => {
  const settled = tick(clock, now)
  return { ...settled, running: player, lastTickAt: now }
}

export const pause = (clock: ClockState, now: number): ClockState => {
  const settled = tick(clock, now)
  return { ...settled, running: null, lastTickAt: null }
}

/**
 * Complete a move: settle the mover's time, add the increment, hand the clock
 * to the opponent.
 */
export const completeMove = (
  clock: ClockState,
  mover: PlayerId,
  control: TimeControl,
  now: number,
): ClockState => {
  const settled = tick(clock, now)
  const withIncrement = withRemaining(
    settled,
    mover,
    remainingFor(settled, mover) + control.incrementMs,
  )
  const opponent: PlayerId = mover === 'player1' ? 'player2' : 'player1'
  return { ...withIncrement, running: opponent, lastTickAt: now }
}

export const flaggedPlayer = (clock: ClockState): PlayerId | null => {
  if (clock.player1Ms <= 0) return 'player1'
  if (clock.player2Ms <= 0) return 'player2'
  return null
}

export const formatClock = (ms: number): string => {
  const safe = Math.max(0, ms)
  const totalSeconds = Math.floor(safe / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (safe < 20_000) {
    const tenths = Math.floor((safe % 1000) / 100)
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
