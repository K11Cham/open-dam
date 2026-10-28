import type { EvalProfile } from './evaluate'

/**
 * Four tiers that differ in what the engine *knows*, not only how deep it
 * looks. A tier with a crude evaluation plays differently from a shallow one
 * with a full evaluation: Novice cannot see mobility or exposure at all, so it
 * walks into calls; Club sees threats but not the drawish endgame, so it trades
 * down into ties it should have avoided. Depth alone would just make one engine
 * slower and weaker in the same shape.
 */

export type DifficultyId = 'novice' | 'club' | 'expert' | 'master'

export interface UndoPolicy {
  /**
   * How much evaluation the AI will hand back, in centipieces, before it
   * refuses an undo. `Infinity` means always accept.
   */
  maxSwing: number
  /** Always accept in the opening — refusing a second-move slip is obnoxious. */
  graceUntilPly: number
}

export interface Difficulty {
  id: DifficultyId
  name: string
  blurb: string
  /** Mock rating, used to place the tier in the sample elo bands. */
  elo: number
  depth: number
  timeBudgetMs: number
  quiescenceDepth: number
  noise: number
  blunderChance: number
  /** How much worse a deliberate mistake may be, in centipieces (Infinity: any move). */
  blunderMargin: number
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
}

const SHALLOW: EvalProfile = {
  name: 'material, mobility and tempo',
  mobility: 3,
  advancement: 5,
  backRow: 0,
  exposure: 0.35,
  threats: 6,
  kingActivity: 0,
  endgameDamping: false,
  drawClockAwareness: false,
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
}

const SHARP: EvalProfile = {
  ...FULL,
  name: 'full, sharpened',
  mobility: 6,
  backRow: 18,
  exposure: 1.0,
  threats: 12,
  kingActivity: 2.2,
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  novice: {
    id: 'novice',
    name: 'Novice',
    blurb:
      'Counts pieces and nothing else, one move ahead, and misplays roughly a third of the time. It will leave captures on the table for you to call.',
    elo: 780,
    depth: 1,
    timeBudgetMs: 120,
    quiescenceDepth: 0,
    noise: 150,
    blunderChance: 0.32,
    blunderMargin: Infinity,
    profile: MATERIAL_ONLY,
    thinkMs: [320, 700],
    undo: { maxSwing: Infinity, graceUntilPly: Infinity },
    drawAcceptWithin: 400,
  },
  club: {
    id: 'club',
    name: 'Club',
    blurb:
      'Three plies, and it understands tempo and threats — but it is blind to the back row and to how drawish the endgame gets, so it trades down too readily.',
    elo: 1120,
    depth: 3,
    timeBudgetMs: 450,
    quiescenceDepth: 2,
    noise: 40,
    blunderChance: 0.1,
    blunderMargin: 160,
    profile: SHALLOW,
    thinkMs: [420, 900],
    undo: { maxSwing: 150, graceUntilPly: 6 },
    drawAcceptWithin: 180,
  },
  expert: {
    id: 'expert',
    name: 'Expert',
    blurb:
      'Five plies with the full evaluation and capture extensions. It punishes skipped captures and knows when a material lead has stopped converting.',
    elo: 1460,
    depth: 5,
    timeBudgetMs: 900,
    quiescenceDepth: 4,
    noise: 12,
    blunderChance: 0.04,
    blunderMargin: 60,
    profile: FULL,
    thinkMs: [500, 1100],
    undo: { maxSwing: 60, graceUntilPly: 4 },
    drawAcceptWithin: 70,
  },
  master: {
    id: 'master',
    name: 'Master',
    blurb:
      'Iterative deepening to eight plies inside a time budget, sharpened weights, deep capture extensions, and no deliberate error.',
    elo: 1790,
    depth: 8,
    timeBudgetMs: 1500,
    quiescenceDepth: 6,
    noise: 0,
    blunderChance: 0,
    blunderMargin: 0,
    profile: SHARP,
    thinkMs: [600, 1400],
    undo: { maxSwing: 25, graceUntilPly: 2 },
    drawAcceptWithin: 30,
  },
}

export const DIFFICULTY_IDS: DifficultyId[] = ['novice', 'club', 'expert', 'master']

export const isDifficultyId = (value: unknown): value is DifficultyId =>
  typeof value === 'string' && (DIFFICULTY_IDS as string[]).includes(value)
