import { useEffect, useRef } from 'react'
import type { MatchHost } from '../match/session'
import { activeMatchStamp, archiveMatch, clearActiveMatch, saveActiveMatch } from '../match/storage'
import { keepStorage } from '../pwa/pwa'
import { STORAGE_KEYS } from '../services/storage'

/**
 * Keeps a hosted match saved on this device:
 *  - every accepted action is written to the active-match slot;
 *  - a finished game moves to the archive and the slot is cleared;
 *  - for local games, leaving the page pauses the clock, and coming back
 *    resumes it. Leaving means the page is hidden (another app or tab in
 *    front, the screen locked) as well as closed or navigated away from: a
 *    phone switching apps fires no `pagehide`, and a page is always hidden
 *    before the browser freezes or discards it.
 *
 * The slot is shared by every tab of the app, and each write replaces it
 * whole. So this tab only writes while the slot still holds its own last
 * write. Once another tab has saved (a move in the same game opened twice, or
 * a new game), this tab's copy is out of date: it stops writing, so closing it
 * or letting its clock run out can never put an older game back over a newer
 * one, or clear a game it does not hold, and `onStale` tells the page.
 */
export function useMatchPersistence(host: MatchHost, onStale?: () => void) {
  const onStaleRef = useRef(onStale)
  useEffect(() => {
    onStaleRef.current = onStale
  })

  useEffect(() => {
    const isLocal = host.getSnapshot().record.config.mode === 'local'
    // The slot as this tab last saw it: when the game was opened, or our own last write.
    let expected = activeMatchStamp()
    let stale = false
    // Set while unmounting: a page that is going away (a rematch, say, which saves its new game first) has nothing to tell.
    let leaving = false

    const owned = () => {
      if (stale) return false
      if (activeMatchStamp() === expected) return true
      stale = true
      if (!leaving) onStaleRef.current?.()
      return false
    }
    const write = () => {
      const { record, state } = host.getSnapshot()
      if (!owned()) return
      if (state.position.status.kind === 'playing') {
        expected = saveActiveMatch(record)
        return
      }
      archiveMatch(record)
      // A finished game is worth keeping: ask the browser not to clear this site's storage.
      void keepStorage()
      clearActiveMatch()
      expected = null
    }
    const timed = () => {
      const { state } = host.getSnapshot()
      return isLocal && !!state.clock?.running && state.position.status.kind === 'playing'
    }
    const pause = () => {
      if (!owned()) return
      if (timed() && !host.getSnapshot().state.clock?.paused) host.submit('system', { type: 'pause' })
      if (host.getSnapshot().state.position.status.kind === 'playing') write()
    }
    const resume = () => {
      if (!owned()) return
      if (timed() && host.getSnapshot().state.clock?.paused) host.submit('system', { type: 'resume' })
    }

    const unsubscribe = host.subscribe((update) => {
      if (update.step) write()
    })

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resume()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause()
      else resume()
    }
    // Another tab wrote the slot (`key` is null when it cleared all storage).
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.activeMatch || event.key === null) owned()
    }
    // A game opened in a background tab waits until it is looked at.
    onVisibility()
    window.addEventListener('pagehide', pause)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
      window.removeEventListener('pagehide', pause)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('storage', onStorage)
      leaving = true
      pause()
    }
  }, [host])
}
