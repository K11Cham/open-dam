import type { EngineState } from '../game/types'

/**
 * Zobrist hashing, so the search can recognise a position it has already
 * scored. Each (square, piece kind) gets two random 32-bit words; a position's
 * key is the XOR of the words for every occupied square, plus words for the
 * side to move and the square a chain is continuing from. The first word picks
 * the table slot and the second checks that the slot really holds this
 * position, which makes a false match about one in four billion.
 *
 * The keys are generated from a fixed seed so every run (and the Web Worker)
 * hashes identically.
 */

const MAX_SQUARES = 81
const KINDS = 4 // red man, red king, blue man, blue king

const seededWords = (count: number, seed: number): Int32Array => {
  const out = new Int32Array(count)
  let x = seed >>> 0
  for (let i = 0; i < count; i++) {
    // xorshift32: fast, and good enough for hashing keys.
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    out[i] = x | 0
  }
  return out
}

const PIECE_A = seededWords(MAX_SQUARES * KINDS, 0x9e3779b9)
const PIECE_B = seededWords(MAX_SQUARES * KINDS, 0x85ebca6b)
const CHAIN_A = seededWords(MAX_SQUARES, 0xc2b2ae35)
const CHAIN_B = seededWords(MAX_SQUARES, 0x27d4eb2f)
const SIDE_A = 0x5bd1e995 | 0
const SIDE_B = 0x1b873593 | 0
const FIRST_MOVE_A = 0x68e31da4 | 0
const FIRST_MOVE_B = 0x7a2f8f1d | 0

export interface PositionKey {
  slot: number
  check: number
}

export function hashPosition(state: EngineState): PositionKey {
  const board = state.board
  const size = board.length
  let a = 0
  let b = 0
  for (let row = 0; row < size; row++) {
    const line = board[row]
    for (let col = 0; col < size; col++) {
      const piece = line[col]
      if (!piece) continue
      const kind = (piece.player === 'player1' ? 0 : 2) + (piece.isKing ? 1 : 0)
      const index = (row * size + col) * KINDS + kind
      a ^= PIECE_A[index]
      b ^= PIECE_B[index]
    }
  }
  if (state.currentPlayer === 'player2') {
    a ^= SIDE_A
    b ^= SIDE_B
  }
  if (state.chain.active && state.chain.at) {
    const square = state.chain.at.row * size + state.chain.at.col
    a ^= CHAIN_A[square]
    b ^= CHAIN_B[square]
  }
  if (state.isFirstMove) {
    a ^= FIRST_MOVE_A
    b ^= FIRST_MOVE_B
  }
  return { slot: a, check: b }
}
