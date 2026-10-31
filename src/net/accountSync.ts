import { ARCHIVE_LIMIT, clearArchiveHere, loadArchive, mergeArchive } from '../match/storage'
import { STORAGE_KEYS, storage } from '../services/storage'
import { fetchArchive, fetchData, putArchived, putData } from './accountApi'
import type { SyncedData } from './accountApi'

/**
 * Keeps a signed-in person's settings and finished games the same on every
 * device. Local storage stays the working copy (the app reads it as it always
 * has); this module copies changes up to the account and the account's
 * changes down.
 *
 *  - Settings (theme, sound, preferences, the last New Game form, solved
 *    puzzles) are one value each. The newer copy wins, judged by when each
 *    device last changed it; solved puzzles are combined instead, since
 *    solving one on a phone should not unsolve one on a laptop.
 *  - Finished games are combined by id: each device sends the ones the
 *    account lacks and adds the ones it lacks itself.
 *
 * On signing out, the account's games and puzzle progress are removed from
 * the device, so the next person to sign in there does not inherit them.
 * Device comforts (theme, sound, preferences) stay.
 */

/** The account's name for each synced setting, and where this device keeps it. */
const SYNCED: Record<string, string> = {
  theme: STORAGE_KEYS.theme,
  sound: STORAGE_KEYS.sound,
  prefs: STORAGE_KEYS.prefs,
  lastSetup: STORAGE_KEYS.lastSetup,
  puzzles: STORAGE_KEYS.puzzles,
}
const BY_STORAGE_KEY = Object.fromEntries(Object.entries(SYNCED).map(([name, key]) => [key, name]))

/** Changes are gathered for a moment, so dragging the volume slider is one upload, not fifty. */
const PUSH_DELAY_MS = 800

type Meta = Record<string, number>
const readMeta = (): Meta => storage.get<Meta>(STORAGE_KEYS.syncMeta) ?? {}

const union = (a: unknown, b: unknown): string[] => {
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  return [...new Set([...list(a), ...list(b)])]
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'error'
  /** Epoch ms of the last successful exchange. */
  at: number | null
}

class AccountSync {
  private signedIn = false
  private pending = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  /** Games the account is known to have, so each is sent once. */
  private uploaded = new Set<string>()
  private status: SyncStatus = { state: 'idle', at: null }
  private listeners = new Set<() => void>()

  constructor() {
    // Watching starts at once, so a change made while signed out is dated and wins on the next sign-in if it is newer.
    storage.subscribe((key, origin) => {
      if (origin !== 'local') return
      const name = BY_STORAGE_KEY[key]
      if (name) {
        storage.set(STORAGE_KEYS.syncMeta, { ...readMeta(), [name]: Date.now() }, 'remote')
        if (this.signedIn) this.queue(name)
      } else if (key === STORAGE_KEYS.archive && this.signedIn) {
        void this.pushArchive()
      }
    })
  }

  getStatus = () => this.status
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private setStatus(state: SyncStatus['state']) {
    this.status = { state, at: state === 'synced' ? Date.now() : this.status.at }
    for (const listener of [...this.listeners]) listener()
  }

  private queue(name: string) {
    this.pending.add(name)
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), PUSH_DELAY_MS)
  }

  private async flush() {
    this.timer = undefined
    if (!this.signedIn || this.pending.size === 0) return
    const meta = readMeta()
    const entries: SyncedData = {}
    for (const name of this.pending) {
      entries[name] = { value: storage.get(SYNCED[name]), updatedAt: meta[name] ?? Date.now() }
    }
    this.pending.clear()
    this.setStatus('syncing')
    try {
      await putData(entries)
      this.setStatus('synced')
    } catch {
      this.setStatus('error')
    }
  }

  /** Signed in (or the page opened while signed in): bring both copies together. */
  async start() {
    this.signedIn = true
    this.setStatus('syncing')
    try {
      await this.pullSettings()
      await this.syncArchive()
      this.setStatus('synced')
    } catch {
      this.setStatus('error')
    }
  }

  private async pullSettings() {
    const remote = await fetchData()
    const meta = readMeta()
    const nextMeta = { ...meta }
    for (const [name, key] of Object.entries(SYNCED)) {
      const theirs = remote[name]
      const local = storage.get<unknown>(key)
      if (name === 'puzzles') {
        const merged = union(local, theirs?.value)
        const changedHere = merged.length !== union(local, []).length
        if (changedHere) storage.set(key, merged, 'remote')
        if (!theirs || merged.length !== union(theirs.value, []).length) this.queue(name)
        nextMeta[name] = Math.max(meta[name] ?? 0, theirs?.updatedAt ?? 0)
        continue
      }
      const mine = meta[name]
      if (theirs && (mine === undefined || theirs.updatedAt > mine || local === null)) {
        // The account's copy is newer, or this device never chose: take it.
        if (theirs.value === null) storage.remove(key, 'remote')
        else storage.set(key, theirs.value, 'remote')
        nextMeta[name] = theirs.updatedAt
      } else if (local !== null && (!theirs || (mine ?? 0) > theirs.updatedAt)) {
        this.queue(name)
      }
    }
    storage.set(STORAGE_KEYS.syncMeta, nextMeta, 'remote')
  }

  private async syncArchive() {
    const remote = await fetchArchive()
    this.uploaded = new Set(remote.map((game) => game.id))
    mergeArchive(remote.slice(0, ARCHIVE_LIMIT))
    await this.pushArchive()
  }

  private async pushArchive() {
    for (const { record, finishedAt } of loadArchive()) {
      const id = record.config.id
      if (this.uploaded.has(id)) continue
      this.uploaded.add(id)
      try {
        await putArchived(id, finishedAt, record)
      } catch {
        // Tried again on the next sign-in.
        this.uploaded.delete(id)
      }
    }
  }

  /** Signed out: stop copying, and take the account's games and progress off this device. */
  stop() {
    this.signedIn = false
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.pending.clear()
    this.uploaded.clear()
    clearArchiveHere('remote')
    storage.remove(STORAGE_KEYS.puzzles, 'remote')
    storage.remove(STORAGE_KEYS.syncMeta, 'remote')
    this.setStatus('idle')
  }

  /** Before signing out, send anything still waiting. */
  async drain() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    await this.flush()
  }
}

export const accountSync = new AccountSync()
