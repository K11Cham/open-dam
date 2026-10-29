import { useSyncExternalStore } from 'react'
import { soundPlayer, soundSettings } from '../audio/player'
import type { SoundCue } from '../audio/types'
import { useTheme } from './useTheme'

/**
 * The current theme's sounds and the sound setting. `play` does nothing while
 * sound is off, so callers can play every cue without checking first.
 */
export function useSound() {
  const { theme } = useTheme()
  const settings = useSyncExternalStore(soundSettings.subscribe, soundSettings.get, soundSettings.get)

  const play = (cue: SoundCue) => {
    if (settings.enabled) void soundPlayer.play(theme.sounds[cue], settings.volume)
  }

  const setEnabled = (enabled: boolean) => {
    soundSettings.set({ ...settings, enabled })
    // Turning sound on is itself a click, so the browser lets this preview through.
    if (enabled) void soundPlayer.play(theme.sounds.move, settings.volume)
  }

  return { enabled: settings.enabled, volume: settings.volume, play, setEnabled }
}
