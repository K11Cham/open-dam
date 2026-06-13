import { useRef, useState, useEffect } from 'react'
import { useGameContext } from '../context/GameContext'
import { useTheme } from '../context/ThemeContext'
import { motion } from 'framer-motion'
import { Star, ChevronLeft, ChevronRight } from 'lucide-react'
import Board from './Board'
import PlayerBar from './PlayerBar'
import GameEndModal from './GameEndModal'
import MoveHistory from './MoveHistory'

interface GameProps {
  gridSize: number
}

const SIDEBAR_WIDTH = 300
const BOARD_MIN = 280 // minimum comfortable board width before we stack

export default function Game({ gridSize }: GameProps) {
  const { theme } = useTheme()
  const gameLogic = useGameContext()

  const layoutRef = useRef<HTMLDivElement>(null)
  const [sidebarFits, setSidebarFits] = useState(false)

  useEffect(() => {
    const check = () => {
      if (!layoutRef.current) return
      const availW = layoutRef.current.getBoundingClientRect().width
      // Sidebar fits if there's room for both the min board size and the sidebar with some padding
      setSidebarFits(availW >= BOARD_MIN + SIDEBAR_WIDTH + 32)
    }
    check()
    const ro = new ResizeObserver(check)
    if (layoutRef.current) ro.observe(layoutRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      className="flex flex-1"
      onDragOver={gameLogic.handleRootDragOver}
      onClick={gameLogic.handleBoardClick}
      style={{ minHeight: 0 }}
    >
      {/* Floating drag preview */}
      {gameLogic.dragPos && gameLogic.draggedPiece && (
        <div
          style={{
            position: 'fixed',
            left: gameLogic.dragPos.x,
            top: gameLogic.dragPos.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <motion.div
            className={`piece w-[60px] h-[60px] rounded-full shadow-md cursor-grab border-[3px] ${
              gameLogic.board[gameLogic.draggedPiece.row][gameLogic.draggedPiece.col]?.isKing
                ? 'king relative'
                : ''
            }`}
            style={{
              backgroundColor:
                gameLogic.board[gameLogic.draggedPiece.row][gameLogic.draggedPiece.col]?.player ===
                'player1'
                  ? theme.p1
                  : theme.p2,
              borderColor:
                gameLogic.board[gameLogic.draggedPiece.row][gameLogic.draggedPiece.col]?.player ===
                'player1'
                  ? theme.p1Border
                  : theme.p2Border,
              boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 4px 10px rgba(0,0,0,0.35)',
              ...(gameLogic.board[gameLogic.draggedPiece.row][gameLogic.draggedPiece.col]
                ?.isKing && {
                boxShadow: `inset 0 0 0 3px ${theme.king}, 0 12px 32px rgba(0,0,0,0.55), 0 4px 10px rgba(0,0,0,0.35)`,
              }),
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.35, opacity: 1 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {gameLogic.board[gameLogic.draggedPiece.row][gameLogic.draggedPiece.col]?.isKing && (
              <Star
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1.5rem] h-[1.5rem] drop-shadow-lg select-none pointer-events-none"
                style={{ color: theme.king }}
              />
            )}
          </motion.div>
        </div>
      )}

      {/*
        Main layout — direction is decided dynamically:
        - sidebarFits=true  → row: board takes flex-1, sidebar is fixed 300px beside it
        - sidebarFits=false → column: board column is viewport-height so it fills the screen,
                              sidebar goes below and is reached by scrolling
      */}
      <div
        ref={layoutRef}
        className="flex flex-1"
        style={{
          flexDirection: sidebarFits ? 'row' : 'column',
          // When sidebar fits, the whole row is constrained to available height (no scroll needed)
          overflow: sidebarFits ? 'hidden' : undefined,
        }}
      >
        {/* Board column — fills remaining space in row mode, full viewport height in column mode */}
        <div
          className="flex flex-col items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '16px',
            // Row mode: flex-1 so it takes up all space beside the sidebar
            flex: sidebarFits ? '1 1 0' : undefined,
            // Column mode: give it exactly the available viewport height so board is fully visible
            // before scrolling. GameLayout sets main to overflow-y-auto, so sidebar scrolls below.
            width: sidebarFits ? undefined : '100%',
            height: sidebarFits ? '100%' : '100svh',
            minHeight: 0,
            boxSizing: 'border-box',
          }}
        >
          <div
            className="flex flex-col w-full"
            style={{ maxHeight: '100%', height: '100%' }}
          >
            <BoardStack gridSize={gridSize} />
          </div>
        </div>

        {/* Sidebar — fixed width beside board in row mode, full width below board in column mode */}
        <div
          style={{
            width: sidebarFits ? `${SIDEBAR_WIDTH}px` : '100%',
            flexShrink: 0,
            // Row mode: full height alongside the board
            height: sidebarFits ? '100%' : '420px',
            borderLeft: sidebarFits
              ? `1px solid ${theme.border}30`
              : undefined,
            borderTop: !sidebarFits
              ? `1px solid ${theme.border}30`
              : undefined,
          }}
        >
          <MoveHistory />
        </div>
      </div>

      <GameEndModal />
    </div>
  )
}

// Separate component so we can use a ref to measure available height
function BoardStack({ gridSize }: { gridSize: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const topBarRef = useRef<HTMLDivElement>(null)
  const bottomBarRef = useRef<HTMLDivElement>(null)
  const [boardSizePx, setBoardSizePx] = useState<number | null>(null)
  const { theme } = useTheme()
  const { currentMoveIndex, goToPreviousMove, goToNextMove, moves } = useGameContext()

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current
      const top = topBarRef.current
      const bot = bottomBarRef.current
      if (!el || !top || !bot) return

      const availH = el.getBoundingClientRect().height
      const topH = top.getBoundingClientRect().height
      const botH = bot.getBoundingClientRect().height
      const availW = el.getBoundingClientRect().width

      const maxBoardH = availH - topH - botH
      const size = Math.min(maxBoardH, availW)
      setBoardSizePx(size > 0 ? size : null)
    }

    measure()
    const ro = new ResizeObserver(measure)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="flex flex-col items-center h-full w-full">
      <div ref={topBarRef} style={{ width: boardSizePx ? `${boardSizePx}px` : '100%' }}>
        <PlayerBar player="player2" position="top" />
      </div>

      <div
        style={{
          width: boardSizePx ? `${boardSizePx}px` : '100%',
          height: boardSizePx ? `${boardSizePx}px` : undefined,
          flex: boardSizePx ? undefined : '1',
          aspectRatio: '1/1',
          minHeight: 0,
          margin: 0,
        }}
      >
        <Board gridSize={gridSize} />
      </div>

      <div ref={bottomBarRef} style={{ width: boardSizePx ? `${boardSizePx}px` : '100%' }}>
        <PlayerBar player="player1" position="bottom" />
      </div>

      {/* Navigation buttons under the board */}
      <div className="flex items-center justify-center gap-2 mt-3">
        <button
          onClick={goToPreviousMove}
          disabled={currentMoveIndex === -1}
          className="flex items-center justify-center px-3 py-1 text-xs font-medium cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-full"
          style={{
            backgroundColor:
              currentMoveIndex !== -1 ? theme.surface + '70' : theme.border + '40',
            color:
              currentMoveIndex !== -1 ? theme.text + '90' : theme.textMuted + '60',
            border: `1px solid ${theme.border}40`,
          }}
          onMouseEnter={(e) => {
            if (currentMoveIndex !== -1) {
              e.currentTarget.style.backgroundColor = theme.accent + '60'
              e.currentTarget.style.color = theme.accent
              e.currentTarget.style.borderColor = theme.accent + '80'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor =
              currentMoveIndex !== -1 ? theme.surface + '70' : theme.border + '40'
            e.currentTarget.style.color =
              currentMoveIndex !== -1 ? theme.text + '90' : theme.textMuted + '60'
            e.currentTarget.style.borderColor = theme.border + '40'
          }}
          title="Previous move"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-mono" style={{ color: theme.textMuted + '80' }}>
          {currentMoveIndex === -1 ? moves.length : currentMoveIndex + 1} / {moves.length}
        </span>
        <button
          onClick={goToNextMove}
          disabled={currentMoveIndex === moves.length - 1}
          className="flex items-center justify-center px-3 py-1 text-xs font-medium cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-full"
          style={{
            backgroundColor:
              currentMoveIndex !== moves.length - 1 ? theme.surface + '70' : theme.border + '40',
            color:
              currentMoveIndex !== moves.length - 1 ? theme.text + '90' : theme.textMuted + '60',
            border: `1px solid ${theme.border}40`,
          }}
          onMouseEnter={(e) => {
            if (currentMoveIndex !== moves.length - 1) {
              e.currentTarget.style.backgroundColor = theme.accent + '60'
              e.currentTarget.style.color = theme.accent
              e.currentTarget.style.borderColor = theme.accent + '80'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor =
              currentMoveIndex !== moves.length - 1 ? theme.surface + '70' : theme.border + '40'
            e.currentTarget.style.color =
              currentMoveIndex !== moves.length - 1 ? theme.text + '90' : theme.textMuted + '60'
            e.currentTarget.style.borderColor = theme.border + '40'
          }}
          title="Next move"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}