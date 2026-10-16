import { Eraser, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import BoardView from '../components/board/BoardView'
import AppShell from '../components/layout/AppShell'
import Button from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import { useThemeParts } from '../context/ThemeContext'
import { boardTypeForSize, makeSettings } from '../game/settings'
import type { BoardSize, PieceData, PlayerId } from '../game/types'
import { useGameLogic } from '../hooks/useGameLogic'

type Brush =
  | { kind: 'piece'; player: PlayerId; isKing: boolean }
  | { kind: 'erase' }
  | { kind: 'play' }

let paintCounter = 0

/**
 * Free board. Same engine, same legality — the only difference is that
 * `mode: 'analysis'` stops it reporting a result, so an empty side is a valid
 * position rather than a loss.
 */
export default function AnalysisPage() {
  const [boardSize, setBoardSize] = useState<BoardSize>(5)
  const [brush, setBrush] = useState<Brush>({ kind: 'play' })
  const { Piece } = useThemeParts()

  const settings = makeSettings({ boardSize, boardType: boardTypeForSize(boardSize) })
  const controller = useGameLogic({ settings, mode: 'analysis' })

  const paint = (coord: { row: number; col: number }) => {
    if (brush.kind === 'erase') {
      controller.setSquare(coord, null)
      return
    }
    if (brush.kind === 'piece') {
      const piece: PieceData = {
        player: brush.player,
        isKing: brush.isKing,
        id: `paint-${paintCounter++}`,
      }
      controller.setSquare(coord, piece)
    }
  }

  const brushes: Array<{ key: string; brush: Brush; preview: PieceData | null }> = [
    { key: 'p1', brush: { kind: 'piece', player: 'player1', isKing: false }, preview: { player: 'player1', isKing: false, id: 'sw1' } },
    { key: 'p1k', brush: { kind: 'piece', player: 'player1', isKing: true }, preview: { player: 'player1', isKing: true, id: 'sw2' } },
    { key: 'p2', brush: { kind: 'piece', player: 'player2', isKing: false }, preview: { player: 'player2', isKing: false, id: 'sw3' } },
    { key: 'p2k', brush: { kind: 'piece', player: 'player2', isKing: true }, preview: { player: 'player2', isKing: true, id: 'sw4' } },
  ]

  const brushKey =
    brush.kind === 'piece'
      ? `${brush.player === 'player1' ? 'p1' : 'p2'}${brush.isKing ? 'k' : ''}`
      : brush.kind

  return (
    <AppShell showNewGame={false}>
      <div className="dam-page">
        <div className="dam-section-head">
          <h1 className="dam-section-title">Analysis board</h1>
          <span style={{ fontSize: 12, color: 'var(--dam-ink-muted)' }}>
            No result is enforced here — set up anything and play it out.
          </span>
        </div>

        <div className="dam-analysis-layout">
          <div style={{ width: '100%', maxWidth: 620, aspectRatio: '1 / 1', position: 'relative' }}>
            <BoardView
              state={controller.state}
              viewState={controller.viewState}
              viewer="player1"
              selected={controller.selected}
              destinations={controller.destinations}
              animations={controller.animations}
              promotedIds={controller.promotedIds}
              travelDestinations={controller.travelDestinations}
              lastMove={controller.lastMove}
              isOffender={controller.isOffender}
              onTap={controller.tapCell}
              onMove={controller.move}
              interactive
              onPaint={brush.kind === 'play' ? undefined : paint}
              onAnimationComplete={controller.completeAnimation}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Panel style={{ padding: 16 }}>
              <span className="dam-section-label">Board size</span>
              <div style={{ marginTop: 8 }}>
                <Segmented
                  label="Board size"
                  value={boardSize}
                  options={([5, 6, 7, 8, 9] as BoardSize[]).map((size) => ({
                    value: size,
                    label: `${size}×${size}`,
                  }))}
                  onChange={setBoardSize}
                />
              </div>
            </Panel>

            <Panel style={{ padding: 16 }}>
              <span className="dam-section-label">Tool</span>
              <div className="dam-palette" style={{ marginTop: 10 }}>
                {brushes.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`dam-palette-swatch ${brushKey === entry.key ? 'is-active' : ''}`}
                    onClick={() => setBrush(entry.brush)}
                    aria-label={`Place ${entry.key}`}
                  >
                    {entry.preview && <Piece piece={entry.preview} scale={0.8} />}
                  </button>
                ))}
                <button
                  type="button"
                  className={`dam-palette-swatch ${brush.kind === 'erase' ? 'is-active' : ''}`}
                  onClick={() => setBrush({ kind: 'erase' })}
                  aria-label="Erase"
                >
                  <Eraser size={18} />
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <Segmented
                  label="Mode"
                  value={brush.kind === 'play' ? 'play' : 'edit'}
                  options={[
                    { value: 'play', label: 'Move pieces' },
                    { value: 'edit', label: 'Place pieces' },
                  ]}
                  onChange={(mode) =>
                    setBrush(
                      mode === 'play'
                        ? { kind: 'play' }
                        : { kind: 'piece', player: 'player1', isKing: false },
                    )
                  }
                />
              </div>
            </Panel>

            <Panel style={{ padding: 16 }}>
              <span className="dam-section-label">Side to move</span>
              <div style={{ marginTop: 8 }}>
                <Segmented
                  label="Side to move"
                  value={controller.state.currentPlayer}
                  options={[
                    { value: 'player1' as PlayerId, label: 'Red' },
                    { value: 'player2' as PlayerId, label: 'Blue' },
                  ]}
                  onChange={controller.setTurn}
                />
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="small" onClick={controller.reset}>
                  <RotateCcw size={13} />
                  Clear board
                </Button>
                {controller.state.chain.active && (
                  <Button size="small" onClick={controller.endChain}>
                    End chain
                  </Button>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
