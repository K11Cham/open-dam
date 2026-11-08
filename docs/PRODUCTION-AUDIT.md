# Production audit and hardening brief

Audit date: 2026-11-08, of `feat/overhaul` at `f4ce21b` (live as Cloudflare
version `080db774` at https://play.open-dam.workers.dev).

This document is self-contained. An agent that has never seen this project
can execute it from here. Work through it, then write the report described
in "Your final report" — that report is what gets reviewed for production
readiness. If the review finds gaps, the work comes back for another cycle.

---

## 1. Ground rules

- **Branch.** Create `release/production-hardening` from `feat/overhaul`
  (`git switch -c release/production-hardening feat/overhaul`). Commit there
  only. Never touch `main`. Never push, force-push, rebase shared history,
  or delete branches or tags (the owner pushes). Leave the tag
  `pre-overhaul-2026-10-27` and branch `backup/pre-overhaul-2026-10-27` alone.
- **Never deploy.** No `npm run deploy`, no `wrangler deploy`, no
  `wrangler versions upload`. Nothing in this brief needs the live site
  changed; the owner deploys after review.
- **Never create cloud resources** (R2 buckets, KV namespaces, secrets,
  rate-limit namespaces on the account). Where an item needs one, write the
  code and the config entry, document the one command the owner must run,
  and make the code work (degrade gracefully) without it.
- **Before every commit:** `npm run verify` (typecheck, lint, Prettier check,
  all tests, production build) must pass. After any change in `src/ai`, also
  run `npm run check:ai` (slow; tier-vs-tier matches) and report the result.
- **One commit per item** (or a few for big items), message naming the item
  id, e.g. `P0-1: Finish rated games by alarm when nobody is connected`.
  End every commit message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Code style:** no semicolons, single quotes, 130 columns (Prettier).
  Comments explain why, in plain sentences. No raw colours in
  `src/styles/app.css`: use the theme tokens (`--dam-*`).
- **Layers:** `src/game` (rules, pure) → `src/ai`, `src/match` (pure) →
  `src/net` → `src/hooks` → `src/components`, `src/pages`. Lower layers never
  import higher ones. Visual decisions live in `src/themes`.
- **Docs:** keep `codebase.md` (file map), `docs/WALKTHROUGH.md` (how it fits
  together), `docs/MULTIPLAYER.md` (server) and `docs/HANDOVER.md` (state and
  shift log) true for anything you change.
- If an item turns out wrong, already done, or riskier than described, do not
  force it: record why in your report and move on.

## 2. What the project is (enough to work without other context)

Open Dam is a web version of **Dam as played in The Gambia** (not
international draughts, not Turkish draughts): boards 5×5 to 9×9 with the
centre empty at the start, pieces move one square forward or sideways,
captures are optional but a skipped capture can be **called** (the opponent
removes the piece that could have captured), kings move and capture any
distance in straight lines.

- **Front end:** React 19 + TypeScript + Vite 8, framer-motion, four themes
  (Neobrutalist, Atelier, Carnival, Sand — Sand is a CSS 3D board). The
  computer opponent runs in a Web Worker (`src/ai/search.worker.ts`), five
  tiers named in Wolof (Döff, Khàlé, Ndö, Màam, Seriñ).
- **Installable offline app (PWA):** `public/manifest.webmanifest`, service
  worker `src/pwa/serviceWorker.ts` built to `/sw.js` by
  `scripts/vite-service-worker.ts`; rules in `src/pwa/policy.ts`. Everything
  but online play works offline. Updates wait for the player ("Update now").
- **Server:** one Cloudflare Worker (`worker/index.ts`) serving the built app
  as static assets and every `/api` route, plus three SQLite-backed Durable
  Objects:
  - `MatchRoom` (`worker/room.ts`): one per online match; runs the pure
    `MatchServer` (`src/net/server.ts`) over WebSockets; saves the match
    record; reports finished games to `Accounts`.
  - `Accounts` (`worker/accounts.ts` → logic in `worker/accountStore.ts`):
    one object holding every account, session, rating, online game, synced
    setting and archived local game, in SQLite.
  - `LobbyRoom` (`worker/lobbyRoom.ts`): matchmaking for rated games (pure
    logic in `src/net/lobby.ts`, `src/net/matchmaking.ts`).
- **Accounts:** username + password, no email. The browser stretches the
  password with PBKDF2-SHA256 (210,000 rounds, salt
  `open-dam/v1/<lowercased username>`) and sends only the 64-hex key; the
  server stores SHA-256(random salt : key). Sessions: 64-hex token in cookie
  `od_session` (HttpOnly, SameSite=Lax, Secure on https), stored hashed, 60
  days sliding. A recovery code (shown once) resets a password. Throttles: 8
  failures per username per 15 min; 5 sign-ups per IP per hour. Mutating
  account routes check `Origin`.
- **Ratings:** Elo per pool (`<size>x<size>:<clock|untimed>`), start 1500,
  K 40 for the first 20 games in a pool then 20 (`src/match/rating.ts`).
  `Accounts.recordGame` is idempotent per game id.
- **Sync:** `src/net/accountSync.ts` keeps theme, sound, preferences, last
  New Game form and solved puzzles in step across devices (newest wins;
  puzzles are unioned); finished local games are merged by id.

### Commands

| Command                | What it does                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`          | Vite dev server (no service worker in dev)                                           |
| `npm run verify`       | typecheck, lint, Prettier check, tests, build — required before commits              |
| `npm test`             | Vitest (~310 tests; `worker/accountStore.test.ts` uses Node's `node:sqlite`)         |
| `npm run check:ai`     | AI tier-vs-tier strength matches (minutes)                                           |
| `npm run server`       | build, then `wrangler dev` on port 8787 (the full server locally)                    |
| `npm run check:online` | real games and accounts against a running server (`ONLINE_URL` overrides the target) |
| `npm run icons`        | redraw favicon and app icons from `src/themes/brand.ts`                              |

### Local-environment traps (learned the hard way)

- `wrangler dev` on Windows does **not** pick up a rebuild's new hashed file
  names; it answers them with `index.html`. Restart it after each build, and
  kill leftover `workerd` processes. `npx vite preview` serves fresh builds
  for UI-only checks (no `/api`).
- The Claude desktop app's built-in browser pane **cannot register a service
  worker from a local server**. Test the service worker in real Chrome:
  `playwright-core` driving the installed Chrome
  (`C:/Program Files/Google/Chrome/Application/chrome.exe`), against a
  production build served locally. A static server for this must redirect
  `/index.html` → `/` the way Cloudflare does (that difference once broke the
  live site).
- `check:online` signs up throwaway accounts; the store allows 5 sign-ups per
  IP per hour, so repeated runs can hit 429.

## 3. Audit results at a glance

Verified during the audit:

- `npm run verify` passes: 310 tests, clean typecheck, lint, formatting,
  build.
- Production dependencies: `npm audit --omit=dev` finds 0 vulnerabilities.
  Dev dependencies: 12 (2 high: Vite 8.3.0 dev server, zod via wrangler).
- Live site, 13 pages at 375 px: one `h1` each, correct titles, no horizontal
  overflow, every control named, every image has `alt`, no console errors
  other than expected 404s.
- Offline: first visit saves 28 files; every page and saved file loads with
  the network off; a game against the computer starts and its worker loads;
  the update flow swaps versions and clears old caches.
- Rules engine: careful and documented (calls, chains, yin/yang opening,
  draw rules). Account store: hashed tokens, constant-time comparisons,
  atomic username claims, idempotent game recording, origin checks, input
  validation and size caps throughout.

What is not production-ready is mostly at the edges: what happens when people
leave rated games, what the server costs and survives, abuse controls,
headers, recoverability, observability, and an open user-reported bug.

**Severity:** **P0** must be fixed before calling it production-ready.
**P1** should be fixed before inviting the public. **P2** hardening and
polish worth doing now. **P3** optional.

## 4. Findings and the work

Each item: problem, evidence, what to do, and when it is done.

### P0 — blocks production

#### P0-1 Rated games that are abandoned never finish

- **Problem.** The flag timer lives in memory (`Room.scheduleFlag`,
  `src/net/server.ts`), and a room closes when its last connection leaves
  (`MatchServer.accept → drop`). If both players leave a timed game, nobody's
  clock ever runs out: the game is never finished, never stored, never
  rated, and the room's 30-day alarm (`worker/room.ts`, `KEEP_IDLE_MS`) then
  deletes it. A player losing a rated game can escape the loss by closing the
  tab once the opponent also leaves. Untimed rated games (pools ending
  `:untimed`) have no clock at all, so an abandoned one never ends.
- **Do.**
  1. In `MatchRoom`, keep a Durable Object **alarm at the running clock's
     flag time** (and the 30-day clean-up alarm as the fallback when no clock
     runs; one alarm slot, so store which deadline it is for). On alarm,
     load the record, open the room logic without a connection, submit the
     `timeout` engine action as `system` exactly as `scheduleFlag` does, save,
     and report the finished game. Re-arm after every accepted action.
  2. **Rated play is timed only.** Remove the `untimed` clock from rated
     matchmaking: the lobby must refuse untimed seeks with a clear message,
     `FEATURED_POOLS` (`src/net/account.ts`) stops listing untimed pools on
     leaderboards, and the New Game page's "Find a rated game" requires a
     clock (default it to 10+1). Untimed casual games (invite links,
     computer, local) are unaffected. Existing untimed rating rows stay in
     the database; they just are not featured.
- **Done when.** A test in `src/net/server.test.ts` (or a new
  `worker/room` test with a fake clock and storage) shows: both players
  disconnect mid-game, time passes, the alarm fires, the game finishes on
  time, `onFinished` reports it, and the side that ran out loses. The lobby
  test refuses an untimed seek.

#### P0-2 WebSockets are not hibernatable

- **Problem.** `MatchRoom.fetch` and `LobbyRoom.fetch` use
  `socket.accept()`, the non-hibernating WebSocket API. A Durable Object with
  an open socket stays resident and is billed for wall-clock duration the
  whole time, even while players think. On the Workers free plan that budget
  is small (verify the current Durable Objects duration limit in Cloudflare's
  docs); a modest number of concurrent games can exhaust it, after which
  requests fail. Also, every deploy or eviction drops every socket.
- **Do.** Move both objects to the **Hibernatable WebSockets API**:
  `this.ctx.acceptWebSocket(server, tags)`, `webSocketMessage`,
  `webSocketClose`, `webSocketError`, `serializeAttachment` /
  `deserializeAttachment` to keep each socket's client id and identity across
  hibernation. Rebuild in-memory state lazily on wake (the match record and
  meta are already in storage; `MatchServer` rooms can be reconstructed from
  `ctx.getWebSockets()`). Flag timers become alarms (P0-1). The lobby's seek
  list is in memory: on wake with sockets present, ask the clients to
  re-seek (or persist seeks in storage) so a hibernated lobby does not lose
  waiting players silently. Use `setWebSocketAutoResponse` for heartbeats if
  the protocol's `ping` can be answered without waking the object.
- **Done when.** Unit tests of the room and lobby still pass; `npm run server`
  then `npm run check:online` passes (restart `wrangler dev` per section 2);
  a manual two-browser game survives restarting `wrangler dev` mid-game
  (clients reconnect and continue). Document the change in
  `docs/MULTIPLAYER.md`.

#### P0-3 A failed report loses the game's result

- **Problem.** `Room.finish` (`src/net/server.ts`) swallows any error from
  `onFinished`; `MatchRoom.report` calls `Accounts.recordGame` once. If that
  call fails (object restarting, deploy in progress), the game is never
  stored or rated and nothing retries.
- **Do.** When a game with accounts finishes, write a `pendingReport` entry
  to the room's storage before calling `recordGame`; delete it only after
  success. Retry from the alarm with backoff (1 min, 5 min, 30 min, then
  hourly, up to the 30-day clean-up). `recordGame` is already idempotent, so
  a retry that races a slow success is harmless. When the rating changes come
  back late, announce them to anyone still connected.
- **Done when.** A test makes `onFinished` / `recordGame` fail once, then
  succeed on the retry, and the game ends up stored and rated exactly once.

#### P0-4 No security headers

- **Problem.** The live site sends no `Content-Security-Policy`, no
  clickjacking protection, no `X-Content-Type-Options`, no
  `Referrer-Policy`, no `Permissions-Policy` (checked with `curl -I`).
- **Do.** Add `public/_headers` (Workers static assets honour it) for the app
  and the same headers on Worker responses from `/api`. Starting policy, to
  be tightened only after testing every page:
  `default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' wss: https:; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
  (`'unsafe-inline'` styles are needed by framer-motion's style attributes;
  narrow `connect-src` to this origin's `https:` and `wss:` if the static
  copy's `VITE_MATCH_SERVER` use allows), plus
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
microphone=(), geolocation=()`, and `Cache-Control: no-cache` for `/sw.js`
  (it already revalidates; keep it that way). Do not add HSTS preload without
  the owner.
- **Done when.** A production build served by `wrangler dev` returns the
  headers; every page, the service worker, the AI worker, online sockets,
  fonts and sounds work with zero CSP violations in the console (check in
  real Chrome per section 2). Add a test that parses `public/_headers` and
  asserts the CSP contains `frame-ancestors 'none'`.

#### P0-5 Abuse-prone endpoints have no rate limits

- **Problem.** `POST /api/matches` (anyone, any origin) creates a Durable
  Object that keeps storage and an alarm for 30 days — unlimited. Sign-in
  throttling is per username only, so one IP can try 8 passwords against
  every username every 15 minutes (credential stuffing), and the same
  per-username lock lets anyone lock any player out (see P1-4).
  `GET /api/auth/username` and `POST /api/auth/recover` are unthrottled
  beyond that.
- **Do.** Add a per-IP limiter in front of these routes. Preferred:
  Cloudflare's Workers Rate Limiting binding (`ratelimits` in
  `wrangler.jsonc`), keyed by `CF-Connecting-IP` and route group, with
  limits such as: match creation 30/hour, sign-in and recover 30/15 min,
  username checks 120/min, sign-up unchanged (5/hour in the store). If the
  binding is unavailable at runtime, fall back to a small counter table in
  the `Accounts` store. Answer 429 with a sentence and `Retry-After`.
- **Done when.** Tests cover the limiter (allowed, refused with 429,
  window reset) and the fallback; `check:online` still passes; the owner
  command (if a binding needs creating) is in your report.

#### P0-6 Pieces reported disappearing in games against the computer (open bug)

- **Problem.** The owner reported pieces vanishing "in between moves" against
  the AI. Not reproduced: five full games across themes, desktop Chrome,
  with a per-frame check that every engine piece had a visible square, found
  nothing. Untested: real phones (iOS Safari especially), touch and
  drag-and-drop, the Sand theme's 3D transforms on mobile GPUs, a page left
  in the background mid-animation.
- **Leads.** (a) **Calls**: when the computer calls a piece (after the
  player skipped a capture), the piece is removed with a short animation and
  only a "called" line in the move list — players may read it as a
  disappearance. (b) **Travel animation**: `BoardView` hides a square's piece
  while that same piece slides onto it; `useBoardAnimations` falls back after
  `TRAVEL_FALLBACK_MS` (1500 ms) when animation frames do not run (hidden
  tab). (c) **Sand on iOS**: Safari is known to drop `preserve-3d` layers
  under some stacking and `will-change` combinations.
- **Do.** Build a reproduction harness rather than guessing: a dev-only
  overlay (behind `?debug=board`) that, every frame, compares the engine
  position with visible `.piece-slot` elements plus in-flight travel pieces
  and logs any mismatch with the move list. Make called pieces unmistakable:
  highlight the piece being called, show a short toast or banner "Seriñ
  called your piece on c3 — you skipped a capture", and keep the removal
  animation visible for at least 600 ms (respecting reduced motion with a
  non-animated highlight). For Sand, test in WebKit
  (`playwright-core` WebKit is not available with system browsers; note it
  for the owner) and avoid combining `preserve-3d` with `overflow: hidden`
  or `filter` on the same element.
- **Done when.** The call explanation ships with tests (UI test: computer
  calls → banner/toast text appears, piece highlighted before removal); the
  debug overlay exists and is documented in `docs/WALKTHROUGH.md`; your
  report says plainly whether you reproduced the bug and how.

### P1 — before inviting the public

#### P1-1 No backups or restore plan for the one accounts database

- **Problem.** Every account, rating and game lives in the `Accounts`
  object's SQLite. A bad deploy or bug that corrupts or deletes rows has no
  documented recovery.
- **Do.** SQLite-backed Durable Objects support point-in-time recovery
  (verify current retention in Cloudflare docs: `getBookmarkForTime`,
  `onNextSessionRestoreBookmark`). Add an owner-only, secret-protected
  maintenance route (see P1-8) that returns a bookmark for a given time and
  schedules a restore, plus `docs/OPERATIONS.md` with a step-by-step restore
  runbook. Optionally (owner must create an R2 bucket — document, do not
  create) a weekly alarm that writes a full JSON export to R2; the code must
  no-op when the binding is absent.
- **Done when.** The runbook exists and the route is tested with a fake
  storage that records the calls.

#### P1-2 Nobody finds out when things break

- **Problem.** An unexpected error in the Worker is re-thrown (`worker/index.ts`,
  bottom) and becomes Cloudflare's HTML 500; client-side errors are not
  reported anywhere. The first broken deploy was found only by a manual
  check.
- **Do.** In the Worker: catch everything in `fetch`, log a structured line
  (`console.error(JSON.stringify({ level, route, status, requestId,
message }))` — Workers Logs is enabled in `wrangler.jsonc`), return JSON
  `{ error, requestId }` with 500. In the app: a top-level React error
  boundary with a friendly "Something went wrong — reload" screen (keep the
  saved game), plus `window.onerror` / `unhandledrejection` reporting to a
  new `POST /api/client-errors` (rate-limited, size-capped, no personal
  data beyond route and message). No third-party services.
- **Done when.** Tests cover the 500 JSON shape and the client-error route's
  validation; the error boundary has a UI test.

#### P1-3 Privacy and terms

- **Problem.** The site stores accounts, game histories, synced settings, a
  hashed signup IP, user agents (device list) and a session cookie, with no
  page saying so. `/privacy` currently shows "Page not found".
- **Do.** Add `/privacy` (what is stored, why, how long, how to export and
  delete — Settings → Your data already does both — and contact) and a short
  `/terms` (fair play, no abuse, the service is provided as is). Link both in
  the footer and on the sign-up form ("By creating an account you agree…").
  Write plainly; mark the contact address as a placeholder for the owner.
- **Done when.** Routes, links and a UI test exist; the report lists every
  sentence the owner must review.

#### P1-4 Anyone can lock any player out

- **Problem.** `lockedFor` / `noteFailure` (`worker/accountStore.ts`) count
  failures per username only; eight wrong passwords from anywhere lock that
  username for 15 minutes.
- **Do.** Count failures per (username, IP hash) for the lock, and keep a
  higher per-username ceiling (e.g. 50 per 15 min) as a backstop against
  distributed guessing. Pass the request context into `signIn`, `recover`
  and `confirmKey` paths that need it.
- **Done when.** Store tests: a second IP can still sign in while the first
  is locked; the backstop still locks under distributed failures.

#### P1-5 Lost recovery code = lost account, and the page does not say so

- **Problem.** There is no email. `RecoveryCode` (`src/pages/AuthPage.tsx`)
  says to keep the code safe but not that without it a forgotten password
  cannot be recovered at all.
- **Do.** Say it plainly on sign-up and on the code screen; add "Download
  as a file" next to "Copy code"; on Settings → Sign-in, show when the
  current code was issued and offer to make a new one (route exists:
  `POST /api/me/recovery-code`).
- **Done when.** UI tests cover the wording and the download.

#### P1-6 Online features are still offered offline

- **Problem.** Offline, the New Game page still offers "Find a rated game"
  and "Invite a friend"; leaderboards, profiles and sign-in fail with
  generic errors. `usePwa().online` (`src/hooks/usePwa.ts`) exists but these
  pages do not use it.
- **Do.** Disable those choices offline with the reason ("Needs a
  connection"), show a clear offline state on leaderboards, profiles and the
  auth pages, and re-enable automatically when back online.
- **Done when.** UI tests dispatch `offline`/`online` and check each page.

#### P1-7 Housekeeping never runs

- **Problem.** Expired `sessions` rows and stale `failures` rows are deleted
  only when touched; `users.signup_ip` keeps an **unsalted** SHA-256 of the
  IP forever (the IPv4 space is small enough to reverse it).
- **Do.** A daily `Accounts` alarm that deletes expired sessions, failures
  older than the window, and clears `signup_ip` older than 24 hours. Hash IPs
  with HMAC-SHA-256 using a secret (`IP_HASH_SECRET`, owner sets it with
  `wrangler secret put`); without the secret, fall back to the current hash
  and log a warning once.
- **Done when.** Store tests with an injected clock show each clean-up.

#### P1-8 No moderation tools

- **Problem.** Usernames, display names and bios are public and there is no
  way to report or act on abuse. Display names can also impersonate reserved
  names (computer tiers, "admin"): `cleanDisplayName` does not check the
  reserved list that `checkUsername` uses.
- **Do.** (1) Apply the reserved-name check (case- and accent-insensitive:
  normalise NFKD and strip marks) to display names. (2) A "Report" link on
  profiles that records a report (reporter, target, reason, time) in a new
  `reports` table, rate-limited. (3) Owner-only maintenance routes under
  `/api/admin/*`, protected by a bearer token from a secret
  (`ADMIN_TOKEN`; routes return 404 when the secret is unset): list reports,
  reset a display name and bio, rename a username, suspend an account (a
  `suspended_at` column; suspended accounts cannot sign in or seek, and
  disappear from leaderboards). (4) `docs/OPERATIONS.md` gains curl examples.
- **Done when.** Store and route tests cover each action and the 404 when the
  secret is unset.

#### P1-9 Link previews and crawlers

- **Problem.** No Open Graph or Twitter tags, so invite links shared on
  WhatsApp show no picture or description. `/robots.txt` returns the app's
  HTML; unknown paths return 200 (soft 404s).
- **Do.** Add `og:title`, `og:description`, `og:image` (a 1200×630 PNG drawn
  by `npm run icons` from the brand mark — `scripts/render-icons.test.ts`),
  `og:url`, `twitter:card=summary_large_image` to `index.html`. Add
  `public/robots.txt` and a static `public/sitemap.xml` for the public pages.
  Keep soft 404s for app routes (SPA), but make `/api/*` unknowns 404 (they
  are) and add `<meta name="robots" content="noindex">` on the Not Found
  page.
- **Done when.** The tags are in the built `index.html`; the image exists and
  is precached or excluded deliberately in `src/pwa/policy.ts`.

#### P1-10 Accessibility proof

- **Problem.** The UI is built with care (keyboard board, named controls,
  reduced motion), but nothing proves contrast or ARIA correctness across
  four themes.
- **Do.** Add automated checks: `vitest-axe` (or `axe-core` directly) on the
  main routes in each theme in jsdom, and a script that computes WCAG
  contrast for every text/background token pair in each theme
  (`src/themes/*/theme.ts`) and fails under 4.5:1 for body text, 3:1 for
  large text and UI components. Fix what they find.
- **Done when.** The checks run in `npm test` and pass.

### P2 — hardening and polish

- **P2-1 Seat binding defence in depth.** `Room.mayUse` looks up the
  identity by the client-supplied id (`identities` map, never cleared).
  Client ids are not broadcast today, so this is not exploitable, but bind
  the identity to the socket (pass the connection's identity into
  `mayUse`), and clear `identities` entries when their last socket leaves.
  Test: a guest connection using a signed-in player's client id cannot act
  for the owned seat.
- **P2-2 Rating farming.** Two accounts of one person can be paired by the
  lobby. Pass a salted IP hash with the identity to the lobby and do not pair
  seekers with the same hash (they can still play casually by link).
- **P2-3 Password stretching strength.** 210,000 PBKDF2-SHA256 rounds is
  below current OWASP guidance (600,000). Design a versioned upgrade
  (`open-dam/v2/` salt, a per-user `key_version`, migrate on next sign-in by
  having the client send both keys after a public `GET /api/auth/params`
  that answers the same for unknown names). Implement only if it can be done
  without locking anyone out; otherwise write the design into the report.
- **P2-4 Reconnects.** `WebSocketTransport` (`src/net/websocket.ts`) backs off
  exponentially but without jitter and does not retry immediately on the
  browser's `online` event or when the tab becomes visible. Add both.
- **P2-5 Body size.** `readJson` (`worker/index.ts`) reads the whole body
  before checking size and measures characters, not bytes. Reject on
  `Content-Length` first, then measure bytes.
- **P2-6 Username changes.** The old username is free for anyone at once,
  so profile links break and impersonation is easy. Reserve released names
  for 30 days (a `released_names` table) for everyone but the previous
  owner.
- **P2-7 Schema migrations.** `SCHEMA` is `CREATE … IF NOT EXISTS` only.
  Add a `PRAGMA user_version`-based migration runner before any column change
  (P1-8 adds columns — do this first).
- **P2-8 Engine property tests.** Add seeded random playouts on every board
  size and rule setting asserting: every `legalActions` entry applies
  without rejection; nothing else does; piece counts never increase;
  `replay(record)` reproduces the state exactly; games terminate under the
  default draw rules within a bound; the AI never returns an illegal action
  at any tier. Keep the run under ~10 s in `npm test`.
- **P2-9 Persistent storage.** Call `navigator.storage.persist()` once the
  player has an archived game or installs the app, so the browser does not
  evict saved games and the offline copy.
- **P2-10 Bundle size.** Main chunk ~382 kB (126 kB gzip) plus a 215 kB
  shared chunk. Check what is in it (`npx vite build --mode production` with
  `rollup-plugin-visualizer` as a dev-only run, not committed config if it
  adds weight) and lazy-load heavy, rarely used parts (outcome splash,
  tutorial chapters, settings sections). Target: Home's first load under
  200 kB gzip.
- **P2-11 Toolchain.** `npm audit fix` for dev dependencies (Vite ≥ 8.3.2,
  zod via wrangler) and re-verify. Raise `engines.node` to `>=22.13` (the
  account tests need unflagged `node:sqlite`).
- **P2-12 CI coverage.** Add a CI job that builds, starts `wrangler dev`, and
  runs `npm run check:online` against it; add a headless-Chrome PWA check
  (`scripts/` + `playwright-core`, Chrome is preinstalled on GitHub's Ubuntu
  runners) for: first visit saves the app, offline pages load, update flow.
- **P2-13 Cookie name.** Consider `__Host-od_session` (requires accepting the
  old name for 60 days). Document the decision either way.

### P3 — optional

- Public game pages (`GET /api/games/:id`) ignore `show_games`; ids are
  unguessable, so this is a policy choice — document it in `/privacy`.
- Interface translations (Wolof, French) once strings are centralised.
- Challenging a specific player by username; spectating.

## 5. Order of work

1. P2-7 (migrations) and P2-11 (toolchain) — foundations for the rest.
2. P0-2 with P0-1 and P0-3 (they all reshape `MatchRoom`; do them together).
3. P0-5, P0-4.
4. P0-6.
5. P1 items in order; P1-8 needs P2-7.
6. Remaining P2 items.

## 6. Owner actions you must list, not do

- Real-device pass: install and play offline on an Android phone and an
  iPhone, all four themes, tap and drag, a full game against the computer,
  an online game.
- Any `wrangler secret put` (`IP_HASH_SECRET`, `ADMIN_TOKEN`), rate-limit
  binding or R2 bucket creation, with the exact commands.
- Review of `/privacy` and `/terms` wording and the contact address.
- Deploy, then `ONLINE_URL=https://play.open-dam.workers.dev npm run
check:online`.

## 7. Your final report

Write `docs/PRODUCTION-HARDENING-REPORT.md` on the branch and commit it last.
It is the input to the production-readiness review, so it must stand alone:

1. **Summary:** branch name, first and last commit, one paragraph on the
   state.
2. **Per item** (every id in section 4, in order): status (`done`,
   `partly done`, `not done`, `not needed`), commits, what changed (files),
   tests added (names), how it was verified (commands and their results),
   and any deviation from this brief with the reason.
3. **Verification:** the full output summary of `npm run verify`, `npm run
check:ai` (if `src/ai` changed), `npm run check:online` against
   `wrangler dev`, and the real-Chrome service-worker and CSP checks.
4. **Migrations and deploy notes:** any Durable Object migration tags,
   schema migrations, new bindings or secrets, and the exact deploy order.
5. **Owner actions** (section 6) with commands.
6. **Known gaps and risks** that remain, stated plainly.

## 8. How the review will judge "production-ready"

All of these must hold, checked on the branch:

- Every P0 item is `done` with tests that fail without the change.
- Every P1 item is `done`, or `partly done` with a reason the reviewer
  accepts.
- `npm run verify` passes; `npm run check:online` passes against `wrangler
dev`; `npm run check:ai` passes if the AI changed.
- In real Chrome: no CSP violations on any page; offline play and the update
  flow work; an online game survives a `wrangler dev` restart.
- A rated game abandoned by both players finishes on time and is rated; a
  failed report is retried and lands once.
- Docs (`codebase.md`, `docs/WALKTHROUGH.md`, `docs/MULTIPLAYER.md`,
  `docs/HANDOVER.md`, new `docs/OPERATIONS.md`) match the code.
- Nothing was pushed or deployed.

Anything short of this goes back for another cycle with a list of what is
missing.
