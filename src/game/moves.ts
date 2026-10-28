import { ORTHOGONAL, forwardDir, inBounds, opponentOf } from './board'
import type { Board, Coord, PieceData, PlayerId } from './types'

export interface CaptureOption {
  from: Coord
  to: Coord
  captured: Coord
  pieceId: string
  /** Distance jumped. 2 for a normal piece, arbitrary for a king. */
  distance: number
}

export interface SimpleMove {
  from: Coord
  to: Coord
  pieceId: string
}

/**
 * Directions a piece may travel.
 *
 * Normal pieces go forward, left and right — never backward, never diagonally.
 * That restriction applies to captures too: a normal piece cannot jump
 * backward. Kings travel in all four orthogonal directions.
 */
export const directionsFor = (piece: PieceData): Array<{ dr: number; dc: number }> => {
  if (piece.isKing) return ORTHOGONAL
  const fwd = forwardDir(piece.player)
  return [
    { dr: fwd, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ]
}

/** Every capture the given player could make from the current position. */
export const getCaptures = (b: Board, player: PlayerId): CaptureOption[] => {
  const out: CaptureOption[] = []
  const gridSize = b.length
  const enemy = opponentOf(player)

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const piece = b[row][col]
      if (!piece || piece.player !== player) continue

      for (const { dr, dc } of directionsFor(piece)) {
        if (!piece.isKing) {
          // Short jump: neighbour is an enemy, square beyond is empty.
          const midRow = row + dr
          const midCol = col + dc
          const landRow = row + dr * 2
          const landCol = col + dc * 2
          if (
            inBounds(b, midRow, midCol) &&
            inBounds(b, landRow, landCol) &&
            b[midRow][midCol]?.player === enemy &&
            b[landRow][landCol] === null
          ) {
            out.push({
              from: { row, col },
              to: { row: landRow, col: landCol },
              captured: { row: midRow, col: midCol },
              pieceId: piece.id,
              distance: 2,
            })
          }
          continue
        }

        // King: slide until the first occupied square. If it holds an enemy,
        // every empty square beyond it is a legal landing square.
        let r = row + dr
        let c = col + dc
        let capturedRow = -1
        let capturedCol = -1

        while (inBounds(b, r, c)) {
          if (b[r][c] !== null) {
            if (b[r][c]?.player === enemy) {
              capturedRow = r
              capturedCol = c
            }
            break
          }
          r += dr
          c += dc
        }
        if (capturedRow === -1) continue

        r = capturedRow + dr
        c = capturedCol + dc
        while (inBounds(b, r, c) && b[r][c] === null) {
          out.push({
            from: { row, col },
            to: { row: r, col: c },
            captured: { row: capturedRow, col: capturedCol },
            pieceId: piece.id,
            distance: Math.abs(r - row) + Math.abs(c - col),
          })
          r += dr
          c += dc
        }
      }
    }
  }
  return out
}

export const getCapturesFrom = (b: Board, player: PlayerId, from: Coord): CaptureOption[] =>
  getCaptures(b, player).filter((c) => c.from.row === from.row && c.from.col === from.col)

/** Non-capturing moves available to the player. */
export const getSimpleMoves = (b: Board, player: PlayerId): SimpleMove[] => {
  const out: SimpleMove[] = []
  const gridSize = b.length

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const piece = b[row][col]
      if (!piece || piece.player !== player) continue

      for (const { dr, dc } of directionsFor(piece)) {
        if (piece.isKing) {
          let r = row + dr
          let c = col + dc
          while (inBounds(b, r, c) && b[r][c] === null) {
            out.push({ from: { row, col }, to: { row: r, col: c }, pieceId: piece.id })
            r += dr
            c += dc
          }
        } else {
          const r = row + dr
          const c = col + dc
          if (inBounds(b, r, c) && b[r][c] === null) {
            out.push({ from: { row, col }, to: { row: r, col: c }, pieceId: piece.id })
          }
        }
      }
    }
  }
  return out
}

export const getSimpleMovesFrom = (b: Board, player: PlayerId, from: Coord): SimpleMove[] =>
  getSimpleMoves(b, player).filter((m) => m.from.row === from.row && m.from.col === from.col)

export const hasAnyLegalMove = (b: Board, player: PlayerId): boolean =>
  getSimpleMoves(b, player).length > 0 || getCaptures(b, player).length > 0

/**
 * Classify an attempted from -> to as a slide, a capture, or nothing. Used by
 * the engine so the UI can just hand over two squares and let the rules decide.
 */
export type MoveIntent =
  | { kind: 'slide'; from: Coord; to: Coord; piece: PieceData }
  | { kind: 'capture'; from: Coord; to: Coord; piece: PieceData; captured: Coord }
  | { kind: 'illegal'; reason: string }

export const classifyMove = (b: Board, player: PlayerId, from: Coord, to: Coord): MoveIntent => {
  const piece = b[from.row]?.[from.col]
  if (!piece) return { kind: 'illegal', reason: 'No piece on that square.' }
  if (piece.player !== player) return { kind: 'illegal', reason: 'That is not your piece.' }
  if (!inBounds(b, to.row, to.col)) return { kind: 'illegal', reason: 'That square is off the board.' }
  if (b[to.row][to.col] !== null) return { kind: 'illegal', reason: 'Destination is occupied.' }

  const rowDiff = to.row - from.row
  const colDiff = to.col - from.col
  if (rowDiff !== 0 && colDiff !== 0) {
    return { kind: 'illegal', reason: 'Moves are orthogonal only — no diagonals.' }
  }
  if (rowDiff === 0 && colDiff === 0) return { kind: 'illegal', reason: 'That is the same square.' }

  const dr = Math.sign(rowDiff)
  const dc = Math.sign(colDiff)
  const legalDir = directionsFor(piece).some((d) => d.dr === dr && d.dc === dc)
  if (!legalDir) return { kind: 'illegal', reason: 'That direction is not available to this piece.' }

  const distance = Math.abs(rowDiff) + Math.abs(colDiff)
  if (!piece.isKing && distance > 2) {
    return { kind: 'illegal', reason: 'Normal pieces move one square, or jump exactly one piece.' }
  }

  // Walk the path and record what is in the way.
  let r = from.row + dr
  let c = from.col + dc
  const blockers: Coord[] = []
  while (r !== to.row || c !== to.col) {
    if (b[r][c] !== null) blockers.push({ row: r, col: c })
    r += dr
    c += dc
  }

  if (blockers.length === 0) {
    if (!piece.isKing && distance !== 1) {
      return { kind: 'illegal', reason: 'Normal pieces move exactly one square.' }
    }
    return { kind: 'slide', from, to, piece }
  }
  if (blockers.length > 1) {
    return { kind: 'illegal', reason: 'The path is blocked by more than one piece.' }
  }

  const blocker = blockers[0]
  const blockingPiece = b[blocker.row][blocker.col]!
  if (blockingPiece.player === player) {
    return { kind: 'illegal', reason: 'You cannot jump your own piece.' }
  }
  if (!piece.isKing && distance !== 2) {
    return { kind: 'illegal', reason: 'A normal piece lands directly beyond the piece it takes.' }
  }
  return { kind: 'capture', from, to, piece, captured: blocker }
}
