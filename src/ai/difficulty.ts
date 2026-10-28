import type { EvalProfile } from './evaluate'

/**
 * Five computer opponents, named in Wolof: Döff (the fool), Ndö (the youngster,
 * usually a teen), Khàlé (the child), Màam (the elder) and Seriñ (the master).
 *
 * They differ in what they *know*, not only in how far they look, because a
 * person improving at dam learns things in a recognisable order:
 *
 *  1. Döff counts pieces and moves on impulse. It looks one move ahead and
 *     often forgets to call a skipped capture.
 *  2. Ndö sees your reply and grabs what is offered, but does not yet
 *     understand that a capture it skips will be called, so it is easy to
 *     catch with "take this or lose that".
 *  3. Khàlé knows the calling rule cold and reads short exchanges to the end.
 *     It has no feel for sacrifices further out, nor an endgame plan.
 *  4. Màam searches deep, follows every chain, plays sacrifices that win a
 *     king or start a chain, and knows how to hunt a lone king.
 *  5. Seriñ adds the deepest search, forced-reply extensions, full lone-king
 *     technique and no deliberate errors.
 *
 * Depth alone would make one engine slower and weaker in the same shape;
 * changing the knowledge makes each tier play like a different person.
 */

export type DifficultyId = 'doff' | 'ndo' | 'khale' | 'maam' | 'serin'

export interface UndoPolicy {
  /**
   * How much evaluation the AI will hand back, in centipieces, before it
   * refuses an undo. `Infinity` means always accept.
   */
  maxSwing: number
  /** Always accept in the opening; refusing a second-move slip is obnoxious. */
  graceUntilPly: number
}

export interface Difficulty {
  id: DifficultyId
  name: string
  /** What the Wolof name means, shown beside it. */
  meaning: string
  blurb: string
  /** Mock rating, used to place the tier in the sample rating bands. */
  elo: number
  depth: number
  timeBudgetMs: number
  quiescenceDepth: number
  noise: number
  blunderChance: number
  /** How much worse a deliberate mistake may be, in centipieces (Infinity: any move). */
  blunderMargin: number
  /** Chance of not noticing an available call. */
  missCallChance: number
  /** Whether the search knows a skipped capture gets called. */
  callAware: boolean
  /** Extra plies per line for replies forced by the calling rule. */
  forcingExtensions: number
  profile: EvalProfile
  /** Range of simulated thinking time, in ms. */
  thinkMs: [number, number]
  undo: UndoPolicy
  /** Evaluation gap, in centipieces, at which it will accept a draw offer. */
  drawAcceptWithin: number
}

const MATERIAL_ONLY: EvalProfile = {
  name: 'material only',
  mobility: 0,
  advancement: 0,
  backRow: 0,
  exposure: 0,
  threats: 0,
  kingActivity: 0,
  endgameDamping: false,
  drawClockAwareness: false,
  endgameTechnique: 0,
}

const GREEDY: EvalProfile = {
  name: 'material, tempo and threats',
  mobility: 1,
  advancement: 4,
  backRow: 0,
  exposure: 0,
  threats: 8,
  kingActivity: 0,
  endgameDamping: false,
  drawClockAwareness: false,
  endgameTechnique: 0,
}

const TACTICAL: EvalProfile = {
  name: 'tactical',
  mobility: 3,
  advancement: 6,
  backRow: 8,
  exposure: 0.6,
  threats: 8,
  kingActivity: 1,
  endgameDamping: true,
  drawClockAwareness: false,
  endgameTechnique: 0,
}

const FULL: EvalProfile = {
  name: 'full',
  mobility: 5,
  advancement: 7,
  backRow: 14,
  exposure: 0.85,
  threats: 10,
  kingActivity: 1.5,
  endgameDamping: true,
  drawClockAwareness: true,
  endgameTechnique: 0.6,
}

const MASTER: EvalProfile = {
  ...FULL,
  name: 'full, with endgame technique',
  mobility: 6,
  backRow: 18,
  exposure: 1.0,
  threats: 12,
  kingActivity: 2.2,
  endgameTechnique: 1,
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  doff: {
    id: 'doff',
    name: 'Döff',
    meaning: 'the fool',
    blurb: 'Moves on impulse. Looks one move ahead, counts pieces and nothing else, and often forgets to call.',
    elo: 500,
    depth: 1,
    timeBudgetMs: 100,
    quiescenceDepth: 0,
    noise: 160,
    blunderChance: 0.35,
    blunderMargin: Infinity,
    missCallChance: 0.5,
    callAware: false,
    forcingExtensions: 0,
    profile: MATERIAL_ONLY,
    thinkMs: [350, 750],
    undo: { maxSwing: Infinity, graceUntilPly: Infinity },
    drawAcceptWithin: 500,
  },
  ndo: {
    id: 'ndo',
    name: 'Ndö',
    meaning: 'the youngster',
    blurb: 'Sees your reply and grabs what is offered, but walks into captures it then has to make.',
    elo: 850,
    depth: 2,
    timeBudgetMs: 250,
    quiescenceDepth: 1,
    noise: 70,
    blunderChance: 0.18,
    blunderMargin: 220,
    missCallChance: 0.2,
    callAware: false,
    forcingExtensions: 0,
    profile: GREEDY,
    thinkMs: [400, 850],
    undo: { maxSwing: 300, graceUntilPly: 10 },
    drawAcceptWithin: 250,
  },
  khale: {
    id: 'khale',
    name: 'Khàlé',
    meaning: 'the child',
    blurb: 'Knows the calling rule cold and reads short exchanges to the end. Deep sacrifices are past it.',
    elo: 1200,
    depth: 4,
    timeBudgetMs: 600,
    quiescenceDepth: 4,
    noise: 30,
    blunderChance: 0.07,
    blunderMargin: 120,
    missCallChance: 0.04,
    callAware: true,
    forcingExtensions: 0,
    profile: TACTICAL,
    thinkMs: [450, 950],
    undo: { maxSwing: 150, graceUntilPly: 6 },
    drawAcceptWithin: 150,
  },
  maam: {
    id: 'maam',
    name: 'Màam',
    meaning: 'the elder',
    blurb: 'Patient and deep. Follows every chain, sacrifices to win kings, and knows how to hunt a lone king.',
    elo: 1550,
    depth: 10,
    timeBudgetMs: 1200,
    quiescenceDepth: 6,
    noise: 8,
    blunderChance: 0.02,
    blunderMargin: 40,
    missCallChance: 0,
    callAware: true,
    forcingExtensions: 1,
    profile: FULL,
    thinkMs: [500, 1100],
    undo: { maxSwing: 60, graceUntilPly: 4 },
    drawAcceptWithin: 70,
  },
  serin: {
    id: 'serin',
    name: 'Seriñ',
    meaning: 'the master',
    blurb: 'Plays to win from the first move. Deepest search, no deliberate errors, and it corners your last king.',
    elo: 1900,
    depth: 40,
    timeBudgetMs: 2600,
    quiescenceDepth: 10,
    noise: 0,
    blunderChance: 0,
    blunderMargin: 0,
    missCallChance: 0,
    callAware: true,
    forcingExtensions: 2,
    profile: MASTER,
    thinkMs: [500, 1200],
    undo: { maxSwing: 25, graceUntilPly: 2 },
    drawAcceptWithin: 30,
  },
}

export const DIFFICULTY_IDS: DifficultyId[] = ['doff', 'ndo', 'khale', 'maam', 'serin']

export const isDifficultyId = (value: unknown): value is DifficultyId =>
  typeof value === 'string' && (DIFFICULTY_IDS as string[]).includes(value)

/** Tier ids and names used before the Wolof names, mapped to their closest successor. */
const LEGACY: Record<string, { id: DifficultyId; name: string }> = {
  novice: { id: 'doff', name: 'Novice' },
  club: { id: 'khale', name: 'Club' },
  expert: { id: 'maam', name: 'Expert' },
  master: { id: 'serin', name: 'Master' },
}

/** A current tier id for any id this app has ever saved, or null. */
export const normalizeDifficultyId = (value: unknown): DifficultyId | null => {
  if (isDifficultyId(value)) return value
  if (typeof value === 'string' && value in LEGACY) return LEGACY[value].id
  return null
}

/** The display name of a legacy tier, so old saves can be renamed. */
export const legacyTierName = (value: unknown): string | null =>
  typeof value === 'string' && value in LEGACY ? LEGACY[value].name : null
