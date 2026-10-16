import type { Board, BoardType, Coord, Piece, PieceData, PlayerId } from './types'

/**
 * Direction convention, fixed once here so nothing has to guess:
 *   player1 sits at the BOTTOM (high row indices) and advances toward row 0.
 *   player2 sits at the TOP (row 0) and advances toward row gridSize - 1.
 * Notation ranks count up from player1's back row, so row gridSize-1 is rank 1.
 */
export const forwardDir = (player: PlayerId): number => (player === 'player1' ? -1 : 1)

export const promotionRow = (player: PlayerId, gridSize: number): number =>
  player === 'player1' ? 0 : gridSize - 1

export const opponentOf = (player: PlayerId): PlayerId =>
  player === 'player1' ? 'player2' : 'player1'

export const ORTHOGONAL: Array<{ dr: number; dc: number }> = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
]

export const inBounds = (b: Board, row: number, col: number): boolean =>
  row >= 0 && row < b.length && col >= 0 && col < b.length

export const at = (b: Board, c: Coord): Piece => b[c.row]?.[c.col] ?? null

export const cloneBoard = (b: Board): Board => b.map((row) => row.map((p) => (p ? { ...p } : null)))

export const sameCoord = (a: Coord | null, b: Coord | null): boolean =>
  !!a && !!b && a.row === b.row && a.col === b.col

export interface BoardBuildResult {
  board: Board
  nextPieceId: number
}

/**
 * Odd boards use the yin/yang start: the centre square is empty and the two
 * armies interlock around it. Even boards use plain rows with a two-row gap.
 */
export const makeInitialBoard = (
  gridSize: number,
  boardType: BoardType = 'yinyang',
): BoardBuildResult => (boardType === 'yinyang' ? makeYinYangBoard(gridSize) : makeEvenBoard(gridSize))

const makeYinYangBoard = (gridSize: number): BoardBuildResult => {
  const center = Math.floor(gridSize / 2)
  const board: Board = []
  let id = 0

  for (let row = 0; row < gridSize; row++) {
    const rowPieces: Piece[] = []
    for (let col = 0; col < gridSize; col++) {
      const isCenter = row === center && col === center
      const isPlayer2 = row < center || (row === center && col < center)
      const isPlayer1 = row > center || (row === center && col > center)

      if (isCenter) rowPieces.push(null)
      else if (isPlayer2) rowPieces.push({ player: 'player2', isKing: false, id: `p-${id++}` })
      else if (isPlayer1) rowPieces.push({ player: 'player1', isKing: false, id: `p-${id++}` })
      else rowPieces.push(null)
    }
    board.push(rowPieces)
  }
  return { board, nextPieceId: id }
}

const makeEvenBoard = (gridSize: number): BoardBuildResult => {
  const board: Board = []
  let id = 0
  const emptyRows = 2
  const filledRows = gridSize - emptyRows
  const player2Rows = Math.floor(filledRows / 2)

  for (let row = 0; row < gridSize; row++) {
    const rowPieces: Piece[] = []
    for (let col = 0; col < gridSize; col++) {
      if (row < player2Rows) {
        rowPieces.push({ player: 'player2', isKing: false, id: `p-${id++}` })
      } else if (row < player2Rows + emptyRows) {
        rowPieces.push(null)
      } else {
        rowPieces.push({ player: 'player1', isKing: false, id: `p-${id++}` })
      }
    }
    board.push(rowPieces)
  }
  return { board, nextPieceId: id }
}

export const makeEmptyBoard = (gridSize: number): Board =>
  Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => null as Piece))

export const countPieces = (b: Board, player: PlayerId): number => {
  let count = 0
  for (const row of b) for (const cell of row) if (cell?.player === player) count++
  return count
}

export const findPiece = (b: Board, pieceId: string): Coord | null => {
  for (let row = 0; row < b.length; row++) {
    for (let col = 0; col < b[row].length; col++) {
      if (b[row][col]?.id === pieceId) return { row, col }
    }
  }
  return null
}

export const piecesOf = (b: Board, player: PlayerId): Array<{ piece: PieceData; at: Coord }> => {
  const out: Array<{ piece: PieceData; at: Coord }> = []
  for (let row = 0; row < b.length; row++) {
    for (let col = 0; col < b[row].length; col++) {
      const cell = b[row][col]
      if (cell?.player === player) out.push({ piece: cell, at: { row, col } })
    }
  }
  return out
}

/**
 * Position key for repetition detection. Includes the side to move, because
 * the same arrangement with the other player on move is a different position.
 */
export const serializePosition = (b: Board, toMove: PlayerId): string => {
  const cells = b
    .map((row) =>
      row
        .map((cell) => {
          if (!cell) return '.'
          const letter = cell.player === 'player1' ? 'a' : 'b'
          return cell.isKing ? letter.toUpperCase() : letter
        })
        .join(''),
    )
    .join('/')
  return `${cells} ${toMove === 'player1' ? 'w' : 'b'}`
}
