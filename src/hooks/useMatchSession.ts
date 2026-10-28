import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { MatchSession, SessionSnapshot, SessionUpdate } from '../match/session'

/**
 * Subscribe a component to a match session. Returns the current snapshot and
 * re-renders whenever the session publishes. `onUpdate` additionally receives
 * every update (with its board events and notices), for side effects such as
 * animations, toasts and saving.
 */
export function useMatchSession(session: MatchSession, onUpdate?: (update: SessionUpdate) => void): SessionSnapshot {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)

  const handler = useRef(onUpdate)
  useEffect(() => {
    handler.current = onUpdate
  })

  useEffect(() => session.subscribe((update) => handler.current?.(update)), [session])

  return snapshot
}
