import { useRef, useState, useEffect } from 'react'
import Cell from './Cell'
import { useGameContext } from '../context/GameContext'
import { useTheme } from '../context/ThemeContext'
import { getCaptures } from '../utils/gameLogic'
import { Star } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type BoardProps = {
  gridSize: number
}

export default function Board({ gridSize }: BoardProps) {
  const {
    board,
    selectedPiece,
    currentPlayer,
    isInChainCapture,
    animatingPieces,
    removeAnimatingPiece
  } = useGameContext()
  const { theme } = useTheme()

  const boardRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState({
    xStride: 82,
    yStride: 82,
    originX: 2,
    originY: 2,
    cellW: 80,
  })

  useEffect(() => {
    const el = boardRef.current
    if (!el) return

    const measure = () => {
      const cells = el.querySelectorAll('.row > *')
      if (cells.length < gridSize + 1) return

      const boardRect = el.getBoundingClientRect()
      const r0c0 = cells[0].getBoundingClientRect()
      const r0c1 = cells[1].getBoundingClientRect()
      const r1c0 = cells[gridSize].getBoundingClientRect()

      setMetrics({
        xStride: r0c1.left - r0c0.left,
        yStride: r1c0.top - r0c0.top,
        originX: r0c0.left - boardRect.left,
        originY: r0c0.top - boardRect.top,
        cellW: r0c0.width,
      })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [gridSize])

  const animatingDestSet = new Set(
    animatingPieces
      .filter(p => p.type === 'move')
      .map(p => `${p.row},${p.col}`)
  )

  const getValidMoves = () => {
    if (!selectedPiece) return { moves: [], captures: [] }

    const captures = getCaptures(board, currentPlayer).filter(
      c => c.from.row === selectedPiece.row && c.from.col === selectedPiece.col
    )

    if (isInChainCapture) return { moves: [], captures }

    const moves: { row: number; col: number }[] = []
    const piece = board[selectedPiece.row][selectedPiece.col]
    if (piece) {
      if (piece.isKing) {
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        for (const [dr, dc] of directions) {
          let r = selectedPiece.row + dr
          let c = selectedPiece.col + dc
          while (r >= 0 && r < gridSize && c >= 0 && c < gridSize && board[r][c] === null) {
            moves.push({ row: r, col: c })
            r += dr; c += dc
          }
        }
      } else {
        // Regular pieces can only move forward (player1: down/dr=1, player2: up/dr=-1)
        const directions = piece.player === 'player1' ? [[1, 0], [0, -1], [0, 1]] : [[-1, 0], [0, -1], [0, 1]]
        for (const [dr, dc] of directions) {
          const newRow = selectedPiece.row + dr
          const newCol = selectedPiece.col + dc
          if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize && !board[newRow][newCol]) {
            moves.push({ row: newRow, col: newCol })
          }
        }
      }
    }

    return { moves, captures }
  }

  const { moves, captures } = getValidMoves()
  const validMoveSet = new Set(moves.map(m => `${m.row},${m.col}`))
  const captureSet = new Set(captures.map(c => `${c.to.row},${c.to.col}`))

  // Piece size relative to cell size — derived from board metrics
  const pieceSize = metrics.cellW * 0.75

  return (
    // Fill whatever size the parent (BoardStack) gives us
    <div className="w-full h-full">
      <div
        ref={boardRef}
        className="board relative grid gap-0 w-full h-full"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
          gridTemplateRows: `repeat(${gridSize}, 1fr)`,
        }}
      >
        {Array.from({ length: gridSize }).map((_, row) => (
          <div key={row} className="row contents">
            {Array.from({ length: gridSize }).map((_, col) => {
              const isValidMove = validMoveSet.has(`${row},${col}`)
              const isCaptureMove = captureSet.has(`${row},${col}`)
              const isRequiredChain = isInChainCapture && isCaptureMove
              const isAnimatingDestination = animatingDestSet.has(`${row},${col}`)

              return (
                <Cell
                  key={col}
                  row={row}
                  col={col}
                  isValidMove={isValidMove}
                  isCaptureMove={isCaptureMove}
                  isRequiredChain={isRequiredChain}
                  isAnimatingDestination={isAnimatingDestination}
                />
              )
            })}
          </div>
        ))}

        <AnimatePresence>
          {animatingPieces.map((animPiece) => {
            const playerColor = animPiece.piece.player === 'player1' ? theme.p1 : theme.p2
            const playerBorder = animPiece.piece.player === 'player1' ? theme.p1Border : theme.p2Border

            const cellPad = (metrics.cellW - pieceSize) / 2
            const left = metrics.originX + animPiece.col * metrics.xStride + cellPad
            const top = metrics.originY + animPiece.row * metrics.yStride + cellPad
            const fromLeft = animPiece.fromCol !== undefined
              ? metrics.originX + animPiece.fromCol * metrics.xStride + cellPad
              : left
            const fromTop = animPiece.fromRow !== undefined
              ? metrics.originY + animPiece.fromRow * metrics.yStride + cellPad
              : top

            const isMove = animPiece.type === 'move'

            return (
              <motion.div
                key={animPiece.id}
                className={`piece absolute rounded-full shadow-md border-[3px] ${animPiece.piece.isKing ? 'king flex items-center justify-center' : ''} pointer-events-none`}
                style={{
                  left: `${fromLeft}px`,
                  top: `${fromTop}px`,
                  width: `${pieceSize}px`,
                  height: `${pieceSize}px`,
                  zIndex: 100,
                  backgroundColor: playerColor,
                  borderColor: playerBorder,
                  ...(animPiece.piece.isKing && {
                    boxShadow: `inset 0 0 0 3px ${theme.king}, 0 4px 6px rgba(0,0,0,0.3)`,
                  }),
                }}
                initial={isMove ? { x: 0, y: 0, opacity: 1 } : { scale: 1, opacity: 1 }}
                animate={isMove
                  ? { x: left - fromLeft, y: top - fromTop, opacity: 1 }
                  : { scale: 0, opacity: 0 }
                }
                exit={{ scale: 0, opacity: 0 }}
                transition={
                  isMove
                    ? { type: 'spring', stiffness: 380, damping: 32 }
                    : { duration: 0.35, ease: [0.32, 0, 0.67, 0] }
                }
                onAnimationComplete={() => removeAnimatingPiece(animPiece.id)}
              >
                {animPiece.piece.isKing && (
                  <Star
                    style={{
                      width: `${pieceSize * 0.4}px`,
                      height: `${pieceSize * 0.4}px`,
                      color: theme.king,
                    }}
                    className="drop-shadow-lg select-none pointer-events-none"
                  />
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}