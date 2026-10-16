import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTheme, useThemeParts } from '../../context/ThemeContext'
import { coordToNotation } from '../../game/notation'
import type { Coord, EngineState, PieceData, PlayerId } from '../../game/types'
import type { BoardAnimation } from '../../hooks/useBoardAnimations'
import { usePointerDrag } from '../../hooks/usePointerDrag'

interface BoardViewProps {
  state: EngineState
  /** The position actually drawn — differs from `state` while reviewing. */
  viewState: EngineState
  viewer: PlayerId
  selected: Coord | null
  destinations: { slides: Coord[]; captures: Coord[] }
  animations: BoardAnimation[]
  promotedIds: string[]
  travelDestinations: Set<string>
  lastMove: { from: Coord; to: Coord } | null
  isOffender: (row: number, col: number) => boolean
  onTap: (coord: Coord) => void
  onMove: (from: Coord, to: Coord, origin?: 'drag' | 'tap') => void
  interactive: boolean
  showCoordinates?: boolean
  /** Draw the board from player two's side, for a blue-side human. */
  flipped?: boolean
  /** Analysis mode paints pieces instead of moving them. */
  onPaint?: (coord: Coord) => void
  /** Called with an animation's id when its motion settles — travel ghosts self-remove here. */
  onAnimationComplete?: (id: string) => void
}

interface Metrics {
  cell: number
  gap: number
  originX: number
  originY: number
}

/**
 * The board is theme-driven in three places: the frame around it, the piece
 * renderer, and the per-cell decoration. Everything else here — geometry,
 * hit-testing, the travelling-piece layer — is shared, because those are
 * mechanics rather than style.
 */
export default function BoardView({
  state,
  viewState,
  viewer,
  selected,
  destinations,
  animations,
  promotedIds,
  travelDestinations,
  lastMove,
  isOffender,
  onTap,
  onMove,
  interactive,
  showCoordinates = true,
  flipped = false,
  onPaint,
  onAnimationComplete,
}: BoardViewProps) {
  const { theme, isTouch } = useTheme()
  const { Piece, CellDecor, BoardFrame, EndSequence } = useThemeParts()
  const gridSize = viewState.settings.boardSize
  const boardRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<Metrics>({ cell: 60, gap: 0, originX: 0, originY: 0 })

  useEffect(() => {
    const element = boardRef.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      const gap = theme.boardGap
      const cell = (rect.width - gap * (gridSize - 1)) / gridSize
      setMetrics({ cell, gap, originX: 0, originY: 0 })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [gridSize, theme.boardGap])

  const drag = usePointerDrag({
    disabled: !interactive,
    canDragFrom: (coord) => {
      if (onPaint) return false
      const piece = viewState.board[coord.row]?.[coord.col]
      return !!piece && piece.player === state.currentPlayer
    },
    onDrop: (from, to) => onMove(from, to, 'drag'),
    onTap: (coord) => (onPaint ? onPaint(coord) : onTap(coord)),
  })

  const slideSet = new Set(destinations.slides.map((c) => `${c.row},${c.col}`))
  const captureSet = new Set(destinations.captures.map((c) => `${c.row},${c.col}`))
  const inChain = state.chain.active

  // Board coordinates stay canonical everywhere (drag hit-testing, the engine,
  // notation). Only the drawing order and the animation layer's pixel maths are
  // mirrored, so nothing downstream has to know the board is flipped.
  const toDisplay = (coord: Coord): Coord =>
    flipped ? { row: gridSize - 1 - coord.row, col: gridSize - 1 - coord.col } : coord

  const positionOf = (coord: Coord) => {
    const display = toDisplay(coord)
    return {
      left: display.col * (metrics.cell + metrics.gap),
      top: display.row * (metrics.cell + metrics.gap),
    }
  }

  const draggedKey = drag.drag ? `${drag.drag.from.row},${drag.drag.from.col}` : null

  return (
    <div className="dam-board-wrap">
      <BoardFrame gridSize={gridSize} outcome={state.status}>
        <div
          ref={boardRef}
          className="dam-board"
          style={{
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            gridTemplateRows: `repeat(${gridSize}, 1fr)`,
          }}
        >
          {Array.from({ length: gridSize }).flatMap((_, displayRow) =>
            Array.from({ length: gridSize }).map((__, displayCol) => {
              const row = flipped ? gridSize - 1 - displayRow : displayRow
              const col = flipped ? gridSize - 1 - displayCol : displayCol
              const key = `${row},${col}`
              const piece = viewState.board[row]?.[col] ?? null
              const isLight = (row + col) % 2 === 0
              const isSelected = selected?.row === row && selected?.col === col
              const isCaptureTarget = captureSet.has(key)
              const offender = isOffender(row, col)

              return (
                <div
                  key={key}
                  data-row={row}
                  data-col={col}
                  className={[
                    'dam-cell',
                    isLight ? 'is-light' : 'is-dark',
                    offender && 'is-offender',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onPointerDown={(event) => drag.start(event, { row, col })}
                  onClick={() => {
                    // Clicking an empty square never starts a drag, so it needs
                    // its own path to reach the tap handler.
                    if (!piece) (onPaint ? onPaint({ row, col }) : onTap({ row, col }))
                  }}
                >
                  <CellDecor
                    row={row}
                    col={col}
                    isLight={isLight}
                    isTarget={slideSet.has(key)}
                    isCaptureTarget={isCaptureTarget}
                    isChainTarget={inChain && isCaptureTarget}
                    isSelected={!!isSelected}
                    isOffender={offender}
                    isLastMove={
                      !!lastMove &&
                      ((lastMove.from.row === row && lastMove.from.col === col) ||
                        (lastMove.to.row === row && lastMove.to.col === col))
                    }
                  />

                  {piece && !travelDestinations.has(key) && draggedKey !== key && (
                    <motion.div
                      className={`dam-piece-slot ${interactive ? '' : 'is-static'}`}
                      whileHover={interactive && !isTouch ? { scale: theme.motion.hoverScale } : undefined}
                      whileTap={interactive ? { scale: theme.motion.tapScale } : undefined}
                      transition={{ duration: 0.12 }}
                    >
                      <Piece
                        piece={piece}
                        selected={!!isSelected}
                        offender={offender}
                        justPromoted={promotedIds.includes(piece.id)}
                        interactive={interactive}
                      />
                    </motion.div>
                  )}

                  {showCoordinates && displayCol === 0 && (
                    <span className="dam-coords-rank">{gridSize - row}</span>
                  )}
                  {showCoordinates && displayRow === gridSize - 1 && (
                    <span className="dam-coords-file">
                      {coordToNotation(row, col, gridSize)[0]}
                    </span>
                  )}
                </div>
              )
            }),
          )}

          <div className="dam-anim-layer">
            <AnimatePresence>
              {animations.map((animation) => (
                <AnimatedPiece
                  key={animation.id}
                  animation={animation}
                  metrics={metrics}
                  positionOf={positionOf}
                  PieceComponent={Piece}
                  moveTransition={theme.motion.moveTransition}
                  captureDurationMs={theme.motion.captureDurationMs}
                  onComplete={onAnimationComplete}
                />
              ))}
            </AnimatePresence>
          </div>

          <EndSequence
            status={state.status}
            survivors={collectSurvivors(state).map((entry) => ({
              ...entry,
              at: toDisplay(entry.at),
            }))}
            gridSize={gridSize}
            viewer={viewer}
          />
        </div>
      </BoardFrame>

      {drag.drag && (
        <DragGhost
          coord={drag.drag.from}
          x={drag.drag.x}
          y={drag.drag.y}
          size={metrics.cell}
          piece={viewState.board[drag.drag.from.row]?.[drag.drag.from.col] ?? null}
          PieceComponent={Piece}
        />
      )}
    </div>
  )
}

function collectSurvivors(state: EngineState) {
  const out: Array<{ piece: PieceData; at: Coord }> = []
  state.board.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell) out.push({ piece: cell, at: { row: r, col: c } })
    }),
  )
  return out
}

interface AnimatedPieceProps {
  animation: BoardAnimation
  metrics: Metrics
  positionOf: (coord: Coord) => { left: number; top: number }
  PieceComponent: ReturnType<typeof useThemeParts>['Piece']
  moveTransition: { type: 'spring'; stiffness: number; damping: number } | { duration: number }
  captureDurationMs: number
  onComplete?: (id: string) => void
}

function AnimatedPiece({
  animation,
  metrics,
  positionOf,
  PieceComponent,
  moveTransition,
  captureDurationMs,
  onComplete,
}: AnimatedPieceProps) {
  if (animation.kind === 'promotion') return null

  const target = animation.kind === 'travel' ? animation.to : animation.at
  const origin = animation.kind === 'travel' ? animation.from : animation.at
  const start = positionOf(origin)
  const end = positionOf(target)
  const isTravel = animation.kind === 'travel'

  return (
    <motion.div
      className="dam-anim-piece"
      style={{ left: start.left, top: start.top, width: metrics.cell, height: metrics.cell }}
      initial={isTravel ? { x: 0, y: 0, opacity: 1 } : { scale: 1, opacity: 1 }}
      animate={
        isTravel
          ? { x: end.left - start.left, y: end.top - start.top }
          : { scale: 0.2, opacity: 0, rotate: animation.kind === 'call' ? 180 : 0 }
      }
      exit={{ opacity: 0 }}
      transition={isTravel ? moveTransition : { duration: captureDurationMs / 1000 }}
      onAnimationComplete={isTravel ? () => onComplete?.(animation.id) : undefined}
    >
      <PieceComponent piece={animation.piece} />
    </motion.div>
  )
}

interface DragGhostProps {
  coord: Coord
  x: number
  y: number
  size: number
  piece: PieceData | null
  PieceComponent: ReturnType<typeof useThemeParts>['Piece']
}

function DragGhost({ x, y, size, piece, PieceComponent }: DragGhostProps) {
  if (!piece) return null
  return (
    <div className="dam-drag-ghost" style={{ left: x, top: y, width: size * 1.1, height: size * 1.1 }}>
      <PieceComponent piece={piece} />
    </div>
  )
}
