export type Piece = { player: 'player1' | 'player2'; isKing: boolean; id: string } | null
export type BoardType = 'yinyang' | 'even'

export const makeInitialBoard = (gridSize: number, boardType: BoardType = 'yinyang'): Piece[][] => {
  return boardType === 'yinyang' ? makeYinYangBoard(gridSize) : makeEvenBoard(gridSize)
}

const makeYinYangBoard = (gridSize: number): Piece[][] => {
  const center = Math.floor(gridSize / 2)
  const b: Piece[][] = []
  let pieceId = 0
  for (let row = 0; row < gridSize; row++) {
    const rowPieces: Piece[] = []
    for (let col = 0; col < gridSize; col++) {
      const isCenter = row === center && col === center
      const isPlayer2 = row < center || (row === center && col < center)
      const isPlayer1 = row > center || (row === center && col > center)
      if (isCenter) rowPieces.push(null)
      else if (isPlayer2) rowPieces.push({ player: 'player2', isKing: false, id: `p2-${pieceId++}` })
      else if (isPlayer1) rowPieces.push({ player: 'player1', isKing: false, id: `p1-${pieceId++}` })
      else rowPieces.push(null)
    }
    b.push(rowPieces)
  }
  return b
}

const makeEvenBoard = (gridSize: number): Piece[][] => {
  const b: Piece[][] = []
  let pieceId = 0
  const emptyRows = 2
  const filledRows = gridSize - emptyRows
  const player2Rows = Math.floor(filledRows / 2)
  const player1Rows = filledRows - player2Rows
  
  for (let row = 0; row < gridSize; row++) {
    const rowPieces: Piece[] = []
    for (let col = 0; col < gridSize; col++) {
      // First player2Rows rows: player2
      if (row < player2Rows) {
        rowPieces.push({ player: 'player2', isKing: false, id: `p2-${pieceId++}` })
      }
      // Middle emptyRows rows: empty
      else if (row < player2Rows + emptyRows) {
        rowPieces.push(null)
      }
      // Last rows: player1
      else {
        rowPieces.push({ player: 'player1', isKing: false, id: `p1-${pieceId++}` })
      }
    }
    b.push(rowPieces)
  }
  return b
}

export const countPieces = (b: Piece[][], player: 'player1' | 'player2'): number => {
  let count = 0
  for (let row = 0; row < b.length; row++)
    for (let col = 0; col < b[row].length; col++)
      if (b[row][col]?.player === player) count++
  return count
}

export const checkWinCondition = (b: Piece[][]): 'player1' | 'player2' | null => {
  if (countPieces(b, 'player1') === 0) return 'player2'
  else if (countPieces(b, 'player2') === 0) return 'player1'
  return null
}

export const checkDrawCondition = (b: Piece[][]): boolean => {
  const player1Count = countPieces(b, 'player1')
  const player2Count = countPieces(b, 'player2')
  
  // Both players must have exactly 1 piece
  if (player1Count !== 1 || player2Count !== 1) return false
  
  // Check if either player has any captures available
  const player1Captures = getCaptures(b, 'player1')
  const player2Captures = getCaptures(b, 'player2')
  
  if (player1Captures.length > 0 || player2Captures.length > 0) return false
  
  return true
}

// Three-fold repetition detection
export const checkThreefoldRepetition = (history: string[]): boolean => {
  if (history.length < 9) return false // Need at least 3 full rounds
  
  const currentBoard = history[history.length - 1]
  let repetitions = 1
  
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i] === currentBoard) {
      repetitions++
      if (repetitions >= 3) return true
    }
  }
  
  return false
}

// 25 moves without captures draw condition
export const checkMovesWithoutCaptures = (moves: any[]): boolean => {
  if (moves.length < 50) return false // Need at least 25 moves each (50 total)
  
  // Count moves without captures in the last 50 moves
  let nonCaptureCount = 0
  const recentMoves = moves.slice(-50)
  
  for (const move of recentMoves) {
    if (!move.isCapture) {
      nonCaptureCount++
    }
  }
  
  // If all 50 recent moves were non-captures, it's a draw
  return nonCaptureCount === 50
}

// Helper to serialize board for history tracking
export const serializeBoard = (b: Piece[][]): string => {
  return b.map(row => row.map(cell => {
    if (!cell) return '0'
    return `${cell.player[1]}${cell.isKing ? 'K' : ''}`
  }).join('')).join('|')
}

export const checkKingPromotion = (b: Piece[][], player: 'player1' | 'player2'): boolean => {
  const gridSize = b.length
  const opponentRow = player === 'player1' ? 0 : gridSize - 1
  const pieceCount = countPieces(b, player)
  let promoted = false
  
  // Auto-promote if only one piece left
  if (pieceCount === 1) {
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        if (b[row][col]?.player === player && !b[row][col]?.isKing) {
          b[row][col] = { ...b[row][col]!, isKing: true }  // FIX: preserve id
          promoted = true
        }
      }
    }
    return promoted
  }

  // Promote pieces that reach opponent's side
  for (let col = 0; col < gridSize; col++) {
    if (b[opponentRow][col]?.player === player && !b[opponentRow][col]?.isKing) {
      b[opponentRow][col] = { ...b[opponentRow][col]!, isKing: true }  // FIX: preserve id
      promoted = true
    }
  }
  return promoted
}

export const getCaptures = (b: Piece[][], player: 'player1' | 'player2') => {
  const captures: Array<{
    from: { row: number; col: number }
    to: { row: number; col: number }
    captured: { row: number; col: number }
  }> = []
  const opponent = player === 'player1' ? 'player2' : 'player1'
  const gridSize = b.length

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (b[row][col]?.player === player) {
        const piece = b[row][col]
        const isKing = piece?.isKing || false

        for (const { dr, dc } of [
          { dr: -1, dc: 0 },
          { dr: 1, dc: 0 },
          { dr: 0, dc: -1 },
          { dr: 0, dc: 1 },
        ]) {
          // Regular pieces can only capture forward (player1 at bottom moves up/dr=-1, player2 at top moves down/dr=1)
          // Kings can capture in all directions
          if (!isKing) {
            if (player === 'player1' && dr === 1) continue // player1 can't capture down
            if (player === 'player2' && dr === -1) continue // player2 can't capture up
          }

          // Regular capture (distance 2) for all pieces
          const midRow = row + dr
          const midCol = col + dc
          const landRow = row + dr * 2
          const landCol = col + dc * 2
          if (
            midRow >= 0 && midRow < gridSize &&
            midCol >= 0 && midCol < gridSize &&
            landRow >= 0 && landRow < gridSize &&
            landCol >= 0 && landCol < gridSize &&
            b[midRow][midCol]?.player === opponent &&
            b[landRow][landCol] === null
          ) {
            captures.push({
              from: { row, col },
              to: { row: landRow, col: landCol },
              captured: { row: midRow, col: midCol },
            })
          }

          // King long-range capture (distance > 2)
          if (isKing) {
            let r = row + dr
            let c = col + dc
            let capturedRow = -1
            let capturedCol = -1

            // Find the first opponent piece in the path
            while (r >= 0 && r < gridSize && c >= 0 && c < gridSize) {
              if (b[r][c] !== null) {
                if (b[r][c]?.player === opponent) {
                  capturedRow = r
                  capturedCol = c
                }
                break
              }
              r += dr
              c += dc
            }

            // If we found an opponent piece, find all valid landing squares beyond it
            if (capturedRow !== -1) {
              r = capturedRow + dr
              c = capturedCol + dc
              while (r >= 0 && r < gridSize && c >= 0 && c < gridSize && b[r][c] === null) {
                captures.push({
                  from: { row, col },
                  to: { row: r, col: c },
                  captured: { row: capturedRow, col: capturedCol },
                })
                r += dr
                c += dc
              }
            }
          }
        }
      }
    }
  }
  return captures
}