import { makeEmptyBoard } from './board'
import { createInitialState } from './engine'
import type { Board, BoardSize, EngineState, PlayerId, RuleSettings } from './types'

/**
 * Build a position from rows of text, top row first:
 *   `.` empty · `a` Red piece · `A` Red king · `b` Blue piece · `B` Blue king
 *
 * Used by the tutorial's example boards and by the tests, so both describe
 * positions the same readable way. The board size is the number of rows.
 */
export const positionFromAscii = (rows: string[], toMove: PlayerId, settings: Partial<RuleSettings> = {}): EngineState => {
  const size = rows.length as BoardSize
  if (rows.some((row) => row.length !== size)) {
    throw new Error(`positionFromAscii: every row must be ${size} characters wide`)
  }
  const base = createInitialState({ ...settings, boardSize: size })
  const board: Board = makeEmptyBoard(size)
  let id = 0
  rows.forEach((line, row) => {
    line.split('').forEach((char, col) => {
      if (char === '.') return
      if (!'aAbB'.includes(char)) throw new Error(`positionFromAscii: unknown square "${char}"`)
      board[row][col] = {
        player: char.toLowerCase() === 'a' ? 'player1' : 'player2',
        isKing: char === char.toUpperCase(),
        id: `x-${id++}`,
      }
    })
  })
  return { ...base, board, currentPlayer: toMove, isFirstMove: false, positionCounts: {}, nextPieceId: id }
}

/** The inverse of `positionFromAscii`, for test failure messages and debugging. */
export const positionToAscii = (state: EngineState): string =>
  state.board
    .map((row) =>
      row
        .map((cell) => {
          if (!cell) return '.'
          const letter = cell.player === 'player1' ? 'a' : 'b'
          return cell.isKing ? letter.toUpperCase() : letter
        })
        .join(''),
    )
    .join('\n')
