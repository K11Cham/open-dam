import { DIFFICULTIES, normalizeDifficultyId } from '../ai/difficulty'
import type { DifficultyId } from '../ai/difficulty'
import { TIME_CONTROLS, boardTypeForSize, makeSettings } from '../game/settings'
import type { BoardSize, PlayerId, PromotionPolicy, RuleSettings } from '../game/types'
import { STORAGE_KEYS, storage } from '../services/storage'
import { createRecord } from './session'
import type { MatchConfig, MatchRecord } from './types'

/**
 * What the New Game form produces: the rules, who you play, and which side
 * you take. It is turned into a match record by `recordFromSetup`, and can
 * also be read from a URL so the home page's quick-play cards are plain links.
 */
export type OpponentChoice = 'hotseat' | 'online' | DifficultyId

export interface GameSetup {
  settings: RuleSettings
  opponent: OpponentChoice
  /** The side the person at this device plays (ignored for hot seat). */
  side: PlayerId
}

export const DEFAULT_SETUP: GameSetup = {
  settings: makeSettings(),
  opponent: 'ndo',
  side: 'player1',
}

/** Read an opponent choice, accepting tier ids from older links and saves. */
const parseOpponent = (value: unknown): OpponentChoice | null =>
  value === 'hotseat' || value === 'online' ? value : normalizeDifficultyId(value)

export function loadLastSetup(): GameSetup {
  const saved = storage.get<Partial<GameSetup>>(STORAGE_KEYS.lastSetup)
  if (!saved || typeof saved !== 'object') return DEFAULT_SETUP
  return {
    settings: makeSettings(saved.settings && typeof saved.settings === 'object' ? saved.settings : {}),
    opponent: parseOpponent(saved.opponent) ?? DEFAULT_SETUP.opponent,
    side: saved.side === 'player2' ? 'player2' : 'player1',
  }
}

export const saveLastSetup = (setup: GameSetup) => storage.set(STORAGE_KEYS.lastSetup, setup)

/** Build the match record a setup describes. Names left empty use the theme's side names. */
export function recordFromSetup(setup: GameSetup): MatchRecord {
  const other: PlayerId = setup.side === 'player1' ? 'player2' : 'player1'
  let seats: MatchConfig['seats']
  if (setup.opponent === 'hotseat') {
    seats = { player1: { kind: 'human', name: '' }, player2: { kind: 'human', name: '' } }
  } else if (setup.opponent === 'online') {
    seats = { [setup.side]: { kind: 'human', name: '' }, [other]: { kind: 'remote', name: '' } } as MatchConfig['seats']
  } else {
    const tier = DIFFICULTIES[setup.opponent]
    seats = {
      [setup.side]: { kind: 'human', name: '' },
      [other]: { kind: 'ai', name: tier.name, difficulty: tier.id },
    } as MatchConfig['seats']
  }
  return createRecord({ mode: setup.opponent === 'online' ? 'online' : 'local', settings: setup.settings, seats })
}

// -- URL form, for links such as /match/new?size=7&vs=maam&side=player2 ------

const POLICIES: PromotionPolicy[] = ['promote-and-continue', 'promote-after-chain', 'end-turn-on-promotion', 'match-opponent']

export function setupToParams(setup: GameSetup): URLSearchParams {
  const { settings } = setup
  const params = new URLSearchParams()
  params.set('size', String(settings.boardSize))
  params.set('promo', settings.promotionPolicy)
  params.set('scope', settings.call.scope)
  params.set('chain', settings.call.abandonedChainCallable ? '1' : '0')
  params.set('three', settings.draw.threefoldRepetition ? '1' : '0')
  params.set('nocap', String(settings.draw.pliesWithoutCapture ?? 0))
  if (settings.timeControl) params.set('tc', settings.timeControl.label)
  params.set('vs', setup.opponent)
  params.set('side', setup.side)
  return params
}

/** Read a setup from a query string. Unknown or missing values fall back to defaults. */
export function setupFromParams(params: URLSearchParams): GameSetup {
  const rawSize = Number(params.get('size'))
  const boardSize = ([5, 6, 7, 8, 9] as number[]).includes(rawSize) ? (rawSize as BoardSize) : 5
  const rawPolicy = params.get('promo')
  const noCap = Number(params.get('nocap'))
  const tcLabel = params.get('tc')
  // `ai` is the older name for the opponent parameter.
  const vs = params.get('vs') ?? params.get('ai') ?? 'hotseat'

  return {
    settings: makeSettings({
      boardSize,
      boardType: boardTypeForSize(boardSize),
      promotionPolicy: POLICIES.includes(rawPolicy as PromotionPolicy) ? (rawPolicy as PromotionPolicy) : 'promote-and-continue',
      call: {
        scope: params.get('scope') === 'all' ? 'all' : 'choose-one',
        abandonedChainCallable: params.get('chain') !== '0',
      },
      draw: {
        threefoldRepetition: params.get('three') !== '0',
        // Missing: the default (50). Present: 0 turns the rule off; anything else is clamped to sane values.
        pliesWithoutCapture: !params.has('nocap')
          ? DEFAULT_SETUP.settings.draw.pliesWithoutCapture
          : Number.isFinite(noCap) && noCap > 0
            ? Math.min(400, Math.round(noCap))
            : null,
      },
      timeControl: tcLabel ? (TIME_CONTROLS.find((tc) => tc.label === tcLabel) ?? null) : null,
    }),
    opponent: parseOpponent(vs) ?? 'hotseat',
    side: params.get('side') === 'player2' ? 'player2' : 'player1',
  }
}

/** Describe the opponent in a few words, for cards and summaries. */
export function opponentLabel(opponent: OpponentChoice): string {
  if (opponent === 'hotseat') return 'Two players, one device'
  if (opponent === 'online') return 'Online, by invite link'
  return `Computer · ${DIFFICULTIES[opponent].name}`
}
