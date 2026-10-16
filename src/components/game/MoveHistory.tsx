import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { MoveRecord } from '../../game/types'
import type { GameController } from '../../hooks/useGameLogic'

interface MoveHistoryProps {
  controller: GameController
}

/**
 * Notation list plus timeline navigation.
 *
 * Calls, resignations and agreed draws are not plies in the turn sequence, so
 * they render as full-width annotation rows rather than stealing a colour's
 * column — that grouping happens in `toMoveRows`.
 */
export default function MoveHistory({ controller }: MoveHistoryProps) {
  const { moveRows, reviewIndex, timelineLength } = controller
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [moveRows.length])

  const jumpTo = (record: MoveRecord) =>
    controller.goToPly(controller.plyToTimelineIndex(record.ply))

  const activePly = reviewIndex === null ? timelineLength - 1 : reviewIndex

  const cell = (record: MoveRecord | undefined) =>
    record ? (
      <button
        type="button"
        className={`dam-move-cell ${
          controller.plyToTimelineIndex(record.ply) === activePly ? 'is-current' : ''
        }`}
        onClick={() => jumpTo(record)}
      >
        {record.notation}
      </button>
    ) : (
      <span className="dam-move-cell is-empty">—</span>
    )

  return (
    <div className="dam-side-panel">
      <div className="dam-side-panel-header">Move history</div>

      <div className="dam-move-list">
        {moveRows.length === 0 ? (
          <p style={{ padding: 16, fontSize: 12, color: 'var(--dam-ink-muted)', margin: 0 }}>
            No moves yet.
          </p>
        ) : (
          moveRows.map((row, index) =>
            row.kind === 'note' ? (
              <div key={`note-${index}`} className="dam-move-row is-note" style={{ padding: '6px 16px' }}>
                {describeNote(row.record)}
              </div>
            ) : (
              <div key={`row-${row.number}`} className="dam-move-row">
                <span className="dam-move-index">{row.number}.</span>
                {cell(row.player1)}
                {cell(row.player2)}
              </div>
            ),
          )
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className="dam-side-panel-nav"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: 10,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="dam-button is-small"
          onClick={() => controller.goToPly(0)}
          aria-label="Jump to start"
        >
          <SkipBack size={13} />
        </button>
        <button
          type="button"
          className="dam-button is-small"
          onClick={controller.stepBack}
          aria-label="Previous position"
        >
          <ChevronLeft size={13} />
        </button>
        <span style={{ fontFamily: 'var(--dam-font-mono)', fontSize: 11, minWidth: 54, textAlign: 'center' }}>
          {activePly} / {timelineLength - 1}
        </span>
        <button
          type="button"
          className="dam-button is-small"
          onClick={controller.stepForward}
          aria-label="Next position"
        >
          <ChevronRight size={13} />
        </button>
        <button
          type="button"
          className="dam-button is-small"
          onClick={() => controller.goToPly(null)}
          aria-label="Jump to latest"
        >
          <SkipForward size={13} />
        </button>
      </div>
    </div>
  )
}

function describeNote(record: MoveRecord): string {
  const who = record.player === 'player1' ? 'Red' : 'Blue'
  if (record.kind === 'call') return `${who} called ${record.notation}`
  if (record.kind === 'resign') return `${who} resigned`
  return 'Draw agreed'
}
