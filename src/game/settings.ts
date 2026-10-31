import type { BoardSize, BoardType, PromotionPolicy, ResolvedPromotionPolicy, RuleSettings, TimeControl } from './types'

export const TIME_CONTROLS: TimeControl[] = [
  { label: '1+0', initialMs: 60_000, incrementMs: 0 },
  { label: '3+0', initialMs: 180_000, incrementMs: 0 },
  { label: '5+0', initialMs: 300_000, incrementMs: 0 },
  { label: '10+1', initialMs: 600_000, incrementMs: 1_000 },
  { label: '30+10', initialMs: 1_800_000, incrementMs: 10_000 },
]

export const boardTypeForSize = (size: BoardSize): BoardType => (size % 2 === 0 ? 'even' : 'yinyang')

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
    // Kept alongside the one-each tie rule; see evaluateStatus in engine.ts for why.
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

const BOARD_SIZES: BoardSize[] = [5, 6, 7, 8, 9]
const POLICIES: PromotionPolicy[] = ['promote-and-continue', 'promote-after-chain', 'end-turn-on-promotion', 'match-opponent']
/** The longest no-capture rule a link or a saved game may ask for (200 moves each). */
const MAX_PLIES_WITHOUT_CAPTURE = 400

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

/**
 * Settings from somewhere that cannot be trusted (a request to the server, a
 * saved game, a seek), reduced to known fields with allowed values. Anything
 * missing or wrong takes the default, the board type always follows the
 * size, and a clock must be one of TIME_CONTROLS, so a request cannot ask for
 * a 1000-square board, a negative clock, or a made-up time control that would
 * become a rating pool of its own.
 */
export const sanitizeSettings = (value: unknown): RuleSettings => {
  const boardSize = pick(field(value, 'boardSize'), BOARD_SIZES, DEFAULT_SETTINGS.boardSize)
  const call = field(value, 'call')
  const draw = field(value, 'draw')
  const plies = field(draw, 'pliesWithoutCapture')
  const timeControl = field(value, 'timeControl')
  return {
    boardSize,
    boardType: boardTypeForSize(boardSize),
    promotionPolicy: pick(field(value, 'promotionPolicy'), POLICIES, DEFAULT_SETTINGS.promotionPolicy),
    call: {
      scope: pick(field(call, 'scope'), ['all', 'choose-one'] as const, DEFAULT_SETTINGS.call.scope),
      abandonedChainCallable: pick(
        field(call, 'abandonedChainCallable'),
        [true, false],
        DEFAULT_SETTINGS.call.abandonedChainCallable,
      ),
    },
    draw: {
      threefoldRepetition: pick(field(draw, 'threefoldRepetition'), [true, false], DEFAULT_SETTINGS.draw.threefoldRepetition),
      pliesWithoutCapture:
        plies === null
          ? null
          : Number.isInteger(plies) && (plies as number) > 0 && (plies as number) <= MAX_PLIES_WITHOUT_CAPTURE
            ? (plies as number)
            : DEFAULT_SETTINGS.draw.pliesWithoutCapture,
    },
    // The listed control itself, not the caller's copy, so its numbers cannot disagree with its label.
    timeControl: TIME_CONTROLS.find((tc) => tc.label === field(timeControl, 'label')) ?? null,
  }
}

/**
 * `match-opponent` only means something once there is an opponent to ask.
 *
 * Online, the matchmaking queue (`agreedSettings` in src/net/matchmaking.ts)
 * calls this with the opponent's *resolved* policy so the player adopts it.
 * Offline it falls through to the default. Both players choosing `match-opponent` is a
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
 * The server's matchmaking queue (`SeekQueue` in src/net/matchmaking.ts) pairs
 * seeks with this.
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
export const filterCompatibleSeeks = <T>(mine: RuleSettings, pool: SeekEntry<T>[]): SeekEntry<T>[] =>
  pool.filter((seek) => settingsAreCompatible(mine, seek.settings))

export const PROMOTION_POLICY_LABELS: Record<PromotionPolicy, string> = {
  'promote-and-continue': 'Crown and continue',
  'promote-after-chain': 'Crown after the chain',
  'end-turn-on-promotion': 'Crowning ends the turn',
  'match-opponent': 'Match opponent',
}

export const PROMOTION_POLICY_BLURBS: Record<PromotionPolicy, string> = {
  'promote-and-continue': 'The piece is crowned the moment it lands on the far row and keeps capturing with king movement.',
  'promote-after-chain': 'The chain finishes with normal-piece movement; the crown arrives once the chain ends.',
  'end-turn-on-promotion': 'Getting crowned ends your turn on the spot, even mid-chain.',
  'match-opponent':
    'Play whichever rule your opponent picked. Used for online matchmaking; on its own it means Crown and continue.',
}

/**
 * The rules in eight sentences, shown on the Learn page. Kept beside the
 * defaults so a rule change and its description are edited together.
 */
export const RULES_AT_A_GLANCE: string[] = [
  'Pieces move one square forward, left or right. Never diagonally, never backward.',
  'Capture by jumping an enemy piece next to you, straight across, onto the empty square just beyond it. If the same piece can capture again, it may keep going.',
  'A piece that reaches the far row is crowned. Kings move and capture any distance in a straight line, and may land on any empty square past the piece they take.',
  'Captures are optional. But if you pass one up, your opponent may call it on their turn and remove the piece that could have captured.',
  'On odd boards the first move may send any piece straight into the empty centre.',
  'A player down to their last piece has it crowned automatically.',
  'You win when your opponent has no pieces left, or no legal move on their turn.',
  'The game is drawn by agreement, when one piece each is left with nothing to capture, when a position repeats three times, or after 25 moves each without a capture.',
]

export const CALL_SCOPE_LABELS: Record<'all' | 'choose-one', string> = {
  'choose-one': 'One piece, caller’s choice',
  all: 'Every piece that could have captured',
}
