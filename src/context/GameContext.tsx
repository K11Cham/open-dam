import { createContext, useContext, type ReactNode } from 'react'
import type { Piece } from '../utils/gameLogic'

interface AnimatingPiece {
  piece: Exclude<Piece, null>
  row: number
  col: number
  id: string
  type: 'capture' | 'call' | 'move'
  fromRow?: number
  fromCol?: number
}

interface Move {
  from: string
  to: string
  player: 'player1' | 'player2'
  isCapture: boolean
}

interface GameContextType {
  board: Piece[][]
  currentPlayer: 'player1' | 'player2'
  selectedPiece: { row: number; col: number } | null
  draggedPiece: { row: number; col: number } | null
  dragPos: { x: number; y: number } | null
  offenders: string[]
  undoRequest: { requester: 'player1' | 'player2' } | null
  undoUsedThisTurn: boolean
  canRequestUndo: (requester: 'player1' | 'player2') => boolean
  isInChainCapture: boolean
  winner: 'player1' | 'player2' | 'draw' | null
  handleCellClick: (row: number, col: number) => void
  handleBoardClick: () => void
  handleDragStart: (e: React.DragEvent, row: number, col: number) => void
  handleDragEnd: () => void
  handleRootDragOver: (e: React.DragEvent) => void
  handleCellDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent, toRow: number, toCol: number) => void
  resetBoard: () => void
  handleCall: () => void
  handleRequestUndo: (requester: 'player1' | 'player2') => void
  handleAcceptUndo: () => void
  handleDeclineUndo: () => void
  handleResign: () => void
  isOffender: (row: number, col: number) => boolean
  gridSize: number
  animatingPieces: AnimatingPiece[]
  moves: Move[]
  removeAnimatingPiece: (id: string) => void
  playerSide: 'player1' | 'player2'
  drawRequest: { requester: 'player1' | 'player2' } | null
  handleRequestDraw: (requester: 'player1' | 'player2') => void
  handleAcceptDraw: () => void
  handleDeclineDraw: () => void
  currentMoveIndex: number
  goToPreviousMove: () => void
  goToNextMove: () => void
  goToLatestMove: () => void
}

const GameContext = createContext<GameContextType | undefined>(undefined)

export function GameProvider({ children, value }: { children: ReactNode; value: GameContextType }) {
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGameContext() {
  const context = useContext(GameContext)
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider')
  }
  return context
}
