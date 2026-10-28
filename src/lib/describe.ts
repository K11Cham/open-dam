import type { GameStatus, MoveRecord, PlayerId, RuleSettings } from '../game/types'
import type { MatchNotice, Seat } from '../match/types'

/**
 * All the sentences the game says about itself, in one place, so the result
 * dialog, the status panel, toasts and the screen-reader announcements agree.
 */

export type Names = Record<PlayerId, string>

/** A seat's display name: its own name if it has one, else the theme's side name. */
export const seatLabel = (seat: Seat, player: PlayerId, sideNames: Names): string => seat.name || sideNames[player]

/** Headline for a finished game. `perspective` is the side this device plays, or null in hot seat. */
export function outcomeTitle(status: GameStatus, perspective: PlayerId | null, names: Names): string {
  if (status.kind === 'playing') return ''
  if (status.kind === 'draw') return 'Draw'
  if (perspective === null) return `${names[status.winner]} wins`
  return status.winner === perspective ? 'You win' : 'You lose'
}

/**
 * Why the game ended, using the actual rule settings of this game. When
 * `perspective` names the side played on this device, that side is "you".
 */
export function outcomeReason(
  status: GameStatus,
  settings: RuleSettings,
  names: Names,
  perspective: PlayerId | null = null,
): string {
  if (status.kind === 'playing') return ''
  if (status.kind === 'draw') {
    switch (status.reason) {
      case 'agreement':
        return 'Both players agreed to a draw.'
      case 'threefold':
        return 'The same position came up three times.'
      case 'no-captures': {
        const plies = settings.draw.pliesWithoutCapture ?? 0
        return `${plies / 2} moves each went by without a capture.`
      }
      case 'one-each-stalemate':
        return 'One piece each, with no capture or call left to play.'
    }
  }
  const loser: PlayerId = status.winner === 'player1' ? 'player2' : 'player1'
  const you = loser === perspective
  const who = you ? 'You' : names[loser]
  switch (status.reason) {
    case 'no-pieces':
      return `${who} ${you ? 'have' : 'has'} no pieces left.`
    case 'no-moves':
      return `${who} ${you ? 'are' : 'is'} blocked, with no legal move.`
    case 'resignation':
      return `${who} resigned.`
    case 'timeout':
      return `${who} ran out of time.`
  }
}

/** Notation squares joined with a readable dash for speech and captions. */
export function spokenMove(record: MoveRecord, names: Names): string {
  const who = names[record.player]
  switch (record.kind) {
    case 'call':
      return `${who} called ${record.notation.slice(1).split('+').join(' and ')}`
    case 'resign':
      return `${who} resigned`
    case 'draw-agreed':
      return 'Draw agreed'
    case 'timeout':
      return `${who} ran out of time`
    default: {
      const [body, annotation] = record.notation.split(' ')
      const crowned = body.endsWith('=K')
      const squares = body.replace('=K', '')
      let text: string
      if (squares.includes('x')) {
        const [from, ...landings] = squares.split('x')
        text = `${from} jumps to ${landings.join(', then ')}, capturing`
      } else {
        text = squares.replace('-', ' to ')
      }
      if (crowned) text += ', and is crowned'
      if (annotation === '?!') text += ', passing up a capture'
      return `${who}: ${text}`
    }
  }
}

/** A short line for an offer or its answer. `local` lists the sides played on this device. */
export function noticeText(notice: MatchNotice, names: Names, local: PlayerId[]): string | null {
  const isMine = (player: PlayerId) => local.length === 1 && local[0] === player
  const what = (kind: 'undo' | 'draw') => (kind === 'undo' ? 'take-back' : 'draw')
  const request = (kind: 'undo' | 'draw') => (kind === 'undo' ? 'take-back request' : 'draw offer')
  // Name who answered, so "declined" is never anonymous.
  const other = (player: PlayerId): PlayerId => (player === 'player1' ? 'player2' : 'player1')
  switch (notice.type) {
    case 'offer-made':
      if (isMine(notice.by)) return notice.kind === 'undo' ? 'Take-back requested.' : 'Draw offered.'
      return notice.kind === 'undo' ? `${names[notice.by]} asks to take back a move.` : `${names[notice.by]} offers a draw.`
    case 'offer-accepted':
      return isMine(notice.by) ? `${names[other(notice.by)]} accepted your ${request(notice.kind)}.` : null
    case 'offer-declined':
      return isMine(notice.by)
        ? `${names[other(notice.by)]} declined your ${request(notice.kind)}.`
        : `${names[notice.by]}'s ${what(notice.kind)} was declined.`
    case 'offer-cancelled':
      return isMine(notice.by) ? null : `${names[notice.by]} withdrew the ${what(notice.kind)} offer.`
    case 'undo-applied':
      return `Move taken back. ${names[notice.for]} to play.`
  }
}

export const timeControlLabel = (settings: RuleSettings) => settings.timeControl?.label ?? 'Untimed'

/** "1 move", "3 moves": a count with its noun in the right number. */
export const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
