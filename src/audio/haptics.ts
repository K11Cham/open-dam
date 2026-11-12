import type { SoundCue } from './types'

/**
 * What each cue feels like on a phone that can vibrate: a pattern of
 * buzz, pause, buzz… in milliseconds, as `navigator.vibrate` takes it.
 * Every cue that makes a sound also makes one of these, so a player with the
 * sound off (on a bus, in class) still feels a capture or a call land.
 *
 * Kept short. A move is a tick; a capture a firmer tap; a call, which takes
 * a piece without a move landing on it, a double tap so it is never mistaken
 * for a move; the end of the game the longest. Plain data, like the sounds.
 */
export const HAPTIC_PATTERNS: Record<SoundCue, number[]> = {
  move: [8],
  capture: [22],
  crown: [14, 40, 14],
  call: [30, 50, 30],
  illegal: [12, 30, 12],
  offer: [16],
  win: [20, 40, 20, 40, 60],
  lose: [70],
  draw: [30, 60, 30],
}

/** No pattern buzzes, pauses included, for longer than this. */
export const MAX_BUZZ_MS = 200

/**
 * Feel a cue. Does nothing where the browser cannot vibrate: iPhones and iPads
 * (Safari has no `navigator.vibrate`), desktops, and Chrome before the page has
 * been tapped. Some browsers throw instead of refusing, and a buzz is never
 * worth an error, so that is caught too.
 */
export function buzz(cue: SoundCue) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(HAPTIC_PATTERNS[cue])
  } catch {
    // Refused; nothing to tell anyone.
  }
}

/** Whether this browser can vibrate at all, so Settings can say so. */
export const canBuzz = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
