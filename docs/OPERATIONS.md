# Operations

How to look after the live site: the owner's secrets, backups and restores,
where errors show up, and moderation. Every command here is run by the owner,
from this repository, signed in with `npx wrangler login`.

The live site is https://play.open-dam.workers.dev. Below, `$SITE` is that
address and `$ADMIN_TOKEN` the admin token:

```bash
export SITE=https://play.open-dam.workers.dev
export ADMIN_TOKEN=...   # the value you gave `wrangler secret put ADMIN_TOKEN`
```

## Secrets

| Secret           | What it is for                                                                                                                                          | Without it                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_TOKEN`    | Opens the maintenance routes under `/api/admin` (backups, moderation). At least 32 characters.                                                          | Every `/api/admin` path answers 404.                                                                                       |
| `IP_HASH_SECRET` | The key network addresses are hashed with (sign-up limits, failed sign-ins, rate limits), so a stored hash cannot be reversed by hashing every address. | Addresses are hashed without a key, and a `no-ip-hash-secret` warning is logged once each time the Accounts object starts. |

Make a long random value and set it (the command asks for the value):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put IP_HASH_SECRET
```

Setting `IP_HASH_SECRET` (or changing it) resets the counts kept by hashed
address: limits start again from zero, which is harmless.

A secret takes effect at once, with no deploy. Keep the token somewhere safe;
anyone who has it can roll the database back and rename or suspend accounts.
To change it, run `wrangler secret put` again.

The admin routes answer 404 to a missing or wrong token, exactly as if they
did not exist, and one network may try 30 times per 15 minutes.

## Backups and restoring the accounts database

Every account, session, rating, online game, synced setting and archived
game lives in one Durable Object, `Accounts`, in its SQLite database.
Cloudflare keeps the history of every SQLite-backed Durable Object for **30
days** (point-in-time recovery), so a bad deploy or a bug that damages rows
can be undone to any moment in that window. Nothing needs to be set up for
this; it is always on.

Point-in-time recovery does not exist under `wrangler dev`; practise against
the live site only when you mean it.

### Restore, step by step

1. **Decide the moment.** Find when things went wrong: the deploy time
   (`npx wrangler deployments list`), or the first error in Workers Logs
   (Cloudflare dashboard → Workers & Pages → play → Logs). Pick a moment just
   before it, in UTC.

2. **Get a bookmark for it.** The answer also has the current bookmark; write
   it down, since it is how you come back to now.

   ```bash
   curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
     "$SITE/api/admin/backup/bookmark?at=2026-11-08T09:30:00Z"
   # {"bookmark":"0000…","current":"0000…","at":"2026-11-08T09:30:00.000Z"}
   ```

3. **If the damage came from code, deploy the fix (or roll back the code)
   first** (`npx wrangler rollback` to the previous version, or deploy a
   fixed one), so the restored database is not damaged again.

4. **Restore.** The object restarts at once with its database as it was at
   the bookmark. Requests in flight for a moment fail and are retried by the
   pages.

   ```bash
   curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"bookmark":"<bookmark from step 2>"}' \
     "$SITE/api/admin/backup/restore"
   # {"undo":"0000…"}
   ```

   Keep the `undo` bookmark: restoring it puts everything back as it was just
   before this restore.

5. **Check.** Sign in, open a profile and a leaderboard, and run
   `ONLINE_URL=$SITE npm run check:online`.

### What a restore does and does not touch

- Everything in the Accounts database goes back to the bookmark: accounts
  made since are gone (their owners sign up again), passwords and recovery
  codes changed since are back to the old ones, sessions started since are
  signed out, and online games finished since are no longer in histories or
  ratings.
- Games still being played live in their own match rooms and are not
  touched. A game that finished after the bookmark was already reported; its
  room does not report it again, so it stays missing from histories.
- The lobby holds nothing worth keeping.

### Weekly export (off until you turn it on)

Point-in-time recovery covers mistakes, not the loss of the Cloudflare
account or more than 30 days. The weekly export writes the whole accounts
database as one JSON file to an R2 bucket (`worker/backupExport.ts`): every
account (with its salted key and recovery hashes, never a password),
ratings, finished games, synced settings and archives, reports and held
usernames. Sessions, failed sign-ins and request counts are left out. It
keeps the newest 12 exports (about three months) and deletes older ones.

The file holds password and recovery-code hashes, so the bucket must stay
private. R2 buckets are private unless you turn on public access; never do
that for this one.

To turn it on:

0. The privacy notice (`/privacy`, "How long") already says backup copies
   of a deleted account are gone within 12 weeks. If you change
   `KEEP_EXPORTS` in `worker/backupExport.ts`, change that sentence too.
1. Create the bucket:
   ```bash
   npx wrangler r2 bucket create open-dam-backups
   ```
2. In `wrangler.jsonc`, uncomment the two lines under "The weekly accounts
   export": `r2_buckets` and `triggers` (Mondays at 03:00 UTC).
3. Deploy (`npm run deploy`).
4. Check the first run. Either wait for Monday, or trigger it from the
   dashboard (Workers & Pages → play → Settings → Trigger Events → the cron →
   "Run"). Then look for it in the logs (`event = "backup-export"`, with the
   file name and size) and in the bucket:
   ```bash
   npx wrangler r2 object get open-dam-backups/accounts/<YYYY-MM-DD>.json --remote --file latest-export.json
   ```
5. Keep a copy somewhere outside Cloudflare now and then (download the
   newest file to your own computer), so an export survives losing the
   account too.

To check it locally without touching Cloudflare: copy `wrangler.jsonc` with
both lines uncommented to a scratch config, run
`npx wrangler dev --config <it> --port 8788 --test-scheduled`, sign up an
account, then open `http://localhost:8788/cdn-cgi/handler/scheduled?cron=0+3+*+*+1`.
The log shows `backup-export` and `npx wrangler r2 object get
open-dam-backups/accounts/<date>.json --local --pipe --config <it>` prints
the file.

Restoring from an export is not automated: it is rows to put back into the
tables of the same names, and `schemaVersion` says which table shapes they
have. Until the bucket exists, each player can download everything kept for
them (Settings → Your data).

## When something breaks

Nothing is sent to any third-party service. Everything goes to **Workers
Logs** (Cloudflare dashboard → Workers & Pages → play → Logs, kept a few
days on the free plan), one JSON line per event:

| `event`                | Meaning                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker-error`         | An unexpected error in the Worker. The visitor got JSON `{ error, requestId }` with status 500; `requestId` is Cloudflare's Ray id for that request.             |
| `client-error`         | The app crashed in someone's browser (`kind`: `render`, `error` or `unhandledrejection`), with the page's path and the message, and nothing about them.          |
| `report-failed`        | A finished game could not reach the Accounts object; the match room retries it (1, 5, 30 minutes, then hourly).                                                  |
| `housekeeping`         | (level `info`) The daily clean-up of the accounts database: how many expired sessions, old failure and request counts, and day-old sign-up addresses it removed. |
| `report-abandoned`     | A game's report was still failing when its room was cleaned up after 30 days; that game is not in anyone's history.                                              |
| `backup-export`        | (level `info`) The weekly export ran: the file name, its size in bytes, and how many old exports it deleted.                                                     |
| `backup-export-failed` | The weekly export could not be written; the run also shows as failed under Trigger Events. Run it again from there once the cause is fixed.                      |

Filter on `level = "error"` to see all of them. A person who saw an error
message with a request id can send it to you; search the logs for it.

### Is it healthy? A five-minute check

Once a week, or whenever someone says something is wrong:

1. **The site opens:** https://play.open-dam.workers.dev loads, and
   `curl -s $SITE/api/me` answers `{"user":null}` (JSON, not an error page).
2. **Errors:** in Workers Logs, filter `level = "error"` for the last day.
   A few `client-error` lines from old browsers are normal. Any
   `worker-error`, more than a handful of `report-failed`, or any
   `report-abandoned` or `backup-export-failed` needs a look.
3. **Housekeeping ran:** one `housekeeping` line in the last 24 hours. None
   means the Accounts object's daily alarm stopped; it is set again the
   next time that object starts (an account request after a quiet spell).
4. **Games finish and are rated:** open the leaderboard for a pool people
   play; the newest games on a top player's profile should be from the last
   few days if people are playing.
5. **A real game:** `ONLINE_URL=$SITE npm run check:online` plays real games
   against the live site with two throwaway accounts and deletes them again.
6. **Backups:** with the export on, the newest file in the bucket is less
   than eight days old.

What to alert on, if you set up Cloudflare's notifications (dashboard →
Notifications): Workers errors above a few per hour, and a failed cron
trigger. Both key on what this page lists; nothing else needs watching.

In the app, a page that crashes shows "Something went wrong" with Reload and
Home instead of a blank page; a game in progress is saved after every move,
so reloading continues it.

## Moderation

Players report one another from a profile ("Report", signed in, ten an hour
per network). Display names may not look like the computer players, the site
or its staff ("Seriñ", "SERIN", "S.e.r.i.n" and "admin" are all refused;
accents, case and punctuation are ignored), the same list usernames use.

**Read the reports**, newest first, 50 at a time (`before` pages back by
time):

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$SITE/api/admin/reports"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$SITE/api/admin/reports?before=1762600000000"
```

Each report has the reporter, the reported player (with their current
display name and bio) and the reason.

**Reset a display name and bio** (the name goes back to the username):

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "$SITE/api/admin/users/troll/reset-profile"
```

**Rename a username** (for an offensive or impersonating one). The player is
signed out everywhere, and because a password's key is made with the
username, their old password stops working: they set a new one with their
recovery code under the new name (Sign in → Forgot your password?). The
old name is then held for 30 days for nobody, not even them.

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"newUsername":"player_7"}' "$SITE/api/admin/users/troll/rename"
```

**Suspend an account**, or lift a suspension. A suspended player is signed
out everywhere, cannot sign in, seek rated games or report, and disappears
from leaderboards and profiles; their games stay in opponents' histories.

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"suspended":true}' "$SITE/api/admin/users/troll/suspend"
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"suspended":false}' "$SITE/api/admin/users/troll/suspend"
```
