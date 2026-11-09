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

### Copies outside Cloudflare (not set up)

Point-in-time recovery covers mistakes, not the loss of the Cloudflare
account. A weekly export of the whole database to an R2 bucket would cover
that too; it is not built, because it needs a bucket the owner creates
(`npx wrangler r2 bucket create open-dam-backups`) and a binding. Until then,
each player can download everything kept for them (Settings → Your data).

## When something breaks

Nothing is sent to any third-party service. Everything goes to **Workers
Logs** (Cloudflare dashboard → Workers & Pages → play → Logs, kept a few
days on the free plan), one JSON line per event:

| `event`            | Meaning                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker-error`     | An unexpected error in the Worker. The visitor got JSON `{ error, requestId }` with status 500; `requestId` is Cloudflare's Ray id for that request.             |
| `client-error`     | The app crashed in someone's browser (`kind`: `render`, `error` or `unhandledrejection`), with the page's path and the message, and nothing about them.          |
| `report-failed`    | A finished game could not reach the Accounts object; the match room retries it (1, 5, 30 minutes, then hourly).                                                  |
| `housekeeping`     | (level `info`) The daily clean-up of the accounts database: how many expired sessions, old failure and request counts, and day-old sign-up addresses it removed. |
| `report-abandoned` | A game's report was still failing when its room was cleaned up after 30 days; that game is not in anyone's history.                                              |

Filter on `level = "error"` to see all of them. A person who saw an error
message with a request id can send it to you; search the logs for it.

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
