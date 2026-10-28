import { useEffect } from 'react'
import type { MatchHost } from '../match/session'
import { archiveMatch, clearActiveMatch, saveActiveMatch } from '../match/storage'

/**
 * Keeps a hosted match saved on this device:
 *  - every accepted action is written to the active-match slot;
 *  - a finished game moves to the archive and the slot is cleared;
 *  - for local games, leaving the page (closing it, navigating away, or the
 *    browser freezing it) pauses the clock, and coming back resumes it.
 */
export function useMatchPersistence(host: MatchHost) {
  useEffect(() => {
    const isLocal = host.getSnapshot().record.config.mode === 'local'

    const save = () => {
      const { record, state } = host.getSnapshot()
      if (state.position.status.kind === 'playing') saveActiveMatch(record)
    }
    const timed = () => {
      const { state } = host.getSnapshot()
      return isLocal && !!state.clock?.running && state.position.status.kind === 'playing'
    }
    const pause = () => {
      if (timed() && !host.getSnapshot().state.clock?.paused) host.submit('system', { type: 'pause' })
      save()
    }
    const resume = () => {
      if (timed() && host.getSnapshot().state.clock?.paused) host.submit('system', { type: 'resume' })
    }

    const unsubscribe = host.subscribe((update) => {
      if (!update.step) return
      const { record, state } = update.snapshot
      if (state.position.status.kind === 'playing') saveActiveMatch(record)
      else {
        archiveMatch(record)
        clearActiveMatch()
      }
    })

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resume()
    }
    resume()
    window.addEventListener('pagehide', pause)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', pause)
      window.removeEventListener('pageshow', onPageShow)
      pause()
    }
  }, [host])
}
