import { useEffect, useRef } from 'react'
import { useGameContext } from '../context/GameContext'
import { useTheme } from '../context/ThemeContext'

export default function MoveHistory() {
  const { moves } = useGameContext()
  const { theme } = useTheme()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [moves.length])

  // Pair moves into rows: [red_move, blue_move?]
  const rows: { index: number; red?: typeof moves[0]; blue?: typeof moves[0] }[] = []
  let i = 0
  let pairIndex = 1
  while (i < moves.length) {
    const red = moves[i]?.player === 'player1' ? moves[i] : undefined
    const blue = moves[i]?.player === 'player2' ? moves[i] : undefined

    if (red) {
      const nextBlue = moves[i + 1]?.player === 'player2' ? moves[i + 1] : undefined
      rows.push({ index: pairIndex, red, blue: nextBlue })
      i += nextBlue ? 2 : 1
    } else if (blue) {
      // Game started with blue (rare) — show as-is
      rows.push({ index: pairIndex, red: undefined, blue })
      i++
    } else {
      i++
    }
    pairIndex++
  }

  return (
    <div
      className="flex flex-col w-full shrink-0 h-full"
      style={{ 
        backgroundColor: theme.surface + '30',
        borderLeft: `1px solid ${theme.border}20`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 shrink-0"
        style={{ borderBottom: `1px solid ${theme.border}15` }}
      >
        <h3 className="text-sm font-semibold tracking-wide" style={{ color: theme.textMuted + '90' }}>
          Move History
        </h3>
      </div>

      {/* Column headers */}
      <div
        className="grid px-4 py-2 shrink-0 gap-2"
        style={{
          gridTemplateColumns: '2rem 1fr 1fr',
          borderBottom: `1px solid ${theme.border}40`,
          backgroundColor: theme.bg + '40',
        }}
      >
        <span className="text-xs text-center rounded-full px-2 py-1" style={{ color: theme.textMuted + '90', backgroundColor: theme.surface + '70' }}>#</span>
        <div className="flex items-center justify-center gap-2 rounded-full px-2 py-1" style={{ backgroundColor: theme.surface + '70' }}>
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.p1 + '90' }} />
          <span className="text-xs font-medium" style={{ color: theme.textMuted + '90' }}>Red</span>
        </div>
        <div className="flex items-center justify-center gap-2 rounded-full px-2 py-1" style={{ backgroundColor: theme.surface + '70' }}>
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.p2 + '90' }} />
          <span className="text-xs font-medium" style={{ color: theme.textMuted + '90' }}>Blue</span>
        </div>
      </div>

      {/* Move rows */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-xs px-5 py-4 text-center" style={{ color: theme.textMuted + '70' }}>No moves yet</p>
        ) : (
          rows.map((row, ri) => (
            <div
              key={ri}
              className="grid px-4 py-2 mx-3 my-1 rounded-full min-w-[200px] gap-2"
              style={{
                gridTemplateColumns: '2rem 1fr 1fr',
                backgroundColor: ri % 2 === 0 ? 'transparent' : theme.bg + '30',
              }}
            >
              {/* Move number */}
              <span className="text-xs font-mono text-center rounded-full px-2 py-1" style={{ color: theme.textMuted + '80', backgroundColor: theme.surface + '60' }}>
                {row.index}
              </span>

              {/* Red move */}
              <span
                className="text-xs font-mono text-center rounded-full px-2 py-1"
                style={{ color: row.red ? theme.p1 + '95' : theme.textMuted + '60', backgroundColor: row.red ? theme.p1 + '40' : theme.surface + '60' }}
              >
                {row.red ? `${row.red.from}→${row.red.to}${row.red.isCapture ? '×' : ''}` : '—'}
              </span>

              {/* Blue move */}
              <span
                className="text-xs font-mono text-center rounded-full px-2 py-1"
                style={{ color: row.blue ? theme.p2 + '95' : theme.textMuted + '60', backgroundColor: row.blue ? theme.p2 + '40' : theme.surface + '60' }}
              >
                {row.blue ? `${row.blue.from}→${row.blue.to}${row.blue.isCapture ? '×' : ''}` : '—'}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}