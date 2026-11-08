import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EngineState } from '../../game/types'
import { GRACE_MS, missingPieces } from '../../lib/boardDebug'
import type { Mismatch } from '../../lib/boardDebug'

/**
 * A check for the "pieces disappear" report, switched on with `?debug=board`
 * in the address (it stays on for the tab until `?debug=off`). Every
 * animation frame it compares the engine's position with what is drawn: each
 * piece must have a visible `.piece-slot` on its square, or be in flight to
 * it on the animation layer. A piece missing for longer than a slide can take
 * is logged with the moves so far, on screen and in the console, so a
 * player who sees it happen can copy the report.
 *
 * It cannot see what the GPU draws: a piece whose element is in place and
 * visible by every measure, but not painted (a dropped 3D layer), passes.
 */

export default function BoardDebug({
  position,
  boardRef,
}: {
  position: EngineState
  boardRef: RefObject<HTMLDivElement | null>
}) {
  const [log, setLog] = useState<Mismatch[]>([])
  const positionRef = useRef(position)
  useEffect(() => {
    positionRef.current = position
  }, [position])

  useEffect(() => {
    let frame = 0
    const since = new Map<string, number>()
    const reported = new Set<string>()
    const check = (now: number) => {
      const board = boardRef.current
      if (board) {
        const current = positionRef.current
        const missing = missingPieces(current, board)
        for (const square of [...since.keys()]) if (!missing.includes(square)) since.delete(square)
        for (const square of missing) if (!since.has(square)) since.set(square, now)
        const overdue = missing.filter((square) => now - (since.get(square) ?? now) > GRACE_MS)
        const key = `${current.moves.length}:${overdue.join(',')}`
        if (overdue.length > 0 && !reported.has(key)) {
          reported.add(key)
          const entry: Mismatch = {
            at: new Date().toISOString(),
            squares: overdue,
            moves: current.moves.map((move) => move.notation).join(' '),
          }
          console.warn('[open-dam board check] a piece is not drawn', entry)
          setLog((previous) => [...previous.slice(-19), entry])
        }
      }
      frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    return () => cancelAnimationFrame(frame)
  }, [boardRef])

  const copy = () => void navigator.clipboard?.writeText(JSON.stringify({ userAgent: navigator.userAgent, log }, null, 2))

  return (
    <div className="board-debug" role="status" aria-label="Board check">
      <strong>Board check</strong>{' '}
      {log.length === 0 ? (
        'every piece drawn'
      ) : (
        <>
          {log.length} {log.length === 1 ? 'problem' : 'problems'}; last: {log.at(-1)!.squares.join(', ')}{' '}
          <button type="button" onClick={copy}>
            Copy report
          </button>
        </>
      )}
    </div>
  )
}
