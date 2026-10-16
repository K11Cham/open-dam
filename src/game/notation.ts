import type { Coord, MoveRecord } from './types'

/**
 * Squares are named file-letter + rank-number, counting ranks up from
 * player1's back row — so on a 5x5 the bottom-left square is `a1` and the
 * top-right is `e5`. This is the same mapping the old `coordToNotation` helper
 * in useGameLogic produced; the fuller notation below is built on top of it.
 */
export const coordToNotation = (row: number, col: number, gridSize: number): string =>
  `${String.fromCharCode(97 + col)}${gridSize - row}`

export const notationToCoord = (square: string, gridSize: number): Coord | null => {
  const match = /^([a-z])(\d+)$/.exec(square.trim().toLowerCase())
  if (!match) return null
  const col = match[1].charCodeAt(0) - 97
  const row = gridSize - Number(match[2])
  if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return null
  return { row, col }
}

export interface NotationParts {
  from: Coord
  to: Coord
  gridSize: number
  isCapture: boolean
  /** Squares of the pieces taken, in order, for a multi-leg chain. */
  chainLandings?: Coord[]
  promoted?: boolean
  /** The move left a capture on the table and is therefore callable. */
  leftCaptureAvailable?: boolean
}

/**
 * Notation grammar, kept close to chess/draughts conventions so it reads
 * without a legend:
 *   c2-c3      quiet move
 *   c2xc4      capture
 *   c2xc4xe4   chain capture, one x per leg
 *   c2xc4=K    the move ended in a crowning
 *   c2-c3 ?!   a capture was available and was not taken (callable)
 *   !d4        a call was made, removing the piece on d4
 *   1-0 / 0-1 / ½-½ results
 */
export const formatMove = (parts: NotationParts): string => {
  const { from, to, gridSize, isCapture, chainLandings = [], promoted, leftCaptureAvailable } = parts
  const start = coordToNotation(from.row, from.col, gridSize)

  let body: string
  if (isCapture) {
    const legs = chainLandings.length > 0 ? chainLandings : [to]
    body = start + legs.map((leg) => `x${coordToNotation(leg.row, leg.col, gridSize)}`).join('')
  } else {
    body = `${start}-${coordToNotation(to.row, to.col, gridSize)}`
  }

  if (promoted) body += '=K'
  if (leftCaptureAvailable) body += ' ?!'
  return body
}

export const formatCall = (targets: Coord[], gridSize: number): string =>
  `!${targets.map((t) => coordToNotation(t.row, t.col, gridSize)).join('+')}`

export const formatResign = (player: 'player1' | 'player2'): string =>
  player === 'player1' ? 'resigns 0-1' : 'resigns 1-0'

export const DRAW_NOTATION = '½-½'

/**
 * Group the ply list for display. Ordinary moves pair up into numbered rows;
 * calls, resignations and agreed draws are not moves in the turn sequence, so
 * they get their own full-width annotation rows instead of stealing a column.
 */
export type MoveRow =
  | { kind: 'pair'; number: number; player1?: MoveRecord; player2?: MoveRecord }
  | { kind: 'note'; record: MoveRecord }

const isAnnotation = (record: MoveRecord): boolean =>
  record.kind === 'call' || record.kind === 'resign' || record.kind === 'draw-agreed'

export const toMoveRows = (moves: MoveRecord[]): MoveRow[] => {
  const rows: MoveRow[] = []
  let number = 0

  for (const move of moves) {
    if (isAnnotation(move)) {
      rows.push({ kind: 'note', record: move })
      continue
    }

    const last = rows[rows.length - 1]
    const openPair = last && last.kind === 'pair' ? last : null

    // Chain legs belong to the ply that started them.
    if (move.continuesChain && openPair) {
      const slot = move.player === 'player1' ? 'player1' : 'player2'
      const existing = openPair[slot]
      if (existing) {
        openPair[slot] = {
          ...existing,
          notation: mergeChainNotation(existing.notation, move.notation),
          capturedIds: [...existing.capturedIds, ...move.capturedIds],
          promoted: existing.promoted || move.promoted,
          to: move.to,
        }
        continue
      }
    }

    if (move.player === 'player1') {
      number += 1
      rows.push({ kind: 'pair', number, player1: move })
    } else if (openPair && !openPair.player2) {
      openPair.player2 = move
    } else {
      number += 1
      rows.push({ kind: 'pair', number, player2: move })
    }
  }
  return rows
}

/** `c2xc4` + `c4xe4` -> `c2xc4xe4`, keeping any trailing annotation. */
const mergeChainNotation = (base: string, leg: string): string => {
  const legTail = leg.slice(leg.indexOf('x'))
  const [baseBody, ...baseRest] = base.split(' ')
  const cleanedBase = baseBody.replace(/=K$/, '')
  const suffix = baseRest.length > 0 ? ` ${baseRest.join(' ')}` : ''
  return `${cleanedBase}${legTail}${suffix}`
}
