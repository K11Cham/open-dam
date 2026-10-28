import { ArrowLeftRight, Eraser, Megaphone, Redo2, RotateCcw, SkipForward, Undo2 } from 'lucide-react'
import { useState } from 'react'
import BoardView from '../components/board/BoardView'
import AppShell from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import { useToast } from '../components/ui/Toasts'
import { useSideNames, useTheme, useThemeParts } from '../context/useTheme'
import { opponentOf } from '../game/board'
import { canCall, createInitialState } from '../game/engine'
import { positionFromAscii, positionToAscii } from '../game/position'
import type { BoardSize, PlayerId } from '../game/types'
import { emptyAnalysisPosition, useAnalysisBoard } from '../hooks/useAnalysisBoard'
import { useBoardAnimations } from '../hooks/useBoardAnimations'
import { outcomeReason } from '../lib/describe'
import { usePageTitle } from '../lib/usePageTitle'

type Tool = 'move' | 'p1' | 'p1k' | 'p2' | 'p2k' | 'erase'

/**
 * Free board for studying positions. Place pieces with the tools, choose who
 * moves, then play it out under the real rules. The position code can be
 * copied and pasted to share a position.
 */
export default function AnalysisPage() {
  usePageTitle('Analysis')
  const { theme } = useTheme()
  const { Piece } = useThemeParts()
  const sideNames = useSideNames()
  const toast = useToast()
  const animations = useBoardAnimations(theme.motion.captureDurationMs)
  const board = useAnalysisBoard(animations.ingest, (message) => toast.show(message, 'error'))
  const [tool, setTool] = useState<Tool>('move')
  const [flipped, setFlipped] = useState(false)
  const [code, setCode] = useState('')
  const { position } = board
  const size = position.settings.boardSize

  const paintWith = (t: Tool) =>
    t === 'erase'
      ? null
      : { player: (t.startsWith('p1') ? 'player1' : 'player2') as PlayerId, isKing: t.endsWith('k') }

  const onSquare = (coord: { row: number; col: number }) => {
    if (tool === 'move') board.onSquare(coord)
    else board.paint(coord, paintWith(tool))
  }

  const tools: Array<{ id: Tool; label: string }> = [
    { id: 'p1', label: `${sideNames.player1} piece` },
    { id: 'p1k', label: `${sideNames.player1} king` },
    { id: 'p2', label: `${sideNames.player2} piece` },
    { id: 'p2k', label: `${sideNames.player2} king` },
  ]

  const loadCode = () => {
    try {
      const rows = code.trim().split(/\s+/)
      board.load(positionFromAscii(rows, position.currentPlayer))
      toast.show('Position loaded.', 'success')
    } catch (error) {
      toast.show(error instanceof Error ? error.message.replace('positionFromAscii: ', '') : 'That position code could not be read.', 'error')
    }
  }

  const copyCode = async () => {
    const text = positionToAscii(position)
    setCode(text)
    try {
      await navigator.clipboard.writeText(text)
      toast.show('Position code copied.', 'success')
    } catch {
      toast.show('Copy it from the box below.')
    }
  }

  const callable = canCall(position)

  return (
    <AppShell wide>
      <div className="page page--wide">
        <header className="page-head">
          <p className="eyebrow">Study</p>
          <h1 className="page-title">Analysis board</h1>
          <p className="page-lede">Set up any position and play it out. Nothing here is saved or rated.</p>
        </header>

        <div className="analysis">
          <div className="analysis__board">
            <BoardView
              position={position}
              orientation={flipped ? 'player2' : 'player1'}
              selected={tool === 'move' ? board.selected : null}
              destinations={tool === 'move' ? board.destinations : { slides: [], captures: [] }}
              offenderIds={new Set(callable ? position.offenders.map((o) => o.pieceId) : [])}
              animations={animations.animations}
              promotedIds={animations.promotedIds}
              lastMove={animations.lastMove}
              onAnimationComplete={animations.complete}
              interactive
              canDragFrom={(c) =>
                tool === 'move' &&
                position.board[c.row]?.[c.col]?.player === position.currentPlayer &&
                (!position.chain.active || (position.chain.at?.row === c.row && position.chain.at?.col === c.col))
              }
              onSquare={onSquare}
              onDrop={(from, to) => board.act({ type: 'move', from, to })}
              onEscape={board.deselect}
              perspective={null}
              sideNames={sideNames}
              label={`Analysis board, ${size} by ${size}. ${sideNames[position.currentPlayer]} to move.`}
              hideEndSequence
            />
          </div>

          <div className="analysis__side">
            <Panel as="section" aria-labelledby="turn-h">
              <h2 id="turn-h" className="panel__title">
                {sideNames[position.currentPlayer]} to move
              </h2>
              {board.verdict.kind !== 'playing' && (
                <p className="panel__text">
                  In a real game this would be over: {outcomeReason(board.verdict, position.settings, sideNames)}
                </p>
              )}
              <div className="panel__actions">
                {callable && (
                  <Button variant="primary" size="sm" icon={<Megaphone size={15} />} onClick={() => board.act({ type: 'call', pieceId: position.offenders[0].pieceId })}>
                    Call {sideNames[opponentOf(position.currentPlayer)]}
                  </Button>
                )}
                {position.chain.active && (
                  <Button variant="primary" size="sm" icon={<SkipForward size={15} />} onClick={() => board.act({ type: 'end-chain' })}>
                    End turn
                  </Button>
                )}
                <Button size="sm" icon={<Undo2 size={15} />} onClick={board.undo} disabled={!board.canUndo}>
                  Undo
                </Button>
                <Button size="sm" icon={<Redo2 size={15} />} onClick={board.redo} disabled={!board.canRedo}>
                  Redo
                </Button>
                <Button size="sm" variant="ghost" icon={<ArrowLeftRight size={15} />} onClick={() => setFlipped((v) => !v)}>
                  Flip
                </Button>
              </div>
              <Segmented
                label="Side to move"
                value={position.currentPlayer}
                options={(['player1', 'player2'] as PlayerId[]).map((p) => ({ value: p, label: sideNames[p] }))}
                onChange={board.setTurn}
              />
            </Panel>

            <Panel as="section" aria-labelledby="tools-h">
              <h2 id="tools-h" className="panel__title">
                Set up
              </h2>
              <div className="palette" role="radiogroup" aria-label="Tool">
                <button type="button" role="radio" aria-checked={tool === 'move'} className={`palette__tool ${tool === 'move' ? 'is-active' : ''}`} onClick={() => setTool('move')}>
                  Play moves
                </button>
                {tools.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tool === t.id}
                    aria-label={`Place ${t.label}`}
                    title={`Place ${t.label}`}
                    className={`palette__tool palette__tool--piece ${tool === t.id ? 'is-active' : ''}`}
                    onClick={() => setTool(t.id)}
                  >
                    <Piece piece={{ id: `tool-${t.id}`, player: t.id.startsWith('p1') ? 'player1' : 'player2', isKing: t.id.endsWith('k') }} scale={0.8} />
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={tool === 'erase'}
                  aria-label="Erase"
                  title="Erase"
                  className={`palette__tool palette__tool--piece ${tool === 'erase' ? 'is-active' : ''}`}
                  onClick={() => setTool('erase')}
                >
                  <Eraser size={18} />
                </button>
              </div>
              <p className="field__help">With a piece tool, tap squares to place it; tap again to remove.</p>
              <Segmented
                label="Board size"
                value={size}
                options={([5, 6, 7, 8, 9] as BoardSize[]).map((s) => ({ value: s, label: `${s}×${s}` }))}
                onChange={(s) => board.load(emptyAnalysisPosition(s))}
              />
              <div className="panel__actions">
                <Button size="sm" icon={<RotateCcw size={15} />} onClick={() => board.load({ ...createInitialState({ boardSize: size }), isFirstMove: false })}>
                  Starting position
                </Button>
                <Button size="sm" variant="ghost" icon={<Eraser size={15} />} onClick={() => board.load(emptyAnalysisPosition(size))}>
                  Clear board
                </Button>
              </div>
            </Panel>

            <Panel as="section" aria-labelledby="code-h">
              <h2 id="code-h" className="panel__title">
                Position code
              </h2>
              <p className="field__help">
                One line per row, top first: <code>a</code>/<code>A</code> {sideNames.player1} piece/king, <code>b</code>/<code>B</code>{' '}
                {sideNames.player2}, <code>.</code> empty.
              </p>
              <label className="visually-hidden" htmlFor="position-code">
                Position code
              </label>
              <textarea
                id="position-code"
                className="input input--code"
                rows={Math.min(9, size)}
                value={code}
                placeholder={positionToAscii(position)}
                onChange={(event) => setCode(event.target.value)}
                spellCheck={false}
              />
              <div className="panel__actions">
                <Button size="sm" onClick={copyCode}>
                  Copy current
                </Button>
                <Button size="sm" onClick={loadCode} disabled={!code.trim()}>
                  Load code
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
