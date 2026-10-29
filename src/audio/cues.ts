import type { GameEvent, PlayerId } from '../game/types'
import type { MatchNotice } from '../match/types'
import type { SoundCue } from './types'

/**
 * Which sound one step of the game makes. A step can hold several events (a
 * capture that crowns and ends the game), but playing them all at once is
 * noise, so the most important one wins: the end of the game, then a call,
 * then a crowning, then a capture, then a plain move, then an offer.
 *
 * `localSeats` are the sides played on this device. With exactly one, the end
 * of the game is a win or a loss for the listener; with none or both (pass and
 * play, watching), any decisive result sounds like a win.
 */
export function cueForStep(
  events: GameEvent[],
  notices: MatchNotice[],
  localSeats: PlayerId[],
  options: { endings?: boolean } = {},
): SoundCue | null {
  const has = (type: GameEvent['type']) => events.some((event) => event.type === type)
  const endings = options.endings ?? true

  if (endings) {
    const win = events.find((event) => event.type === 'win')
    if (win) {
      const listener = localSeats.length === 1 ? localSeats[0] : null
      return listener === null || win.winner === listener ? 'win' : 'lose'
    }
    if (has('tie')) return 'draw'
  }
  if (has('call')) return 'call'
  if (has('promotion') || has('auto-king')) return 'crown'
  if (has('capture')) return 'capture'
  if (has('move')) return 'move'
  if (notices.some((notice) => notice.type === 'offer-made')) return 'offer'
  return null
}
