import { resolvePromotionPolicy, settingsAreCompatible } from '../game/settings'
import type { PlayerId, RuleSettings } from '../game/types'

/**
 * The matchmaking queue a server keeps: players post a seek (the rules they
 * want and their rating in that pool), and the queue pairs two seeks whose
 * rules agree and whose ratings are close enough. The window grows the longer
 * someone waits, so a quiet pool still finds a game. Pure: the caller supplies
 * the time and starts the match.
 */

export interface Seek {
  id: string
  /** Who is seeking; a player is never paired with themselves. */
  playerId: string
  settings: RuleSettings
  rating: number
  /** Epoch ms when the seek was posted. */
  since: number
}

export interface Pairing {
  /** Who plays which side. */
  seats: Record<PlayerId, Seek>
  /** The one rule set both agreed to, with "match opponent" resolved. */
  settings: RuleSettings
}

/** Rating gap accepted at first, how fast it widens, and its limit. */
const WINDOW_START = 100
const WINDOW_STEP = 50
const WINDOW_STEP_MS = 5_000
const WINDOW_MAX = 500

/** The rating gap a seek accepts after waiting `waitedMs`. */
export const ratingWindow = (waitedMs: number): number =>
  Math.min(WINDOW_MAX, WINDOW_START + WINDOW_STEP * Math.floor(Math.max(0, waitedMs) / WINDOW_STEP_MS))

/** The rules a pairing is played under: each side's own, except that "match opponent" takes the other's. */
export const agreedSettings = (a: RuleSettings, b: RuleSettings): RuleSettings => {
  const bResolved = b.promotionPolicy === 'match-opponent' ? undefined : b.promotionPolicy
  return { ...a, promotionPolicy: resolvePromotionPolicy(a.promotionPolicy, bResolved) }
}

export class SeekQueue {
  private seeks: Seek[] = []
  private readonly random: () => number

  /** `random` picks who moves first; injectable for tests. */
  constructor(options: { random?: () => number } = {}) {
    this.random = options.random ?? Math.random
  }

  get waiting(): readonly Seek[] {
    return this.seeks
  }

  /**
   * Post a seek and pair it straight away if someone suitable is waiting.
   * A player has one seek at a time: a new one replaces their old one.
   */
  add(seek: Seek, now: number): Pairing | null {
    this.seeks = this.seeks.filter((s) => s.playerId !== seek.playerId)
    const partner = this.bestPartner(seek, now)
    if (partner) {
      this.remove(partner.id)
      return this.pair(seek, partner)
    }
    this.seeks.push(seek)
    return null
  }

  remove(seekId: string) {
    this.seeks = this.seeks.filter((s) => s.id !== seekId)
  }

  /** Try again for everyone, oldest first, now that windows may have widened. Call it every few seconds. */
  sweep(now: number): Pairing[] {
    const pairings: Pairing[] = []
    for (const seek of [...this.seeks].sort((a, b) => a.since - b.since)) {
      if (!this.seeks.includes(seek)) continue // already paired this sweep
      const partner = this.bestPartner(seek, now)
      if (!partner) continue
      this.seeks = this.seeks.filter((s) => s !== seek && s !== partner)
      pairings.push(this.pair(seek, partner))
    }
    return pairings
  }

  /** The closest-rated compatible seek both sides would accept; the longest waiting wins a tie. */
  private bestPartner(seek: Seek, now: number): Seek | null {
    let best: Seek | null = null
    for (const other of this.seeks) {
      if (other.id === seek.id || other.playerId === seek.playerId) continue
      if (!settingsAreCompatible(seek.settings, other.settings)) continue
      const gap = Math.abs(seek.rating - other.rating)
      if (gap > ratingWindow(now - seek.since) || gap > ratingWindow(now - other.since)) continue
      const bestGap = best ? Math.abs(seek.rating - best.rating) : Infinity
      if (gap < bestGap || (gap === bestGap && best && other.since < best.since)) best = other
    }
    return best
  }

  private pair(a: Seek, b: Seek): Pairing {
    const [first, second] = this.random() < 0.5 ? [a, b] : [b, a]
    return { seats: { player1: first, player2: second }, settings: agreedSettings(first.settings, second.settings) }
  }
}
