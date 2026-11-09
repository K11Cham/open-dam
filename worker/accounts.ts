import { DurableObject } from 'cloudflare:workers'
import { AccountStore } from './accountStore'
import { Backups } from './admin'

/** How often the accounts database is tidied. */
const HOUSEKEEPING_MS = 24 * 60 * 60 * 1000
import type { Env } from './index'

/**
 * The one Durable Object that holds every account (worker/accountStore.ts has
 * the logic). One object keeps usernames unique without a separate database
 * and is plenty for this game's traffic; its SQLite storage is part of the
 * free plan. The Worker calls the store's methods on it directly (Durable
 * Object RPC), so each method here is the store's own.
 */
export class Accounts extends DurableObject<Env> {
  readonly store: AccountStore
  private readonly backups: Backups

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const sql = ctx.storage.sql
    this.store = new AccountStore(
      { exec: (query, ...bindings) => sql.exec(query, ...bindings).toArray() as never },
      { ipSecret: env.IP_HASH_SECRET },
    )
    // The daily clean-up keeps itself scheduled; the first start sets it going.
    void ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(Date.now() + HOUSEKEEPING_MS)
    })
    // A restore happens when the object next starts. The restart waits a moment so the admin's answer gets out first.
    this.backups = new Backups(ctx.storage, () => setTimeout(() => ctx.abort('Restoring a backup'), 100))
  }

  /** Once a day: clear expired sessions, old failure and request counts, and day-old sign-up addresses. */
  async alarm() {
    const removed = this.store.housekeeping()
    console.log(JSON.stringify({ level: 'info', event: 'housekeeping', ...removed }))
    await this.ctx.storage.setAlarm(Date.now() + HOUSEKEEPING_MS)
  }

  report(...args: Parameters<AccountStore['report']>) {
    return this.store.report(...args)
  }
  // Moderation, for the admin routes only (worker/admin.ts).
  reports(...args: Parameters<AccountStore['reports']>) {
    return this.store.reports(...args)
  }
  resetProfile(...args: Parameters<AccountStore['resetProfile']>) {
    return this.store.resetProfile(...args)
  }
  renameUser(...args: Parameters<AccountStore['renameUser']>) {
    return this.store.renameUser(...args)
  }
  suspendUser(...args: Parameters<AccountStore['suspendUser']>) {
    return this.store.suspendUser(...args)
  }

  /** A restore point for the accounts database (admin only; worker/admin.ts). */
  bookmarkFor(at: number) {
    return this.backups.bookmarkFor(at)
  }
  /** Roll the accounts database back to a bookmark (admin only). */
  restoreTo(bookmark: string) {
    return this.backups.restoreTo(bookmark)
  }

  // Each public method below is one call the Worker or a match room makes.
  // They forward to the store; Durable Object RPC needs them on the class itself.

  usernameProblem(...args: Parameters<AccountStore['usernameProblem']>) {
    return this.store.usernameProblem(...args)
  }
  me(...args: Parameters<AccountStore['me']>) {
    return this.store.me(...args)
  }
  authenticate(...args: Parameters<AccountStore['authenticate']>) {
    return this.store.authenticate(...args)
  }
  signOut(...args: Parameters<AccountStore['signOut']>) {
    return this.store.signOut(...args)
  }
  sessions(...args: Parameters<AccountStore['sessions']>) {
    return this.store.sessions(...args)
  }
  revokeSession(...args: Parameters<AccountStore['revokeSession']>) {
    return this.store.revokeSession(...args)
  }
  revokeOtherSessions(...args: Parameters<AccountStore['revokeOtherSessions']>) {
    return this.store.revokeOtherSessions(...args)
  }
  signUp(...args: Parameters<AccountStore['signUp']>) {
    return this.store.signUp(...args)
  }
  signIn(...args: Parameters<AccountStore['signIn']>) {
    return this.store.signIn(...args)
  }
  changePassword(...args: Parameters<AccountStore['changePassword']>) {
    return this.store.changePassword(...args)
  }
  changeUsername(...args: Parameters<AccountStore['changeUsername']>) {
    return this.store.changeUsername(...args)
  }
  replaceRecoveryCode(...args: Parameters<AccountStore['replaceRecoveryCode']>) {
    return this.store.replaceRecoveryCode(...args)
  }
  recover(...args: Parameters<AccountStore['recover']>) {
    return this.store.recover(...args)
  }
  updateProfile(...args: Parameters<AccountStore['updateProfile']>) {
    return this.store.updateProfile(...args)
  }
  deleteAccount(...args: Parameters<AccountStore['deleteAccount']>) {
    return this.store.deleteAccount(...args)
  }
  data(...args: Parameters<AccountStore['data']>) {
    return this.store.data(...args)
  }
  putData(...args: Parameters<AccountStore['putData']>) {
    return this.store.putData(...args)
  }
  archive(...args: Parameters<AccountStore['archive']>) {
    return this.store.archive(...args)
  }
  putArchive(...args: Parameters<AccountStore['putArchive']>) {
    return this.store.putArchive(...args)
  }
  deleteArchive(...args: Parameters<AccountStore['deleteArchive']>) {
    return this.store.deleteArchive(...args)
  }
  clearArchive(...args: Parameters<AccountStore['clearArchive']>) {
    return this.store.clearArchive(...args)
  }
  ratings(...args: Parameters<AccountStore['ratings']>) {
    return this.store.ratings(...args)
  }
  ratingMap(...args: Parameters<AccountStore['ratingMap']>) {
    return this.store.ratingMap(...args)
  }
  players(...args: Parameters<AccountStore['players']>) {
    return this.store.players(...args)
  }
  recordGame(...args: Parameters<AccountStore['recordGame']>) {
    return this.store.recordGame(...args)
  }
  gamesOf(...args: Parameters<AccountStore['gamesOf']>) {
    return this.store.gamesOf(...args)
  }
  game(...args: Parameters<AccountStore['game']>) {
    return this.store.game(...args)
  }
  profile(...args: Parameters<AccountStore['profile']>) {
    return this.store.profile(...args)
  }
  gamesVisible(...args: Parameters<AccountStore['gamesVisible']>) {
    return this.store.gamesVisible(...args)
  }
  pools(...args: Parameters<AccountStore['pools']>) {
    return this.store.pools(...args)
  }
  leaderboard(...args: Parameters<AccountStore['leaderboard']>) {
    return this.store.leaderboard(...args)
  }
  export(...args: Parameters<AccountStore['export']>) {
    return this.store.export(...args)
  }
  throttle(...args: Parameters<AccountStore['throttle']>) {
    return this.store.throttle(...args)
  }
}
