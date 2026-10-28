import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `intervalMs` while `active`. Clocks read
 * from this rather than keeping their own timers, so every clock on screen
 * agrees and nothing ticks when no clock is running.
 */
export function useNow(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const handle = window.setInterval(tick, intervalMs)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(handle)
    }
  }, [active, intervalMs])
  // When nothing runs, a stale `now` is harmless: a stopped clock does not
  // depend on the time.
  return now
}
