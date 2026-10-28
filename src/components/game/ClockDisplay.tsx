import { Clock } from 'lucide-react'
import { formatClock } from '../../game/clock'
import type { PlayerId } from '../../game/types'
import { remainingAt } from '../../match/clock'
import type { MatchClock } from '../../match/types'

interface ClockDisplayProps {
  clock: MatchClock
  player: PlayerId
  now: number
  name: string
}

const LOW_MS = 20_000

/** A side's remaining time. Dims when not running, warns under twenty seconds. */
export default function ClockDisplay({ clock, player, now, name }: ClockDisplayProps) {
  const remaining = remainingAt(clock, player, now)
  const running = clock.running === player && !clock.paused
  const low = remaining <= LOW_MS
  return (
    <span
      className={['clock', running && 'is-running', low && 'is-low'].filter(Boolean).join(' ')}
      role="timer"
      aria-label={`${name}'s clock: ${formatClock(remaining)}${running ? ', running' : ''}`}
    >
      <Clock size={14} aria-hidden />
      <span className="clock__time">{formatClock(remaining)}</span>
    </span>
  )
}
