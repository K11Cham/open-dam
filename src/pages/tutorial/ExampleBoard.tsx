import { useEffect, useMemo, useState } from 'react'
import BoardView from '../../components/board/BoardView'
import Button from '../../components/ui/Button'
import { makeEmptyBoard } from '../../game/board'
import { applyMove, createInitialState } from '../../game/engine'
import { notationToCoord } from '../../game/notation'
import type { Board, EngineState, PieceData, PlayerId } from '../../game/types'
import { useBoardAnimations } from '../../hooks/useBoardAnimations'
import { useTheme } from '../../context/ThemeContext'

export interface ExampleSpec {
  size: 5 | 6 | 7 | 8 | 9
  /** Rows of `.` / `a` / `A` / `b` / `B`, top row first. */
  rows: string[]
  toMove: PlayerId
  /** Moves replayed in order, as `from-to` square pairs, e.g. `c2-c3`. */
  script: Array<{ from: string; to: string; caption: string }>
}

const buildState = (spec: ExampleSpec): EngineState => {
  const base = createInitialState({ boardSize: spec.size })
  const board: Board = makeEmptyBoard(spec.size)
  let id = 0
  spec.rows.forEach((line, row) => {
    line.split('').forEach((char, col) => {
      if (char === '.') return
      const player: PlayerId = char.toLowerCase() === 'a' ? 'player1' : 'player2'
      const piece: PieceData = {
        player,
        isKing: char === char.toUpperCase(),
        id: `ex-${id++}`,
      }
      board[row][col] = piece
    })
  })
  return {
    ...base,
    board,
    currentPlayer: spec.toMove,
    isFirstMove: false,
    positionCounts: {},
  }
}

/**
 * A scripted, animated example that runs through the real engine rather than a
 * canned animation — so a tutorial example can never show an illegal move. If
 * the engine rejects a scripted step, the step is skipped and the caption says
 * so, which makes a broken example obvious instead of silent.
 */
export default function ExampleBoard({ spec }: { spec: ExampleSpec }) {
  const { theme } = useTheme()
  const initial = useMemo(() => buildState(spec), [spec])
  const [state, setState] = useState<EngineState>(initial)
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const animations = useBoardAnimations(theme.motion.captureDurationMs)

  const caption =
    step === 0 ? 'Starting position.' : (spec.script[step - 1]?.caption ?? '')

  const advance = () => {
    const move = spec.script[step]
    if (!move) return
    const from = notationToCoord(move.from, spec.size)
    const to = notationToCoord(move.to, spec.size)
    if (!from || !to) return
    const result = applyMove(state, from, to)
    if (result.error) {
      // Should not happen; surfaced rather than swallowed.
      setStep(spec.script.length)
      return
    }
    setState(result.state)
    animations.ingest(result.events)
    setStep((prev) => prev + 1)
  }

  const restart = () => {
    setState(initial)
    setStep(0)
    animations.reset()
  }

  useEffect(() => {
    if (!playing) return
    if (step >= spec.script.length) {
      setPlaying(false)
      return
    }
    const handle = window.setTimeout(advance, 1100)
    return () => window.clearTimeout(handle)
  }, [playing, step, state])

  const done = step >= spec.script.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
      <div style={{ width: '100%', aspectRatio: '1 / 1', position: 'relative' }}>
        <BoardView
          state={state}
          viewState={state}
          viewer="player1"
          selected={null}
          destinations={{ slides: [], captures: [] }}
          animations={animations.animations}
          promotedIds={animations.promotedIds}
          travelDestinations={animations.travelDestinations}
          lastMove={animations.lastMove}
          isOffender={() => false}
          onTap={() => {}}
          onMove={() => {}}
          interactive={false}
          showCoordinates
          onAnimationComplete={animations.complete}
        />
      </div>

      <p style={{ fontSize: 13, margin: 0, minHeight: '2.6em', color: 'var(--dam-ink-muted)' }}>
        {caption}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="small" onClick={advance} disabled={done}>
          Step
        </Button>
        <Button size="small" variant="primary" onClick={() => setPlaying(true)} disabled={done || playing}>
          Play
        </Button>
        <Button size="small" onClick={restart}>
          Restart
        </Button>
        <span style={{ fontSize: 12, color: 'var(--dam-ink-muted)', alignSelf: 'center' }}>
          {step} / {spec.script.length}
        </span>
      </div>
    </div>
  )
}
