import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useTheme, useThemeParts } from '../../context/useTheme'
import type { Destinations } from '../../game/engine'
import { coordToNotation } from '../../game/notation'
import type { Coord, EngineState, PieceData, PlayerId } from '../../game/types'
import type { BoardAnimation } from '../../hooks/useBoardAnimations'
import { usePointerDrag } from '../../hooks/usePointerDrag'

export interface BoardViewProps {
  /** The position drawn — the live one, or an earlier one while reviewing. */
  position: EngineState
  /** Which side sits at the bottom of the screen. */
  orientation: PlayerId
  selected: Coord | null
  destinations: Destinations
  /** Pieces the side to move may call, by id. */
  offenderIds: ReadonlySet<string>
  animations: BoardAnimation[]
  promotedIds: string[]
  lastMove: { from: Coord; to: Coord } | null
  /** A move queued for when the turn comes back, marked on both squares. */
  premove?: { from: Coord; to: Coord } | null
  onAnimationComplete?: (id: string) => void
  /** False while reviewing, after the game, or when it is not this device's turn. */
  interactive: boolean
  /** May a drag start from this square? */
  canDragFrom: (coord: Coord) => boolean
  /** A tap, click, Enter or Space on a square. */
  onSquare: (coord: Coord) => void
  onDrop: (from: Coord, to: Coord) => void
  /** Escape pressed on the board (e.g. to drop a selection). */
  onEscape?: () => void
  /** Side whose result counts as "ours" for the end animation; null in hot seat. */
  perspective: PlayerId | null
  sideNames: Record<PlayerId, string>
  /** Accessible name for the whole board. */
  label: string
  showCoordinates?: boolean
  /** Skip the end-of-game animation (used by small example boards). */
  hideEndSequence?: boolean
}

interface Metrics {
  cell: number
  gap: number
}

const key = (c: Coord) => `${c.row},${c.col}`

/**
 * The board. Geometry, input and the travelling-piece layer are shared; the
 * frame, pieces, square decorations and end animation come from the theme.
 *
 * Input: pointer (tap or drag) and keyboard. The board is one Tab stop; arrow
 * keys move between squares (in screen directions, whichever way the board is
 * turned), Enter or Space acts on a square, Escape clears the selection. Every
 * square has a spoken label such as "c3, Red piece, selected".
 */
export default function BoardView({
  position,
  orientation,
  selected,
  destinations,
  offenderIds,
  animations,
  promotedIds,
  lastMove,
  premove = null,
  onAnimationComplete,
  interactive,
  canDragFrom,
  onSquare,
  onDrop,
  onEscape,
  perspective,
  sideNames,
  label,
  showCoordinates = true,
  hideEndSequence = false,
}: BoardViewProps) {
  const { theme, isTouch } = useTheme()
  const { Piece, CellDecor, BoardFrame, EndSequence } = useThemeParts()
  const size = position.settings.boardSize
  const flipped = orientation === 'player2'
  const boardRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<string, HTMLDivElement>())
  const [metrics, setMetrics] = useState<Metrics>({ cell: 0, gap: 0 })
  const [focusDisplay, setFocusDisplay] = useState({ row: Math.floor(size / 2), col: Math.floor(size / 2) })

  useEffect(() => {
    const element = boardRef.current
    if (!element) return
    const measure = () => {
      // Layout width, not the drawn width: a theme may tilt the board in 3D, which changes how wide it
      // looks but not the space the squares and travelling pieces are positioned in.
      const width = element.offsetWidth
      setMetrics({ cell: (width - theme.boardGap * (size - 1)) / size, gap: theme.boardGap })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [size, theme.boardGap])

  const { drag, start } = usePointerDrag({
    disabled: !interactive,
    canDragFrom,
    onDrop,
    onTap: onSquare,
  })

  // Board coordinates stay canonical everywhere; only drawing is mirrored.
  const toDisplay = (c: Coord): Coord => (flipped ? { row: size - 1 - c.row, col: size - 1 - c.col } : c)
  const fromDisplay = toDisplay // mirroring is its own inverse
  const pixelOf = (c: Coord) => {
    const d = toDisplay(c)
    return { left: d.col * (metrics.cell + metrics.gap), top: d.row * (metrics.cell + metrics.gap) }
  }

  const slideSet = new Set(destinations.slides.map(key))
  const captureSet = new Set(destinations.captures.map(key))
  // A square's piece is hidden only while that same piece is sliding onto it, so a slide that
  // never finished cannot hide whatever stands on its square later.
  const travelling = new Set(animations.flatMap((a) => (a.kind === 'travel' ? [`${key(a.to)}:${a.piece.id}`] : [])))
  const draggedKey = drag ? key(drag.from) : null
  const inChain = position.chain.active

  const clampedFocus = { row: Math.min(focusDisplay.row, size - 1), col: Math.min(focusDisplay.col, size - 1) }

  const describe = (coord: Coord, piece: PieceData | null) => {
    const parts = [coordToNotation(coord.row, coord.col, size)]
    parts.push(piece ? `${sideNames[piece.player]} ${piece.isKing ? 'king' : 'piece'}` : 'empty')
    if (selected && key(selected) === key(coord)) parts.push('selected')
    if (slideSet.has(key(coord))) parts.push('you can move here')
    if (captureSet.has(key(coord))) parts.push('capture lands here')
    if (piece && offenderIds.has(piece.id)) parts.push('can be called')
    if (lastMove && (key(lastMove.from) === key(coord) || key(lastMove.to) === key(coord))) parts.push('last move')
    if (premove && key(premove.from) === key(coord)) parts.push('premove from here')
    if (premove && key(premove.to) === key(coord)) parts.push('premove to here')
    return parts.join(', ')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    if (event.key in steps) {
      event.preventDefault()
      const [dr, dc] = steps[event.key]
      const next = {
        row: Math.max(0, Math.min(size - 1, clampedFocus.row + dr)),
        col: Math.max(0, Math.min(size - 1, clampedFocus.col + dc)),
      }
      setFocusDisplay(next)
      cellRefs.current.get(key(fromDisplay(next)))?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const next = { row: clampedFocus.row, col: event.key === 'Home' ? 0 : size - 1 }
      setFocusDisplay(next)
      cellRefs.current.get(key(fromDisplay(next)))?.focus()
    } else if ((event.key === 'Enter' || event.key === ' ') && interactive) {
      event.preventDefault()
      onSquare(fromDisplay(clampedFocus))
    } else if (event.key === 'Escape') {
      onEscape?.()
    }
  }

  // At the end the pieces react in a wave spreading out from the last move (or the middle, after a resignation).
  const ended = !hideEndSequence && position.status.kind !== 'playing'
  const endWinner = position.status.kind === 'win' ? position.status.winner : null
  const endOrigin = lastMove?.to ?? { row: (size - 1) / 2, col: (size - 1) / 2 }
  const endClass = (piece: PieceData) =>
    !ended ? '' : endWinner === null ? ' is-end-draw' : piece.player === endWinner ? ' is-end-winner' : ' is-end-loser'
  const endDelay = (c: Coord) => `${250 + (Math.abs(c.row - endOrigin.row) + Math.abs(c.col - endOrigin.col)) * 70}ms`

  return (
    <div className="board-wrap">
      <BoardFrame gridSize={size}>
        <div
          ref={boardRef}
          role="grid"
          aria-label={label}
          aria-rowcount={size}
          aria-colcount={size}
          className={`board ${interactive ? 'is-interactive' : ''}`}
          style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gridTemplateRows: `repeat(${size}, 1fr)` }}
          onKeyDown={onKeyDown}
        >
          {Array.from({ length: size }, (_, displayRow) => (
            <div role="row" key={displayRow} className="board__row" aria-rowindex={displayRow + 1}>
              {Array.from({ length: size }, (__, displayCol) => {
                const coord = fromDisplay({ row: displayRow, col: displayCol })
                const k = key(coord)
                const piece = position.board[coord.row]?.[coord.col] ?? null
                const isLight = (coord.row + coord.col) % 2 === 0
                const isSelected = !!selected && key(selected) === k
                const isCaptureTarget = captureSet.has(k)
                const isOffender = !!piece && offenderIds.has(piece.id)
                const isFocusCell = displayRow === clampedFocus.row && displayCol === clampedFocus.col
                const isLastMove = !!lastMove && (key(lastMove.from) === k || key(lastMove.to) === k)
                const isPremove = !!premove && (key(premove.from) === k || key(premove.to) === k)

                return (
                  <div
                    key={k}
                    ref={(el) => {
                      if (el) cellRefs.current.set(k, el)
                      else cellRefs.current.delete(k)
                    }}
                    role="gridcell"
                    aria-colindex={displayCol + 1}
                    aria-selected={isSelected}
                    aria-label={describe(coord, piece)}
                    tabIndex={isFocusCell ? 0 : -1}
                    data-row={coord.row}
                    data-col={coord.col}
                    className={[
                      'cell',
                      isLight ? 'is-light' : 'is-dark',
                      isOffender && 'is-offender',
                      isSelected && 'is-selected',
                      isPremove && 'is-premove',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onFocus={() => setFocusDisplay({ row: displayRow, col: displayCol })}
                    onPointerDown={(event) => start(event, coord)}
                    onClick={() => {
                      // Pieces that can be dragged report taps through the drag
                      // handler; everything else (empty squares, pieces that
                      // cannot move, offenders to call) is handled here.
                      if (!interactive || (piece && canDragFrom(coord))) return
                      onSquare(coord)
                    }}
                  >
                    <CellDecor
                      row={coord.row}
                      col={coord.col}
                      isLight={isLight}
                      isTarget={slideSet.has(k)}
                      isCaptureTarget={isCaptureTarget}
                      isChainTarget={inChain && isCaptureTarget}
                      isSelected={isSelected}
                      isOffender={isOffender}
                      isLastMove={isLastMove}
                    />

                    {piece && !travelling.has(`${k}:${piece.id}`) && draggedKey !== k && (
                      <motion.div
                        // The press effect is CSS (:active), not framer-motion's whileTap: whileTap makes
                        // the element focusable, which turned every movable piece into its own Tab stop.
                        className={
                          (interactive && canDragFrom(coord) ? 'piece-slot is-pressable' : 'piece-slot') + endClass(piece)
                        }
                        style={{ '--tap-scale': theme.motion.tapScale, '--end-delay': endDelay(coord) } as CSSProperties}
                        whileHover={
                          interactive && !isTouch && canDragFrom(coord) ? { scale: theme.motion.hoverScale } : undefined
                        }
                        transition={{ duration: 0.12 }}
                      >
                        <Piece
                          piece={piece}
                          selected={isSelected}
                          offender={isOffender}
                          justPromoted={promotedIds.includes(piece.id)}
                        />
                      </motion.div>
                    )}

                    {showCoordinates && displayCol === 0 && (
                      <span className="coord coord--rank" aria-hidden>
                        {size - coord.row}
                      </span>
                    )}
                    {showCoordinates && displayRow === size - 1 && (
                      <span className="coord coord--file" aria-hidden>
                        {String.fromCharCode(97 + coord.col)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          <div className="board__anim-layer" aria-hidden>
            <AnimatePresence>
              {metrics.cell > 0 &&
                animations.map((animation) => {
                  const isTravel = animation.kind === 'travel'
                  const origin = isTravel ? animation.from : animation.at
                  const target = isTravel ? animation.to : animation.at
                  const startPx = pixelOf(origin)
                  const endPx = pixelOf(target)
                  return (
                    <motion.div
                      key={animation.id}
                      className="board__anim-piece"
                      style={{ left: startPx.left, top: startPx.top, width: metrics.cell, height: metrics.cell }}
                      initial={isTravel ? { x: 0, y: 0 } : { scale: 1, opacity: 1 }}
                      animate={
                        isTravel
                          ? { x: endPx.left - startPx.left, y: endPx.top - startPx.top }
                          : { scale: 0.2, opacity: 0, rotate: animation.kind === 'call' ? 180 : 0 }
                      }
                      exit={{ opacity: 0 }}
                      transition={isTravel ? theme.motion.moveTransition : { duration: theme.motion.captureDurationMs / 1000 }}
                      onAnimationComplete={isTravel ? () => onAnimationComplete?.(animation.id) : undefined}
                    >
                      <Piece piece={animation.piece} />
                    </motion.div>
                  )
                })}
            </AnimatePresence>
          </div>

          {!hideEndSequence && <EndSequence status={position.status} gridSize={size} perspective={perspective} />}
        </div>
      </BoardFrame>

      {drag && metrics.cell > 0 && (
        <div
          className="board__drag-ghost"
          style={{ left: drag.x, top: drag.y, width: metrics.cell * 1.1, height: metrics.cell * 1.1 }}
          aria-hidden
        >
          {position.board[drag.from.row]?.[drag.from.col] && <Piece piece={position.board[drag.from.row][drag.from.col]!} />}
        </div>
      )}
    </div>
  )
}
