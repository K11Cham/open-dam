// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BACKUP_PREFIX, KEEP_EXPORTS, backupKey, runBackupExport } from './backupExport'
import type { BackupBucket } from './backupExport'

/** An R2 bucket in memory, recording what was written and deleted. */
function fakeBucket(existing: string[] = []): BackupBucket & { objects: Map<string, string> } {
  const objects = new Map<string, string>(existing.map((key) => [key, '{}']))
  return {
    objects,
    put: async (key, value) => {
      objects.set(key, value)
    },
    list: async ({ prefix }) => ({
      objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
    }),
    delete: async (keys) => {
      for (const key of keys) objects.delete(key)
    },
  }
}

const dump = { format: 'open-dam/accounts-export', version: 1, schemaVersion: 4, exportedAt: 0, tables: {} }
const monday = Date.UTC(2026, 10, 9, 3, 0)

describe('the weekly backup export', () => {
  it('does nothing until the owner binds a bucket', async () => {
    const result = await runBackupExport({ bucket: undefined, exportAll: async () => dump, now: () => monday })
    expect(result).toEqual({ ran: false, reason: 'no-bucket' })
  })

  it('writes the accounts database under the date', async () => {
    const bucket = fakeBucket()
    const result = await runBackupExport({ bucket, exportAll: async () => dump, now: () => monday })
    expect(result).toMatchObject({ ran: true, key: `${BACKUP_PREFIX}2026-11-09.json` })
    expect(JSON.parse(bucket.objects.get(backupKey(monday))!)).toEqual(dump)
  })

  it(`keeps the newest ${KEEP_EXPORTS} exports and deletes older ones`, async () => {
    const week = 7 * 24 * 60 * 60 * 1000
    const old = Array.from({ length: KEEP_EXPORTS + 2 }, (_, i) => backupKey(monday - (i + 1) * week))
    const bucket = fakeBucket([...old, 'something-else.txt'])
    await runBackupExport({ bucket, exportAll: async () => dump, now: () => monday })
    const kept = [...bucket.objects.keys()].filter((key) => key.startsWith(BACKUP_PREFIX)).sort()
    expect(kept).toHaveLength(KEEP_EXPORTS)
    expect(kept.at(-1)).toBe(backupKey(monday))
    expect(bucket.objects.has('something-else.txt')).toBe(true)
  })

  it('lets a failure through, so the scheduled run is marked failed and the log says why', async () => {
    const bucket = fakeBucket()
    await expect(
      runBackupExport({
        bucket,
        exportAll: async () => {
          throw new Error('Accounts unreachable')
        },
        now: () => monday,
      }),
    ).rejects.toThrow('Accounts unreachable')
    expect(bucket.objects.size).toBe(0)
  })
})
