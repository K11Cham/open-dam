import { isDifficultyId } from '../ai/difficulty'
import { makeSettings } from '../game/settings'
import type { PlayerId } from '../game/types'
import { storage } from '../services/storage'
import { replay } from './reducer'
import type { MatchAction, MatchRecord, MatchState, Seat } from './types'

/**
 * Saving and loading matches. Saved data is untrusted input — it may be from
 * an older version, hand-edited, or truncated — so everything is validated and
 * replayed before use, and anything that does not replay cleanly is dropped
 * rather than crashing the app.
 */

const ACTIVE_KEY = 'openDam.activeMatch'
const ARCHIVE_KEY = 'openDam.archive'
const LEGACY_KEYS = ['openDam.resumeMatch']
const ARCHIVE_LIMIT = 20

interface SavedActive {
  record: MatchRecord
  /** When the record was last written, so a closed app's clock can be paused. */
  savedAt: number
}

export interface ArchivedMatch {
  record: MatchRecord
  finishedAt: number
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isSeat = (value: unknown): value is Seat =>
  isObject(value) &&
  (value.kind === 'human' || value.kind === 'ai' || value.kind === 'remote') &&
  typeof value.name === 'string' &&
  (value.difficulty === undefined || isDifficultyId(value.difficulty))

const isAction = (value: unknown): value is MatchAction =>
  isObject(value) && typeof value.seq === 'number' && typeof value.at === 'number' && typeof value.by === 'string' && isObject(value.intent)

/** Validate the shape, normalise settings, and prove the log replays. */
export function parseRecord(value: unknown): { record: MatchRecord; state: MatchState } | null {
  if (!isObject(value) || value.format !== 'open-dam/match' || value.version !== 1) return null
  const config = value.config
  if (!isObject(config) || typeof config.id !== 'string' || !isObject(config.seats)) return null
  if (config.mode !== 'local' && config.mode !== 'online') return null
  const seats = config.seats as Record<string, unknown>
  if (!isSeat(seats.player1) || !isSeat(seats.player2)) return null
  if (!Array.isArray(value.actions) || !value.actions.every(isAction)) return null

  const record: MatchRecord = {
    format: 'open-dam/match',
    version: 1,
    config: {
      id: config.id,
      mode: config.mode,
      createdAt: typeof config.createdAt === 'number' ? config.createdAt : Date.now(),
      seats: { player1: seats.player1, player2: seats.player2 },
      settings: makeSettings(isObject(config.settings) ? (config.settings as object) : {}),
    },
    actions: value.actions as MatchAction[],
  }
  try {
    return { record, state: replay(record) }
  } catch {
    return null
  }
}

export function saveActiveMatch(record: MatchRecord, now = Date.now()) {
  storage.set<SavedActive>(ACTIVE_KEY, { record, savedAt: now })
}

export function clearActiveMatch() {
  storage.remove(ACTIVE_KEY)
}

export function loadActiveMatch(): { record: MatchRecord; state: MatchState; savedAt: number } | null {
  for (const key of LEGACY_KEYS) storage.remove(key)
  const saved = storage.get<SavedActive>(ACTIVE_KEY)
  if (!isObject(saved)) return null
  const parsed = parseRecord(saved.record)
  if (!parsed) {
    clearActiveMatch()
    return null
  }
  return { ...parsed, savedAt: typeof saved.savedAt === 'number' ? saved.savedAt : Date.now() }
}

/**
 * When a local game is reopened, the time it spent closed should not count
 * against whoever was on move. Append a pause at the moment it was last saved
 * and a resume now. Online games are not paused: the opponent's time is real.
 */
export function resumeAfterGap(record: MatchRecord, state: MatchState, savedAt: number, now = Date.now()): MatchRecord {
  if (record.config.mode !== 'local' || !state.clock || state.position.status.kind !== 'playing') return record
  if (!state.clock.running) return record
  const actions = [...record.actions]
  let seq = state.lastSeq
  const lastAt = actions.at(-1)?.at ?? record.config.createdAt
  if (!state.clock.paused) actions.push({ seq: ++seq, at: Math.max(savedAt, lastAt), by: 'system', intent: { type: 'pause' } })
  actions.push({ seq: ++seq, at: Math.max(now, savedAt, lastAt), by: 'system', intent: { type: 'resume' } })
  return { ...record, actions }
}

export function loadArchive(): ArchivedMatch[] {
  const saved = storage.get<unknown>(ARCHIVE_KEY)
  if (!Array.isArray(saved)) return []
  const out: ArchivedMatch[] = []
  for (const entry of saved) {
    if (!isObject(entry)) continue
    const parsed = parseRecord(entry.record)
    if (parsed && parsed.state.position.status.kind !== 'playing') {
      out.push({ record: parsed.record, finishedAt: typeof entry.finishedAt === 'number' ? entry.finishedAt : 0 })
    }
  }
  return out
}

/** Keep the last few finished games for the home page and review. */
export function archiveMatch(record: MatchRecord, finishedAt = Date.now()) {
  const existing = loadArchive().filter((entry) => entry.record.config.id !== record.config.id)
  storage.set<ArchivedMatch[]>(ARCHIVE_KEY, [{ record, finishedAt }, ...existing].slice(0, ARCHIVE_LIMIT))
}

export function findArchived(id: string): ArchivedMatch | null {
  return loadArchive().find((entry) => entry.record.config.id === id) ?? null
}

/** Side names for display, from the seats. */
export const seatName = (record: MatchRecord, player: PlayerId): string => record.config.seats[player].name
