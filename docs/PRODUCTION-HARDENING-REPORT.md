# Production hardening report

The answer to `docs/PRODUCTION-AUDIT.md`, written for the production-readiness
review. It stands alone; file paths are relative to the repository.

## 1. Summary

- **Branch:** `claude/production-hardening-2e169e` (this session's git
  worktree, cut from `feat/overhaul` at `52fb057`; it stands in for the
  brief's `release/production-hardening`, as the session that started this
  work asked).
- **First commit:** `e5a0145` (P2-7). **Last commit:** the one adding this
  report. 28 commits in all, one per item, plus one follow-up fix for P0-1
  (`61206eb`).
- **Nothing was pushed or deployed. No cloud resources or secrets were
  created.** `main` was not touched.

Every P0 and P1 item is done, with tests that fail without the change. Of the
P2 items, all are done except **P2-3** (stronger password stretching): its
design is in this report and it was not built, as the brief allows, because
it touches every sign-in path and a mistake would lock people out. Match rooms
and the lobby hibernate between messages, so quiet games cost nothing. A timed
game abandoned by both players is flagged by a Durable Object alarm and rated.
A failed result report is retried until it lands, exactly once. Rated play is
timed only. The site sends a Content Security Policy and the other security
headers, with zero violations in real Chrome. Abuse-prone routes are
rate-limited per network. Under the `ADMIN_TOKEN` secret the owner has a
backup/restore route and moderation tools. Errors are logged as structured
lines and the app has a crash screen. There are privacy and terms pages,
offline states, link previews, and accessibility checks in `npm test`.
`npm run verify` passes with 432 tests. `check:online` and `check:browser`
pass against `wrangler dev`, and an online game survived a `wrangler dev`
restart. What remains is the owner's: secrets, review of the privacy wording
and contact address, a real-phone pass, and the deploy (sections 5 and 6).

## 2. Per item

Format for each: **status**, commits; what changed; tests added; how it was
verified; deviations.

### P0-1 Rated games that are abandoned never finish — done

- **Commits:** `c487a70` (with P0-2 and P0-3, as the brief says to do them
  together), `61206eb` (adopting rooms saved before this change).
- **Changed:**
  - `worker/roomCore.ts` (new): the match room's logic. It keeps one alarm for
    the earliest of three deadlines (the running clock's flag, a report retry,
    the 30-day clean-up), stored under `deadlines`. On the flag deadline,
    `MatchServer.runDue` opens the game with nobody connected, submits
    `timeout` as `system`, saves, and reports. Rooms saved before this change
    are adopted: their alarm becomes the clean-up time and the flag is worked
    out from the saved game.
  - `src/net/server.ts`: new `schedule` option (no timers of its own), plus
    `runDue` and `setAccounts`.
  - Rated is timed only:
    - `src/net/lobby.ts`: `requireClock`, refusing an untimed seek with
      `NEEDS_CLOCK`.
    - `worker/lobbyRoom.ts`: turns `requireClock` on.
    - `src/net/account.ts`: `FEATURED_POOLS` without untimed pools, and
      `DEFAULT_RATED_CLOCK = '10+1'`.
    - `src/pages/NewGamePage.tsx` and `src/components/settings/RulesForm.tsx`:
      "Untimed" is hidden for rated searches, and the form defaults to 10+1.
  - Existing untimed rating rows stay, unfeatured.
- **Tests:**
  - `worker/roomCore.test.ts`:
    - "finishes when the clock runs out, by alarm, and the side that ran out
      loses": both players disconnect, the object is evicted, the alarm wakes
      a fresh one, the game ends on time, `recordGame` is called once, and the
      ratings move.
    - "keeps only the clean-up alarm for a game with no clock running".
    - "keeps its clean-up time and works out its flag, so an abandoned game
      still ends".
  - `src/net/lobby.test.ts`: "with a clock required, an untimed seek is
    refused with a reason and a timed one waits".
  - `src/test/accounts.test.tsx`: "rated games are timed only: the clock
    defaults to 10+1 and Untimed is not offered".
- **Verified:**
  - Unit tests.
  - Under `wrangler dev`: `ONLINE_SLOW=1 npm run check:online` plays a 1+0
    game, both players disconnect, and 63 s later a new connection sees
    `timeout` with the side that ran out losing
    (`scripts/online-server-clock.test.ts`). Passed.
- **Deviation:** the room test lives in `worker/roomCore.test.ts`, with a fake
  clock and storage, as the brief allows. The live-runtime version is opt-in
  (`ONLINE_SLOW=1`) because it waits a minute.

### P0-2 WebSockets are not hibernatable — done

- **Commit:** `c487a70`.
- **Changed:**
  - `worker/room.ts` and `worker/lobbyRoom.ts` use `ctx.acceptWebSocket` and
    `webSocketMessage` / `webSocketClose` / `webSocketError`.
  - Each socket's attachment holds its id, account and `ConnectionMemo`
    (client id, matches joined). Seat holders are saved in storage (`seats`).
    On waking, `MatchServer.resume` rebuilds every connection without sending
    anything. The lobby keeps each waiting seek in its socket's attachment,
    and `Lobby.resume` puts the seeks back on the queue.
  - No timers:
    - `src/net/hostLink.ts` gets `presence: 'connection'`: a seat is held
      while its connection is open, or until it has been silent for 20 s and
      someone else asks.
    - The flag is an alarm (P0-1).
    - The lobby sweep is an alarm, and stops once no rating window can widen
      (`SeekQueue.canWiden`).
  - Keepalives without waking:
    - `src/net/websocket.ts` sends a guest's heartbeat ping as the fixed text
      `KEEPALIVE_REQUEST` once the socket has carried a full message.
    - `MatchRoom` registers `setWebSocketAutoResponse` for it, answering
      `{type:'alive'}` for its match.
    - `MatchServer` treats a keepalive it does receive as a ping.
    - Older clients' full pings get `alive` too.
  - The compatibility date (2026-10-20) is after 2026-04-07, so the runtime
    answers close frames itself.
- **Tests:**
  - `worker/roomCore.test.ts`:
    - "picks up both players after the object sleeps, with their seats, and
      the game goes on".
    - "answers a keepalive it does wake for, and frees a seat whose connection
      went silent".
    - "deletes a game nobody has opened for a month, but not while someone is
      connected".
  - `src/net/lobby.test.ts`:
    - "a lobby that slept puts waiting seeks back as they were…".
    - "with an alarm instead of a timer, sweeps are asked for only while a
      window can still widen".
  - All existing `src/net/server.test.ts` tests still pass.
- **Verified:**
  - `npm run check:online` against `wrangler dev`: 10 passed, 1 opt-in
    skipped.
  - A scripted two-player game (`MatchGuest` + `WebSocketTransport`) played
    two moves. `wrangler dev` was stopped and started again, the clients
    reconnected by themselves, and two more moves reached both players
    (before 2, after 4). Run on the P0 commit and again on the final code;
    passed both times.
  - Documented in `docs/MULTIPLAYER.md`, "Sleeping between moves".
- **Deviations:**
  - The restart test was scripted, not two browser windows. It drives the
    same client classes the Online page uses.
  - Cloudflare's docs say a deploy keeps hibernated sockets unless it forces
    a code update. Either way the clients reconnect and get their seats back.
- **Free plan figures** (from Cloudflare's docs, 2026-11): Durable Objects
  get 13,000 GB-s of duration a day and 100,000 requests a day. Hibernated
  objects are not billed for duration, and auto-responses are not billed.

### P0-3 A failed report loses the game's result — done

- **Commit:** `c487a70`.
- **Changed:** `worker/roomCore.ts`.
  - A finished game with accounts is written as `pendingReport` before
    `Accounts.recordGame` is called, and deleted only on success.
  - A failure is logged (`report-failed`) and retried by the alarm after 1,
    5 and 30 minutes, then hourly, up to the 30-day clean-up (a report still
    pending then is logged as `report-abandoned`).
  - Late ratings go to anyone connected (`MatchServer.setAccounts`).
- **Tests** (`worker/roomCore.test.ts`):
  - "is retried by alarm and lands exactly once, and the late ratings reach
    whoever is still there". It runs on the real `AccountStore` (Node SQLite).
    The first call throws; after the retry the game is stored and rated once.
    A third report of the same game changes nothing (games = 1). The
    connected player gets the `accounts` message with the change.
  - "backs off: a minute, five, thirty, then hourly".
- **Verified:** unit tests.

### P0-4 No security headers — done

- **Commit:** `d70e324`.
- **Changed:**
  - `public/_headers`:
    - The CSP as in the brief, except `connect-src 'self' wss:` (no
      `https:`).
    - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
      `Referrer-Policy: strict-origin-when-cross-origin`,
      `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
    - `Cache-Control: no-cache` for `/sw.js`.
  - `worker/securityHeaders.ts`: the same headers on every `/api` response
    (`secured`), because Cloudflare does not apply `_headers` to responses a
    Worker makes.
  - `scripts/browser-check.test.ts` (new, `npm run check:browser`):
    playwright-core drives the installed Chrome.
  - `playwright-core` added as a dev dependency. It downloads no browsers.
- **Tests:** `worker/securityHeaders.test.ts`:
  - "forbid framing and plugins…" (asserts `frame-ancestors 'none'`).
  - "are the same on static files and on the Worker's own responses".
  - "make the service worker always revalidate".
  - "are added to API responses…".
- **Verified:**
  - `curl -I` against `wrangler dev`: the headers are on `/`, app routes (the
    SPA fallback too), `/sw.js` (with `no-cache`), assets, the manifest, and
    `/api/*`, including 404s.
  - `npm run check:browser` in real Chrome: 13 pages (including `/privacy`,
    `/terms`, a profile and an unknown path), a game against the computer
    with its worker thinking, an online invite with its socket open, and the
    service worker installed. **Zero CSP violations, zero page errors.**
    Passed on several runs, the last on the final code.
- **Deviation:** `connect-src 'self' wss:` rather than `'self'` alone. Older
  Safari did not count same-host sockets as `'self'`; `wss:` keeps online
  play working there. `https:` was dropped (not needed). HSTS was not added
  (owner's decision).

### P0-5 Abuse-prone endpoints have no rate limits — done

- **Commit:** `1feacb2`.
- **Changed:**
  - `worker/rateLimit.ts` (new). The exact counts are kept per hashed
    `CF-Connecting-IP` in a `rate_limits` table in the Accounts store
    (migration 2, `AccountStore.throttle`):
    - match creation: 30 an hour;
    - sign-in and recovery together: 30 per 15 minutes;
    - username checks: 120 a minute.
  - Later items added `reports` (10 an hour), `client-errors` (20 an hour)
    and `admin` (30 per 15 minutes).
  - The `RATE_LIMITER` binding (`wrangler.jsonc`, namespace_id `1001`, 120 a
    minute) sits in front as a flood filter when bound.
  - A refusal is a 429 with a sentence and `Retry-After`. A request without
    an address (local development only) is not limited.
  - Sign-up keeps its own 5 an hour.
- **Tests:** `worker/rateLimit.test.ts`:
  - "lets a network make its share, then refuses with 429 and Retry-After
    until the window resets".
  - "stores a hash of the address, never the address".
  - "turns a burst away at the binding, before the store counts it".
  - "falls back to the store when the binding is missing or failing".
  - "does not limit a request without an address".
- **Verified:**
  - Under `wrangler dev`, with the binding simulated: 30 match creations from
    one address got 201, and the 31st got 429 with `Retry-After: 3599` and
    "Too many requests from your network. Try again in 60 minutes.".
  - `check:online` still passes.
- **Deviation:** the brief prefers the binding, with the store as a fallback.
  The binding only counts over 10 or 60 seconds, and per location, so it
  cannot hold "30 an hour" or "30 per 15 minutes". The store's table is
  therefore always the authority, and the binding a cheap first filter. No
  owner command is needed to create the binding: it is declared in
  `wrangler.jsonc` and made at deploy.

### P0-6 Pieces reported disappearing against the computer — done (not reproduced)

- **Commit:** `00f574f`.
- **Reproduced?** **No.** Desktop Chrome, through the new overlay and the
  earlier per-frame check, showed every piece drawn. Real phones, iOS Safari
  in particular, were not tested here; they are an owner action.
- **Changed:**
  - **Calls made unmistakable:**
    - `callExplanation` (`src/lib/describe.ts`) gives "Seriñ called your
      piece on c3 — you skipped a capture." It is shown as a toast and
      announced to screen readers by `useMatchController`.
    - The called piece stays on screen at least 600 ms (`CALL_MIN_MS` in
      `useBoardAnimations`), ringed in the offender colour, held for 240 ms,
      then taken away (`.board__anim-piece.is-called`).
    - With reduced motion only the fade remains; the ring is static.
  - **Debug overlay `?debug=board`** (`src/components/board/BoardDebug.tsx`,
    `src/lib/boardDebug.ts`):
    - Every animation frame it compares the engine position with the visible
      `.piece-slot`s plus travelling copies (`data-to`).
    - It reports a piece missing for more than 1.8 s, with the moves so far,
      in the console and on screen, with "Copy report".
    - The flag is read in `main.tsx`, so redirects keep it. It stays on for
      the tab; `?debug=off` turns it off.
    - Documented in `docs/WALKTHROUGH.md`.
  - **Sand:**
    - Every element between the tilted table and a piece keeps
      `preserve-3d`, and none has `overflow` or `filter`.
    - The one conflict found was `opacity` animated on `.board__anim-piece`
      (a `preserve-3d` element) for captures, calls and landing slides. The
      theme now sets `fadeRemovals: false`, so its pieces shrink away
      instead (`ThemeMotion.fadeRemovals`).
- **Tests:** `src/test/calls.test.tsx`:
  - "the player is told which piece went and why, and the piece is ringed
    before it goes": the AI is mocked to call whenever it can. A saved game
    where Red skipped a capture is opened, the toast text appears, and the
    ringed piece is on its square for at least 550 ms.
  - "names the caller, the squares and whose capture was skipped".
  - "finds every piece drawn on an ordinary board".
  - "reports a piece hidden for a slide that is not on screen".
- **Verified:** unit and UI tests. In the browser pane, the overlay reads
  "Board check every piece drawn" on a live game.
- **Note for the owner:** WebKit cannot be driven here (playwright-core
  WebKit needs its own browser build). To catch the bug on a phone, open any
  page with `?debug=board`, play, and use "Copy report" if it counts a
  problem.

### P1-1 No backups or restore plan — done

- **Commit:** `fc81c0b`.
- **Changed:**
  - `worker/admin.ts` (new):
    - Owner-only `/api/admin/*` behind the `ADMIN_TOKEN` secret (bearer
      token, compared in constant time).
    - Every admin path answers 404 when the secret is unset, shorter than 32
      characters, or not given.
    - `Backups.bookmarkFor` (a time within 30 days gives a bookmark plus the
      current one) and `Backups.restoreTo` (`onNextSessionRestoreBookmark`,
      then `ctx.abort()` a moment later; returns the undo bookmark).
    - Routes `GET /api/admin/backup/bookmark?at=`,
      `POST /api/admin/backup/restore`.
  - `docs/OPERATIONS.md` (new): the restore runbook, and what a restore does
    and does not touch.
- **Tests:** `worker/admin.test.ts` ("do not exist without the secret, or
  without the right token"; "return a bookmark…"; "schedule a restore, restart
  the object, and hand back the bookmark that undoes it"), against a fake
  storage that records its calls.
- **Verified:** unit tests. Under `wrangler dev`, `/api/admin/...` answered
  404 with no secret set. Point-in-time recovery itself does not exist
  locally, so a real restore was not run.
- **Deviation:** the optional weekly R2 export was not built: it needs a
  bucket the owner would create. The runbook says so and gives the command.

### P1-2 Nobody finds out when things break — done

- **Commit:** `1c5aa75`.
- **Changed:**
  - `worker/errors.ts` (new):
    - `internalError` logs one JSON line (`level`, `event: worker-error`,
      `route`, `status`, `requestId` = Cloudflare Ray id, `message`) and
      answers `{ error, requestId }` with 500. `worker/index.ts` uses it for
      every unexpected error.
    - `POST /api/client-errors` takes `{route, message, kind}`: same-site
      only, rate-limited, at most 4 KB, query string stripped, message cut to
      500 characters.
  - `src/net/errorReport.ts`: reports `error` and `unhandledrejection` from
    production builds, at most five different messages per page load.
  - `src/components/layout/ErrorBoundary.tsx`: "Something went wrong" with
    Reload and Home; a saved game resumes on reload.
  - `docs/OPERATIONS.md`, "When something breaks".
- **Tests:**
  - `worker/errors.test.ts`: the 500 JSON shape and its log line; a fresh id
    when there is no Ray; reports logged without query strings; cut and
    refused when malformed; the size cap by declared length and by bytes.
  - `src/test/errors.test.tsx`: the crash screen and exactly what is sent;
    one report per message; nothing sent outside production builds.
- **Verified:** under `wrangler dev`, a client error report got 204 and was
  logged as `{"level":"error","event":"client-error",...,"route":"/x",...}`,
  with the query removed.

### P1-3 Privacy and terms — done

- **Commit:** `8180f9f`.
- **Changed:**
  - `src/pages/LegalPage.tsx` (new): `/privacy` and `/terms`, linked in the
    footer (`AppShell`) and on the sign-up form ("By creating an account you
    agree to the terms and how we handle your data, set out in the privacy
    notice.").
  - The contact address is a placeholder: `OWNER_CONTACT = null` in
    `LegalPage.tsx` shows "a contact address, which will be added here soon".
  - The P3 note on public game pages is covered in `/privacy`.
- **Tests:** `src/test/legal.test.tsx` (both pages' content, footer links,
  the sign-up line).
- **Verified:** tests; read in the browser pane at desktop and 375 px, with
  no horizontal scroll.
- **Sentences the owner must review:** the whole of both pages. In
  particular:
  - `/privacy`:
    - "Open Dam keeps what it needs to run accounts, ratings and online
      games, and nothing to sell or to follow you around. There are no
      adverts, no trackers and no third-party scripts."
    - "An online game is played through the server, which keeps the game …
      and deletes it 30 days after anyone last opened it."
    - The "With an account" list (profile; password never sent, only a
      salted hash of a key; recovery code hashed; signed-in devices with a
      browser description; ratings and online games; synced settings and up
      to 200 games; reports).
    - "We never store your IP address as it is … a keyed hash of it: on a new
      account for 24 hours, and in short-lived counters … Cloudflare, which
      hosts the site, keeps request logs for a few days."
    - "One cookie, `od_session`, … 60 days after you last use the site."
    - "A finished online game can be opened by anyone who has its link, even
      if you hide your games; links are long and random…"
    - "If the app crashes, it sends the page's address (without anything
      after a ?) and the error's message…"
    - "When you delete your account, everything above goes at once; your past
      online games stay in your opponents' histories with your side shown as
      a deleted player."
    - "Open Dam is run by its owner, a private person, and hosted on
      Cloudflare. To ask about your data, write to [contact]."
  - `/terms`:
    - The fair-play list (no outside help; one account; no stalling).
    - The conduct list (no abuse or impersonation; do not try to break the
      site).
    - "We may reset a name or bio, rename an account, or suspend it…"
    - "Open Dam is free and provided as it is, without any promise that it
      will always be available, free of mistakes, or that your games and
      ratings will be kept forever. It may change or stop."
    - The licence line and the contact.

### P1-4 Anyone can lock any player out — done

- **Commit:** `0ff3ac1`.
- **Changed:** `worker/accountStore.ts`.
  - Migration 3 replaces `failures` with one row per (username, hashed
    address).
  - Eight failures from one network lock that network out of that username
    for 15 minutes; 50 from all networks together lock the username.
  - Applies to sign-in, recovery and `confirmKey`. The request context is now
    passed into `changePassword`, `changeUsername`, `replaceRecoveryCode` and
    `deleteAccount` (`worker/index.ts`).
  - A success forgives only its own network's failures; a recovery clears
    all of them.
- **Tests:** `worker/accountStore.test.ts`:
  - "locks only the network that guessed wrong: the player can still sign in
    from their own".
  - "still locks a username when guesses come from many networks".
  - "counts wrong current passwords the same way when a signed-in person
    confirms one".

### P1-5 Lost recovery code = lost account, and the page does not say so — done

- **Commit:** `3a5b380`.
- **Changed:**
  - `src/pages/AuthPage.tsx`:
    - The sign-up form says "There is no email. If you forget your password,
      only the recovery code you are given next can reset it…".
    - The code screen adds "There is no email to fall back on. Without this
      code, a forgotten password cannot be reset and the account is lost."
      and a "Download as a file" button (a text file with the username and
      code).
  - `src/pages/SettingsPage.tsx`: Settings → Sign-in shows "Recovery code:
    Made …", says why it matters, and keeps "New recovery code".
  - New `recovery_issued_at` column (migration 4) and
    `PrivateUser.recoveryIssuedAt`.
- **Tests:**
  - `src/test/accounts.test.tsx`: "sign-up and the code screen say plainly
    that a lost code means a lost account, and the code downloads as a file";
    "Settings says when the recovery code was made, why it matters, and
    offers a new one".
  - `worker/accountStore.test.ts`: "remembers when the current recovery code
    was made".

### P1-6 Online features are still offered offline — done

- **Commit:** `835927b`.
- **Changed:**
  - `ChoiceCards` gets `unavailable` (dimmed, `aria-disabled`, the reason
    shown, skipped by the arrow keys).
  - The Play page dims Online, Find a rated game and Invite a friend with
    "Needs a connection" and turns Start off for them.
  - `OfflinePanel` (new) appears on leaderboards and profiles, which load by
    themselves when the connection returns.
  - The sign-in, sign-up and recovery forms say they need a connection and
    keep their button off.
  - Everything reads `usePwa().online`.
- **Tests:** `src/test/pwa.test.tsx`:
  - "the Play page turns online choices off with the reason, and back on when
    the connection returns".
  - "leaderboards and profiles say they need a connection, and load by
    themselves when it is back".
  - "sign-in says it needs a connection and waits for one".
  - All three dispatch `offline` and `online`.

### P1-7 Housekeeping never runs — done

- **Commit:** `a55a33f`.
- **Changed:**
  - `AccountStore.housekeeping()` deletes expired sessions, failures and
    request counts whose window has ended, and clears `signup_ip` once a day
    old. P2-6 later added expired held usernames.
  - The `Accounts` object keeps a daily alarm for it, setting the first one
    when it starts, and logs an `info` line.
  - Network addresses are hashed with HMAC-SHA-256 keyed by `IP_HASH_SECRET`
    (prefixed `k:`). Without the secret they are hashed as before, and a
    `no-ip-hash-secret` warning is logged once per start.
- **Tests:** `worker/accountStore.test.ts`:
  - "clears expired sessions, old failures and request counts, and day-old
    sign-up addresses" (injected clock).
  - "hashes addresses with the secret key when there is one, and warns once
    when there is not".
- **Verified:** under `wrangler dev` (no secret), the warning appeared once
  in the log.

### P1-8 No moderation tools — done

- **Commit:** `0eddbc0`.
- **Changed:**
  1. `displayNameProblem` (`src/net/account.ts`) refuses display names whose
     NFKD, mark-stripped, lower-cased, letters-and-digits form is a reserved
     name ("Seriñ", "SERIN", "S.e.r.i.n", "Ｍｏｄｅｒａｔｏｒ"…). Used at sign-up
     and on profile changes.
  2. "Report" on someone else's profile (`ReportPlayer.tsx`, signed in only)
     posts to `POST /api/users/:name/report`. It is rate-limited and stored in
     a `reports` table (migration 5).
  3. Behind `ADMIN_TOKEN`, with 404 when unset:
     - `GET /api/admin/reports`;
     - `POST /api/admin/users/:name/reset-profile`;
     - `POST /api/admin/users/:name/rename`;
     - `POST /api/admin/users/:name/suspend` (`suspended_at` column).

     A suspended account is signed out everywhere, cannot sign in (403 after a
     correct password, so suspension does not reveal anything to guessers),
     cannot seek (it has no session) and is left off leaderboards, pool counts
     and profiles.

  4. `docs/OPERATIONS.md`, "Moderation", with curl examples.
- **Tests:**
  - `worker/accountStore.test.ts`: "refuses display names that look like…",
    "records a report…", "lets the owner reset a profile and rename an
    account", "suspends an account…; and lifts it".
  - `worker/admin.test.ts`: "list reports, reset a profile, rename and
    suspend, each only with the token"; "are 404 when the secret is unset, and
    nothing is done".
  - `src/test/accounts.test.tsx`: "nobody signed out sees Report"; "reporting
    sends the reason and thanks the reporter".
- **Deviation:** suspended accounts are also hidden from profiles, not only
  leaderboards, so an offensive bio stops showing straight away. An admin
  rename makes the old password key stop matching (keys are salted with the
  username); the player resets it with their recovery code. Documented.

### P1-9 Link previews and crawlers — done

- **Commit:** `2719df8`.
- **Changed:**
  - `index.html`: `og:type`, `og:site_name`, `og:title`, `og:description`,
    `og:url`, `og:image` (+ width, height, alt) and
    `twitter:card=summary_large_image`. The URLs are the live address.
  - `public/og-image.png`: 1200×630, drawn by `npm run icons`
    (`shareImageSvg` in `src/themes/brand.ts`). Deliberately excluded from
    precache in `src/pwa/policy.ts`.
  - `public/robots.txt`: disallows `/api/` and private pages, and points to
    the sitemap.
  - `public/sitemap.xml`: the seven public pages.
  - `NotFoundPage` renders `<meta name="robots" content="noindex">`.
  - App routes still soft-404, as the brief says; `/api/*` unknowns were
    already 404.
- **Tests:**
  - `worker/staticSite.test.ts`: the tags, the PNG's size, robots and the
    sitemap.
  - `src/test/seo.test.tsx`: noindex on Not Found.
  - `src/pwa/policy.test.ts`: the image, robots.txt and the sitemap are not
    precached.
- **Verified:** the built `dist/index.html` has the tags; `dist/` has the
  three files; `dist/sw.js` does not list the image.

### P1-10 Accessibility proof — done

- **Commit:** `0562c54`.
- **Changed:**
  - `axe-core` added as a dev dependency.
  - `src/test/a11y.test.tsx` runs axe on 12 pages in the default theme, and
    the three pages with a board in all four themes (21 runs, about 7 s). Its
    colour-contrast rule is off, since jsdom does no layout.
  - `src/themes/contrast.test.ts` computes WCAG contrast for every
    text-on-background pair the stylesheets use, per theme, at 4.5:1 (3:1
    for large text) and 3:1 for the focus ring.
- **Found and fixed:**
  1. The game page had **no `h1`**. It now has a visually hidden one,
     "Red against Ndö".
  2. Form-error text (`--dam-danger` on the page background) was 4.11:1 in
     Neobrutalist and 4.29:1 in Sand. The danger colour is darkened to
     `#D61F36` and `#9B3C22` (now 4.64:1 and 4.93:1; white text on danger
     buttons improves too).
- **Deviation:** themes change markup only where they draw their own parts,
  so non-board pages run in one theme only. That kept `npm test` fast.

### P2-1 Seat binding defence in depth — done

- **Commit:** `955947f`.
- **Changed:** `src/net/server.ts`.
  - Accounts are kept per connection (`Map<ServerSocket, Identity|null>`),
    passed into `mayUse`, handed to `claim` for the message being handled,
    and dropped when the connection leaves.
  - The never-cleared client-id map is gone.
- **Tests:** `src/net/server.test.ts`, "a guest connection using a signed-in
  player's client id cannot act for their seat". It fails on the old code
  (checked by restoring the old file).

### P2-2 Rating farming — done

- **Commit:** `d39b28f`.
- **Changed:**
  - The Worker passes the lobby a keyed hash of the caller's address
    (`X-Open-Dam-Network`; HMAC with `IP_HASH_SECRET`, unkeyed without it).
  - Seeks carry it, and `SeekQueue` never pairs two seeks from one network.
  - `scripts/online-server-accounts.test.ts` now checks that two accounts
    from one machine stay unpaired. It pairs them with distinct addresses
    only under `wrangler dev`, since Cloudflare's edge overwrites
    `CF-Connecting-IP`.
- **Tests:** `src/net/lobby.test.ts`, "two accounts on one network are never
  paired with each other; on different networks they are".
- **Verified:** `check:online` against `wrangler dev`: "two accounts on one
  network are not paired with each other" and "two accounts are paired, play
  a rated game, and reach the leaderboard" both passed.
- **Effect on the live check:** against the deployed site, `check:online`
  now runs the "not paired" check and skips the rated game.

### P2-3 Password stretching strength — not done (design only)

Not implemented. It changes every path that handles a password key: sign-up,
sign-in, recovery, password and username change, and deletion. A mistake
would lock players out, which the brief says not to risk. The design:

1. **Versioned salts.** v1 is today's `open-dam/v1/<username>`, 210,000
   rounds. v2 is `open-dam/v2/<username>`, 600,000 rounds. A new
   `users.key_version` column (a migration, default 1).
2. **`GET /api/auth/params?username=`** answers `{ version }`: the
   account's version, or 2 for any unknown name. A name's existence is
   already public through `/api/auth/username`, so this reveals nothing new.
   Rate-limited with the username checks.
3. **Sign-in, recovery and confirming the password:**
   - The client asks for the params, then stretches at that version.
   - For a v1 account it also stretches at v2 and sends both, as `key` (v1)
     and `upgradeKey` (v2).
   - The server checks `key` against the stored hash. On success it stores
     the hash of `upgradeKey` with `key_version = 2`, in the same synchronous
     block.
   - The next sign-in uses v2 alone.
4. **Sign-up, password change, username change and recovery** always write
   v2. Their requests carry `newKeyVersion: 2`, and the server refuses a
   missing or unknown version, so an old cached client cannot write v1 hashes.
5. **Old cached clients** (the PWA keeps old versions until "Update now")
   only know v1. Keep accepting a v1 `key` from them for v1 accounts. For a
   v2 account, answer "Update the app to sign in" (409, with a reason the
   page shows). Only these clients are affected, and only until they update.
6. **Cost:** 600,000 rounds takes about 0.5–1.5 s on a mid-range phone. The
   upgrade sign-in is a one-time doubling.
7. **Tests:**
   - A v1 account signs in once and is v2 afterwards; the old key then fails
     and the new one works.
   - An unknown name answers v2.
   - Writes without a version are refused.
   - The UI shows "Update the app" for an old client.

### P2-4 Reconnects — done

- **Commit:** `6ecb0df`.
- **Changed:** `src/net/websocket.ts`.
  - Each wait is between half and all of the backoff (jitter; `random`
    injectable).
  - It reconnects at once on the browser's `online` event, or when the page
    becomes visible (`wakeups` injectable; defaults to `window` and
    `document` through a typed `globalThis`, because the file also runs in
    Node).
- **Tests:** `src/net/server.test.ts`:
  - "spreads its waits between half and all of the backoff…".
  - "tries again at once when the browser is back online or the page is
    shown, not only on its timer".
  - "listens to the real browser: the online event reconnects".

### P2-5 Body size — done

- **Commit:** `8bd8582`.
- **Changed:** `readJson` and `BadRequest` moved to `worker/http.ts`. A
  `Content-Length` over the limit is refused (413) before reading; then the
  bytes read are counted.
- **Tests:** `worker/http.test.ts`:
  - "refuses a body whose declared length is too big, without reading it"
    (the stream is never pulled).
  - "counts bytes, not characters".
  - "refuses what is not a JSON object".

### P2-6 Username changes — done

- **Commit:** `cf58557`.
- **Changed:**
  - A `released_names` table (migration 6). A name given up by changing
    username is held for 30 days for its previous owner only. A name the
    site's owner took away (admin rename) is held for nobody.
  - Checked at sign-up, by `usernameProblem` and on username changes, and
    cleared by housekeeping.
- **Tests:** `worker/accountStore.test.ts`, "are held for 30 days for the
  person who had them, and nobody else"; "are held for nobody when the site's
  owner renamed the account".
- **Deviation:** a deleted account's name stays free at once, as before
  (an existing test asserts it). The brief only covered changes.

### P2-7 Schema migrations — done

- **Commit:** `e5a0145`.
- **Changed:**
  - `MIGRATIONS` in `worker/accountStore.ts`: version 1 is the deployed
    schema, kept as it was. The store runs the missing migrations on start.
  - Later items added migrations 2 to 6.
- **Tests:** "brings a new database to the latest version"; "adopts a
  database made before migrations were counted, keeping its rows"; "runs each
  migration once, however often the store opens".
- **Deviation:** the count lives in a `schema_version` table, not `PRAGMA
user_version`. Cloudflare's SQLite storage documentation does not promise
  that pragma, and some third-party guides say it is unsupported; a table
  works on every SQLite.

### P2-8 Engine property tests — done

- **Commit:** `9ae5fd6`.
- **Changed:** `src/test/engine-properties.test.ts` (in `src/test`, since it
  uses the AI and match layers).
- **Tests** (20, about 8 s):
  - On every board size × each promotion rule × call scope × abandoned-chain
    rule, two seeded random games check that:
    - every `legalActions` entry is accepted;
    - six random moves per ply that are not offered are refused;
    - a call with nothing to call is refused;
    - neither side gains pieces;
    - `replay(record)` equals the live state;
    - the game ends within (squares + 1) × (no-capture limit + 2) plies.
  - Each AI tier, on a short look ahead, plays only legal actions on 5×5, 7×7
    and 9×9 for 24 plies against random replies.

### P2-9 Persistent storage — done

- **Commit:** `8d9d35b`.
- **Changed:** `keepStorage` in `src/pwa/pwa.ts` calls
  `navigator.storage.persist()` once per visit:
  - at start, if the app is installed or finished games are saved;
  - on `appinstalled`;
  - after a game is archived (`useMatchPersistence`).
- **Tests:** `src/test/pwa.test.tsx`, "asks the browser once per visit to
  keep the saved games and the app".

### P2-10 Bundle size — done

- **Commit:** `595ba3f`.
- **Changed:** the Play and game pages are now lazy, like every page but Home
  (`src/App.tsx`).
- **Verified:**
  - Home's first load was 201 kB of gzipped script (128 kB main chunk + 73 kB
    shared). It is now **174 kB** (95 kB main + 74 kB shared + 7 kB engine,
    reducer and notation chunks), plus 16 kB of CSS, under 200 kB.
  - Measured by gzipping the built files that `dist/index.html` loads.
  - Offline still works: the service worker saves every chunk, and
    `check:browser` passed.
- **Deviation:** no visualiser was added; the build output was enough to see
  that the Play and game pages did not belong in the first download.

### P2-11 Toolchain — done

- **Commit:** `fff2b31`.
- **Changed:**
  - `npm audit fix` updated Vite to 8.3.6 and zod to 4.6.7, clearing both
    highs.
  - `devDependencies.vite` is now `^8.3.6`.
  - `engines.node` is now `>=22.13`, and the README was updated to match.
- **Verified:** `npm audit --omit=dev` finds 0 vulnerabilities.
- **Remaining:** 10 moderate advisories (minimatch under eslint and
  typescript-eslint). The only fix is downgrading eslint to 9, so they stay;
  they are dev-only.

### P2-12 CI coverage — done (not yet run on GitHub)

- **Commit:** `89c130e`.
- **Changed:** `.github/workflows/ci.yml` gets an `online` job:
  - `npm ci`, then build;
  - `wrangler dev --ip 127.0.0.1` in the background, waiting for
    `/api/health`;
  - `check:online`, then `check:browser` with
    `CHROME_PATH=/usr/bin/google-chrome`.
- **Verified:** the same commands pass locally. The YAML parses (Prettier
  checks it). The job itself runs only once the branch is pushed.

### P2-13 Cookie name — done (decision: keep `od_session`)

- **Commit:** `cff9836`.
- **Reason** (recorded in `docs/MULTIPLAYER.md`):
  - `workers.dev` is on the public suffix list, so no sibling site can set
    cookies for this host, and the `__Host-` prefix would add little.
  - Switching would mean honouring two names for 60 days.
  - Revisit on a custom domain with other subdomains.

### P3 (optional)

- **Public game pages ignore `show_games`:** documented in `/privacy` (P1-3).
- **Translations; challenges by username; spectating:** not done.

## 3. Verification

All on the final code of the branch, Windows 11, Node 26.8.2.

- **`npm run verify`** (typecheck, lint, Prettier check, tests, build):
  passes. 29 test files, **432 tests**, 0 failures; build complete. At the
  audit it was 310 tests.
- **`npm run check:ai`:** not run, and not needed. `src/ai` is unchanged
  since `52fb057` (`git diff --stat 52fb057 -- src/ai` is empty). The new
  property test does exercise every tier's move choice.
- **`npm run check:online` against `wrangler dev`** (restarted after the
  final build): **10 passed, 1 skipped** (the opt-in clock check):
  - is up; refuses bad requests;
  - two players play, one drops and comes back, and a third cannot take a
    seat;
  - a game survives everyone leaving; an unknown game is reported closed; a
    socket for one game cannot reach another;
  - sign up, sign in, profile, settings and devices; a guest cannot seek a
    rated game;
  - two accounts on one network are not paired; two accounts are paired,
    play a rated game, and reach the leaderboard.
- **`ONLINE_SLOW=1 check:online`:** "an abandoned timed game is flagged with
  nobody connected" passed.
- **Restart survival:** a scripted game across a `wrangler dev` restart
  passed (moves 1–2 before, 3–4 after, both clients in step).
- **Real Chrome** (`npm run check:browser`, Chrome from `C:/Program
Files/Google/Chrome`, headless, through playwright-core, against
  `wrangler dev`): **3 passed**:
  - zero CSP violations and zero page errors on 13 pages, with the AI worker
    running, an online socket open and the service worker installed;
  - after one visit every page opens with the network cut, and a game
    against the computer starts and its worker runs;
  - a new service worker shows "Update now", which swaps versions and leaves
    only the new cache.
- **Note:** Playwright's own offline switch also cuts off the service worker
  in Chromium, so offline is simulated by failing every request to the site,
  which is what a phone without signal sees.
- **Headers:** `curl -I` on `/`, `/play`, `/u/someone`, `/sw.js`, assets,
  the manifest, `/api/health` and `/api/nope`, all carrying the policy.

## 4. Migrations and deploy notes

- **Durable Object migrations:** none new. The classes are unchanged (`v1`,
  `v2`). The switch to the Hibernation API needs no migration.
- **Old rooms:** match rooms already live are adopted when they next wake.
  Their alarm becomes the clean-up time, and a running clock's flag is worked
  out from the saved game (`61206eb`, tested).
- **Accounts schema migrations** (run by the store on its first start after
  the deploy, each with its version in `schema_version`):
  - 1 — the schema as deployed (adopted, not re-run);
  - 2 — `rate_limits`;
  - 3 — `failures` per username and network (in-flight lock counts dropped);
  - 4 — `users.recovery_issued_at`;
  - 5 — `users.suspended_at` and `reports`;
  - 6 — `released_names`.
- **New binding:** `ratelimits: RATE_LIMITER` (namespace_id `1001`, 120 per
  60 s) in `wrangler.jsonc`. It is created by the deploy. If the account
  rejects it, delete that block; the limits still apply from the store.
- **New secrets (optional, recommended):** `ADMIN_TOKEN` (without it,
  `/api/admin` does not exist) and `IP_HASH_SECRET` (without it, addresses
  are hashed unkeyed and a warning is logged).
- **New dev dependencies:** `playwright-core`, `axe-core`.
- **Deploy order:**
  1. Review and merge the branch into `feat/overhaul`.
  2. Set the two secrets: they apply at once, with no deploy.
  3. Fill in `OWNER_CONTACT` in `src/pages/LegalPage.tsx` and commit.
  4. `npm run deploy` (it runs `verify`, then `wrangler deploy`).
  5. Run the live checks in section 5.

  Clients that are open during the deploy reconnect by themselves. Old
  cached app versions keep working until "Update now" (full pings are still
  answered).

## 5. Owner actions

1. **Secrets:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   npx wrangler secret put ADMIN_TOKEN
   npx wrangler secret put IP_HASH_SECRET
   ```
2. **Review `/privacy` and `/terms`** (the sentences listed under P1-3) and
   **add the contact address**: `OWNER_CONTACT` in `src/pages/LegalPage.tsx`.
3. **Real-device pass:** on an Android phone and an iPhone:
   - install and play offline, in all four themes;
   - tap and drag;
   - a full game against the computer, with `?debug=board` (copy the report
     if it counts a problem);
   - an online game.
4. **Push and watch CI:** the new `online` job.
5. **Deploy** (`npm run deploy`), then:
   ```bash
   ONLINE_URL=https://play.open-dam.workers.dev npm run check:online
   ```
   Against the live site the lobby check expects the two accounts _not_ to
   be paired (one machine, one network); that is correct.
6. **Optional:**
   - an R2 bucket for weekly exports
     (`npx wrangler r2 bucket create open-dam-backups`; the export code is
     not written);
   - HSTS;
   - decide on P2-3.

## 6. Known gaps and risks

- **P0-6 not reproduced.** The fixes target the likely causes (calls read as
  vanishing; Sand's opacity on 3D layers). The real-phone pass with
  `?debug=board` is the way to catch it if it persists. The overlay cannot
  see a layer the GPU drops.
- **Never run on Cloudflare itself:**
  - point-in-time restore (not available locally);
  - the rate-limit binding (simulated locally);
  - auto-responses not waking the room (`wrangler dev` answers keepalives,
    and the code works either way, but the billing benefit is only visible
    live);
  - the `online` CI job.
- **Hibernation, in practice:**
  - A phone that loses its network without closing the socket holds its seat
    against a _new_ client until its connection has been silent for 20 s.
    The same client reconnecting gets it back at once.
  - A rated game in which one side never moved has no running clock. It is
    cleaned up after 30 days without being stored; it would not have been
    rated anyway.
- **P2-2 cuts both ways.** Two real players behind one network (a family, a
  school, a carrier's shared address) cannot be paired in the lobby. They can
  play by invite link, unrated.
- **Admin rename** leaves the player needing their recovery code to sign in
  again. Documented for the owner.
- **Password stretching** is still 210,000 rounds (P2-3 design above).
- **Dev advisories:** 10 moderate, dev-only, need eslint 9.
- **Old app versions** cached by the service worker send full pings, so their
  games do not hibernate until they press "Update now". They still work.
