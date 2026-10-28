import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { MoveRecord } from '../../game/types'
import type { MatchController } from '../../hooks/useMatchController'
import { spokenMove } from '../../lib/describe'
import { IconButton } from '../ui/Button'

/**
 * Notation list plus review controls. Calls, resignations, timeouts and agreed
 * draws are not moves in the turn sequence, so they get full-width note rows.
 * Clicking a move shows the board as it was after it; the arrow keys step
 * through the game while the list has focus.
 */
export default function MoveList({ controller }: { controller: MatchController }) {
  const { moveRows, viewIndex, lastIndex, goTo, indexAfterPly, names } = controller
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the newest move in view as the game goes on (only when not reviewing).
  useEffect(() => {
    if (controller.reviewing) return
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [moveRows.length, controller.reviewing])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(viewIndex - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(viewIndex + 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      goTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      goTo(null)
    }
  }

  const cell = (record: MoveRecord | undefined) => {
    if (!record) return <span className="moves__cell is-empty" aria-hidden />
    const index = indexAfterPly(record.ply)
    return (
      <button
        type="button"
        className={`moves__cell ${index === viewIndex ? 'is-current' : ''}`}
        aria-current={index === viewIndex ? 'step' : undefined}
        aria-label={spokenMove(record, names)}
        onClick={() => goTo(index)}
      >
        {record.notation}
      </button>
    )
  }

  return (
    <section className="moves" aria-labelledby="moves-title" onKeyDown={onKeyDown}>
      <div className="moves__head">
        <h2 id="moves-title" className="moves__title">
          Moves
        </h2>
        <span className="moves__count">{controller.position.moves.length > 0 ? `${viewIndex} / ${lastIndex}` : ''}</span>
      </div>

      <div
        ref={listRef}
        className="moves__list"
        tabIndex={moveRows.length ? 0 : -1}
        aria-label="Move list. Use the arrow keys to step through the game."
      >
        {moveRows.length === 0 ? (
          <p className="moves__empty">No moves yet.</p>
        ) : (
          <ol className="moves__rows">
            {moveRows.map((row, i) =>
              row.kind === 'note' ? (
                <li key={`note-${i}`} className="moves__note">
                  <button type="button" className="moves__note-btn" onClick={() => goTo(indexAfterPly(row.record.ply))}>
                    {spokenMove(row.record, names)}
                  </button>
                </li>
              ) : (
                <li key={`row-${row.number}-${i}`} className="moves__row">
                  <span className="moves__num" aria-hidden>
                    {row.number}.
                  </span>
                  {cell(row.player1)}
                  {cell(row.player2)}
                </li>
              ),
            )}
          </ol>
        )}
      </div>

      <div className="moves__nav" role="group" aria-label="Step through the game">
        <IconButton label="First position" icon={<ChevronsLeft size={16} />} onClick={() => goTo(0)} disabled={viewIndex === 0} />
        <IconButton
          label="Previous position"
          icon={<ChevronLeft size={16} />}
          onClick={() => goTo(viewIndex - 1)}
          disabled={viewIndex === 0}
        />
        <IconButton
          label="Next position"
          icon={<ChevronRight size={16} />}
          onClick={() => goTo(viewIndex + 1)}
          disabled={viewIndex === lastIndex}
        />
        <IconButton
          label="Latest position"
          icon={<ChevronsRight size={16} />}
          onClick={() => goTo(null)}
          disabled={viewIndex === lastIndex}
        />
      </div>
    </section>
  )
}
