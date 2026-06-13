import { useGameContext } from '../context/GameContext'
import { useTheme } from '../context/ThemeContext'
import Piece from './Piece'

type CellProps = {
  row: number
  col: number
  isValidMove: boolean
  isCaptureMove: boolean
  isRequiredChain: boolean
  isAnimatingDestination: boolean
}

export default function Cell({
  row,
  col,
  isValidMove,
  isCaptureMove,
  isRequiredChain,
  isAnimatingDestination,
}: CellProps) {
  const {
    board,
    selectedPiece,
    draggedPiece,
    isOffender,
    handleCellClick,
    handleCellDragOver,
    handleDrop,
    handleDragStart,
    handleDragEnd,
  } = useGameContext()
  const { theme } = useTheme()

  const piece = board[row]?.[col]
  const isLight = (row + col) % 2 === 0
  const isSelected = selectedPiece?.row === row && selectedPiece?.col === col
  const isBeingDragged = draggedPiece?.row === row && draggedPiece?.col === col
  const cellIsOffender = isOffender(row, col)

  return (
    <div
      className={`cell relative w-full h-full flex items-center justify-center outline-none transition-all duration-150`}
      style={{
        backgroundColor: isLight ? theme.highlight : theme.cell,
        ...(isSelected && {
          boxShadow: `inset 0 0 0 3px ${theme.accent}`,
        }),
        ...(cellIsOffender && {
          boxShadow: `inset 0 0 0 3px #f97316`,
        }),
      }}
      onClick={() => handleCellClick(row, col)}
      onDragOver={handleCellDragOver}
      onDrop={(e) => handleDrop(e, row, col)}
    >
      {/* Hide the real piece at the destination while a move animation is playing */}
      {piece && !isAnimatingDestination && (
        <Piece
          player={piece.player}
          isKing={piece.isKing}
          isBeingDragged={isBeingDragged}
          onDragStart={(e) => handleDragStart(e, row, col)}
          onDragEnd={handleDragEnd}
        />
      )}

      {isValidMove && !isCaptureMove && (
        <div className="absolute w-4 h-4 rounded-full animate-fade-in" style={{ backgroundColor: '#22c55e' }} />
      )}
      {isCaptureMove && !isRequiredChain && (
        <div className="absolute w-4 h-4 rounded-full animate-fade-in" style={{ backgroundColor: '#ef4444' }} />
      )}
      {isRequiredChain && (
        <div className="absolute w-5 h-5 rounded-full animate-fade-in-pulse" style={{ backgroundColor: '#fbbf24' }} />
      )}
    </div>
  )
}