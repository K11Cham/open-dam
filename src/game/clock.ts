/**
 * Clock display formatting. The clock arithmetic itself lives in the match
 * layer (src/match/clock.ts); the engine never reads time.
 *
 * Under twenty seconds the tenths are shown, as on most game clocks.
 */
export const formatClock = (ms: number): string => {
  const safe = Math.max(0, ms)
  const totalSeconds = Math.floor(safe / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (safe < 20_000) {
    const tenths = Math.floor((safe % 1000) / 100)
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
