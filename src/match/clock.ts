import type { PlayerId, TimeControl } from '../game/types'
import type { MatchClock } from './types'

/**
 * Pure clock arithmetic for a match. Every function takes the time of the
 * action that caused it, so replaying a saved log reproduces the clocks
 * exactly. Nothing here reads the real time.
 *
 * Policy, in one place:
 *  - Each side's first move is free: the clock starts when the second
 *    side completes its first move, with the first side to move running.
 *    Online, the opponent may not even have arrived when the game opens.
 *  - Finishing a turn charges the mover, adds the increment, and starts the
 *    opponent. Chain legs and calls do not finish a turn.
 *  - An accepted undo does not refund time; the side to move after the undo
 *    starts running.
 *  - `pause` / `resume` stop and restart the running side (local games only,
 *    used when the app is closed and reopened).
 */

export const createMatchClock = (control: TimeControl | null): MatchClock | null =>
  control
    ? { remaining: { player1: control.initialMs, player2: control.initialMs }, running: null, since: null, paused: false }
    : null

/** Charge the running side for time up to `at`, leaving it running from `at`. */
export const settle = (clock: MatchClock, at: number): MatchClock => {
  if (!clock.running || clock.since === null || clock.paused) return clock
  const elapsed = Math.max(0, at - clock.since)
  return {
    ...clock,
    remaining: { ...clock.remaining, [clock.running]: Math.max(0, clock.remaining[clock.running] - elapsed) },
    since: at,
  }
}

/** A turn finished at `at`: charge the mover, add increment, start `next`. */
export const finishTurn = (clock: MatchClock, mover: PlayerId, next: PlayerId, incrementMs: number, at: number): MatchClock => {
  const settled = settle(clock, at)
  return {
    ...settled,
    remaining: { ...settled.remaining, [mover]: settled.remaining[mover] + incrementMs },
    running: next,
    since: settled.paused ? null : at,
  }
}

/** Hand the clock to `player` without an increment (used after an undo). */
export const runFor = (clock: MatchClock, player: PlayerId, at: number): MatchClock => {
  const settled = settle(clock, at)
  if (settled.running === null) return settled // not started yet: stays that way
  return { ...settled, running: player, since: settled.paused ? null : at }
}

export const stop = (clock: MatchClock, at: number): MatchClock => ({ ...settle(clock, at), running: null, since: null })

export const pauseClock = (clock: MatchClock, at: number): MatchClock =>
  clock.paused ? clock : { ...settle(clock, at), paused: true, since: null }

export const resumeClock = (clock: MatchClock, at: number): MatchClock =>
  clock.paused ? { ...clock, paused: false, since: clock.running ? at : null } : clock

/** Time left for `player` at wall time `now`. */
export const remainingAt = (clock: MatchClock, player: PlayerId, now: number): number => {
  const base = clock.remaining[player]
  if (clock.running !== player || clock.since === null || clock.paused) return base
  return Math.max(0, base - (now - clock.since))
}

/** When the running side will run out, in epoch ms, or null if nothing runs. */
export const flagTime = (clock: MatchClock): number | null => {
  if (!clock.running || clock.since === null || clock.paused) return null
  return clock.since + clock.remaining[clock.running]
}
