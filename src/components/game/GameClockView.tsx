import { Clock } from 'lucide-react'
import { formatClock } from '../../game/clock'
import type { ClockState, PlayerId } from '../../game/types'

interface GameClockViewProps {
  clock: ClockState | null
  player: PlayerId
}

/**
 * Reads straight off the clock state. `running` is authoritative for the idle
 * dimming, so a paused clock always looks paused even mid-chain.
 */
export default function GameClockView({ clock, player }: GameClockViewProps) {
  if (!clock) return null
  const remaining = player === 'player1' ? clock.player1Ms : clock.player2Ms
  const isRunning = clock.running === player
  const isLow = remaining <= 20_000

  return (
    <span
      className={`dam-clock ${isRunning ? '' : 'is-idle'} ${isLow ? 'is-low' : ''}`}
      aria-label={`${player === 'player1' ? 'Red' : 'Blue'} clock`}
    >
      <Clock size={13} />
      {formatClock(remaining)}
    </span>
  )
}
