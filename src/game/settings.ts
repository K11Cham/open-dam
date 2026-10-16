import type {
  BoardSize,
  BoardType,
  PromotionPolicy,
  ResolvedPromotionPolicy,
  RuleSettings,
  TimeControl,
} from './types'

export const TIME_CONTROLS: TimeControl[] = [
  { label: '1+0', initialMs: 60_000, incrementMs: 0 },
  { label: '3+0', initialMs: 180_000, incrementMs: 0 },
  { label: '5+0', initialMs: 300_000, incrementMs: 0 },
  { label: '10+1', initialMs: 600_000, incrementMs: 1_000 },
  { label: '30+10', initialMs: 1_800_000, incrementMs: 10_000 },
]

export const boardTypeForSize = (size: BoardSize): BoardType =>
  size % 2 === 0 ? 'even' : 'yinyang'

/**
 * Defaults, with reasoning for the two subjective calling toggles.
 *
 * `call.scope = 'choose-one'`: taking every piece that could have captured is
 * a huge swing on a small board — on a 5x5 a single missed capture can wipe
 * three pieces at once, which makes one lapse of attention decide the game.
 * Letting the caller pick one piece keeps calling sharp (you still choose the
 * most valuable target, usually a king) without ending the game outright. The
 * 'all' variant exists for people who want the harsher classic reading.
 *
 * `call.abandonedChainCallable = true`: if stopping a chain early were free,
 * the optional-capture rule would be exploitable — you'd start a chain to grab
 * the piece you want, then stop before the continuation that exposes you, with
 * no downside. Making the abandoned remainder callable keeps "captures are
 * optional" honest: you may decline, but declining is visible and punishable.
 */
export const DEFAULT_SETTINGS: RuleSettings = {
  boardSize: 5,
  boardType: 'yinyang',
  promotionPolicy: 'promote-and-continue',
  call: {
    scope: 'choose-one',
    abandonedChainCallable: true,
  },
  draw: {
    // Kept alongside the 1v1 tie rule; see RULES_SUMMARY below for why.
    threefoldRepetition: true,
    pliesWithoutCapture: 50, // 25 moves each
  },
  timeControl: null,
}

export const makeSettings = (partial: Partial<RuleSettings> = {}): RuleSettings => {
  const boardSize = partial.boardSize ?? DEFAULT_SETTINGS.boardSize
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    boardSize,
    boardType: partial.boardType ?? boardTypeForSize(boardSize),
    call: { ...DEFAULT_SETTINGS.call, ...(partial.call ?? {}) },
    draw: { ...DEFAULT_SETTINGS.draw, ...(partial.draw ?? {}) },
  }
}

/**
 * `match-opponent` only means something once there is an opponent to ask.
 *
 * ONLINE HOOK: when real online play lands, the lobby should call this with the
 * opponent's *resolved* policy so the joining player adopts it. Offline it
 * falls through to the default. Both players choosing `match-opponent` is a
 * deliberate no-op: it resolves to the default for both, so they still agree.
 */
export const resolvePromotionPolicy = (
  policy: PromotionPolicy,
  opponentPolicy?: ResolvedPromotionPolicy,
): ResolvedPromotionPolicy => {
  if (policy !== 'match-opponent') return policy
  return opponentPolicy ?? (DEFAULT_SETTINGS.promotionPolicy as ResolvedPromotionPolicy)
}

/**
 * Two settings sets are compatible if a match between them would be played
 * under one unambiguous rule set. Board geometry, clocks, and the subjective
 * toggles all have to line up; `match-opponent` is the one wildcard, since a
 * player choosing it has said they will take whatever the other side uses.
 *
 * There is no matchmaking service yet — this is the data-model half of it, used
 * by the (mock) ranked lobby and ready for a real queue later.
 */
export const settingsAreCompatible = (a: RuleSettings, b: RuleSettings): boolean => {
  if (a.boardSize !== b.boardSize) return false
  if (a.boardType !== b.boardType) return false
  if (a.timeControl?.label !== b.timeControl?.label) return false
  if (a.call.scope !== b.call.scope) return false
  if (a.call.abandonedChainCallable !== b.call.abandonedChainCallable) return false
  if (a.draw.threefoldRepetition !== b.draw.threefoldRepetition) return false
  if (a.draw.pliesWithoutCapture !== b.draw.pliesWithoutCapture) return false

  const aWild = a.promotionPolicy === 'match-opponent'
  const bWild = b.promotionPolicy === 'match-opponent'
  if (aWild || bWild) return true
  return a.promotionPolicy === b.promotionPolicy
}

export interface SeekEntry<T = unknown> {
  id: string
  settings: RuleSettings
  payload?: T
}

/** Filter a pool of open seeks down to the ones this player could be paired with. */
export const filterCompatibleSeeks = <T>(
  mine: RuleSettings,
  pool: SeekEntry<T>[],
): SeekEntry<T>[] => pool.filter((seek) => settingsAreCompatible(mine, seek.settings))

export const PROMOTION_POLICY_LABELS: Record<PromotionPolicy, string> = {
  'promote-and-continue': 'Crown and continue',
  'promote-after-chain': 'Crown after the chain',
  'end-turn-on-promotion': 'Crowning ends the turn',
  'match-opponent': 'Match opponent',
}

export const PROMOTION_POLICY_BLURBS: Record<PromotionPolicy, string> = {
  'promote-and-continue':
    'The piece is crowned the moment it lands on the far row and keeps capturing with king movement.',
  'promote-after-chain':
    'The chain finishes with normal-piece movement; the crown arrives once the chain ends.',
  'end-turn-on-promotion':
    'Getting crowned ends your turn on the spot, even mid-chain.',
  'match-opponent':
    'Take whatever your opponent picked. Offline this falls back to Crown and continue.',
}

/**
 * Placeholder rules summary shown on the settings panel and the (stub) rules
 * page. Deliberately short — the full tutorial text is message 3's job.
 */
export const RULES_SUMMARY = [
  'Pieces move one square forward, left, or right. Never diagonally, never backward.',
  'Capture by jumping an adjacent enemy piece horizontally or vertically onto the empty square directly beyond it.',
  'Reaching the far row crowns a piece. Kings slide and capture any distance in a straight orthogonal line, and after a capture may stop on any empty square beyond the piece they took.',
  'Captures are never forced. Neither is calling, and neither is undo.',
  'If you pass up a capture, your opponent may call it. Default: the caller removes one piece of their choosing from those that could have captured, and a chain abandoned partway through is callable for the captures you left behind.',
  'Down to your last piece, that piece is crowned automatically.',
  'You lose when you have no pieces left. It is a tie when both players are down to one piece and neither has a capture or a call available.',
  'Long shuffles are also drawn: threefold repetition of the position, or 25 moves each with no capture.',
].join('\n')

export const CALL_SCOPE_LABELS: Record<'all' | 'choose-one', string> = {
  all: 'Remove every piece that could have captured',
  'choose-one': 'Remove one piece of the caller’s choosing',
}
