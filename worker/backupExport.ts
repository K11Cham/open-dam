/**
 * The weekly backup: the accounts database written as one JSON file to an R2
 * bucket the owner creates. Durable Objects already keep 30 days of history
 * for point-in-time restore (worker/admin.ts); this is the copy that outlives
 * those 30 days, and one that lives apart from the object itself.
 *
 * Off until the owner turns it on: with no bucket bound, the scheduled run
 * does nothing. docs/OPERATIONS.md ("Weekly export") has the steps: create
 * the bucket, then uncomment the `r2_buckets` and `triggers` blocks in
 * wrangler.jsonc and deploy.
 *
 * The file holds every account's salted key hash and recovery hash. They are
 * not passwords, but the bucket must stay private (R2 buckets are, unless
 * someone turns on public access).
 */

import type { AccountsExport } from './accountStore'

/** The part of an R2 bucket the export uses, so tests can pass a fake. */
export interface BackupBucket {
  put(key: string, value: string): Promise<unknown>
  list(options: { prefix: string }): Promise<{ objects: Array<{ key: string }> }>
  delete(keys: string[]): Promise<unknown>
}

/** Where exports live in the bucket; the rest of the bucket is left alone. */
export const BACKUP_PREFIX = 'accounts/'

/** How many weekly exports are kept: about three months. */
export const KEEP_EXPORTS = 12

/** `accounts/2026-11-09.json`: dated, so a listing sorts oldest first and two runs on one day overwrite each other. */
export const backupKey = (at: number) => `${BACKUP_PREFIX}${new Date(at).toISOString().slice(0, 10)}.json`

export interface BackupExportOptions {
  bucket: BackupBucket | undefined
  exportAll: () => Promise<AccountsExport | Record<string, unknown>>
  now?: () => number
}

export type BackupExportResult = { ran: false; reason: 'no-bucket' } | { ran: true; key: string; bytes: number; deleted: number }

/**
 * Write this week's export and delete those beyond the newest `KEEP_EXPORTS`.
 * A failure is thrown, not swallowed: Cloudflare then marks the scheduled run
 * as failed, which is what the owner's alert keys on (OPERATIONS.md).
 */
export async function runBackupExport({ bucket, exportAll, now = Date.now }: BackupExportOptions): Promise<BackupExportResult> {
  if (!bucket) return { ran: false, reason: 'no-bucket' }
  const at = now()
  const body = JSON.stringify(await exportAll())
  const key = backupKey(at)
  await bucket.put(key, body)
  // R2 lists keys in order, but a listing is sorted here as well so the rule does not depend on it.
  const listed = await bucket.list({ prefix: BACKUP_PREFIX })
  const keys = listed.objects.map((object) => object.key).sort()
  const old = keys.slice(0, Math.max(0, keys.length - KEEP_EXPORTS))
  if (old.length > 0) await bucket.delete(old)
  return { ran: true, key, bytes: body.length, deleted: old.length }
}
