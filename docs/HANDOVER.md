# Handover

How to pick up work on Open Dam, whether you are a person or an agent.

## Current state (2026-11-01)

- `feat/overhaul` builds and `npm run verify` passes (308 tests). Every work
  row and every verification row is done.
- **An installable, offline app with a real logo** (w48, 2026-11-01, the
  owner's request, "the final major milestone"): the mark (sticks against
  stones, centre open) in the top bar, the Home page and every icon; a web
  app manifest; a service worker that saves the app so everything but online
  play works offline; an update notice that never reloads a game unasked;
  Settings → App, a top bar button and a card on Home to install. How it
  works: WALKTHROUGH.md Part 8, "The logo" and "The installed app and offline
  play". **Live** since 2026-11-01 (version 080db774, with the owner's yes), install button and Home card included. The browser pane in the Claude app cannot run a
  service worker from a local server; check one in real Chrome (a production
  build served locally) or on the live site.
- **Accounts, ratings and leaderboards exist** (w47, 2026-10-31, the owner's
  request): username and password accounts with recovery codes, public
  profiles at `/u/<name>`, a Settings page (preferences, profile, password,
  devices, data export, deleting the account), settings and history kept the
  same on every device, rated matchmaking ("Find a rated game" on the Play
  page), and real leaderboards per board size and clock. The sample
  leaderboard data is gone. How it works: "Accounts and ratings" in
  MULTIPLAYER.md. **Live** since 2026-10-31 (version ece2c32e, with the
  owner's yes; migration `v2` applied). `check:online` against the live site
  signs up two throwaway accounts and deletes them again.
- **Online play has a real server** (w25, 2026-10-29): a Cloudflare Worker
  with one Durable Object per match (`worker/`), chosen with the owner because
  it is free and does not sleep. The Online page now uses it with invite
  links, from any device. **It is live at
  https://play.open-dam.workers.dev** (deployed 2026-10-29 from
  `feat/overhaul` with the owner's yes, on the owner's Cloudflare account).
  Deploy again only when the owner says so: `npm run deploy`, then
  `ONLINE_URL=https://play.open-dam.workers.dev npm run check:online`.
- **Next up:** the quality pass.
- The AI was rebuilt with five Wolof-named tiers (row w27): Döff (the fool),
  Khàlé (the child), Ndö (the youngster), Màam (the elder), Seriñ (the master). To judge its play,
  use `npm run check:endgames` and `npm run replay`.
- The computer now opens from a measured **opening book** (row w34), and the
  Learn page has **puzzles** and two strategy chapters (row w35). Re-measure
  the book with `npm run openings` after any change to the rules or the
  evaluation (recipe in WALKTHROUGH.md Part 11).
- With the board clear, shifts do the quality pass described in the scheduled
  task: look for real problems, add rows (next ids **w49**, **v15**), fix them.
- `feat/overhaul` is on GitHub: the owner asked for it to be pushed on
  2026-10-29. `main` is untouched; to release, open a pull request from
  `feat/overhaul` into `main`.
- The owner plays a private copy on their phone:
  https://claude.ai/artifact/MxbYGWhJ7w14nSmmoj3e33 (only the owner can open
  it). To bring it up to date, run `npm run build:static` and republish
  `dist-static` to that link (recipe in WALKTHROUGH.md Part 11). Online play
  works there only if it was built with `VITE_MATCH_SERVER` set to the
  deployed server's address.

## Starting a new session

Open a new Claude Code session in this folder and paste this:

```text
Continue the Open Dam overhaul. Work only on branch feat/overhaul; never push,
never touch main, never force anything, never delete branches or tags,
never deploy (npm run deploy, wrangler deploy) unless the owner says so in chat.
Read docs/HANDOVER.md first and follow it, then codebase.md and
docs/WALKTHROUGH.md. The live work list is the handover board
(https://claude.ai/artifact/8EzQNkWbb4L61sxHUrT9LA, collection "items"; load
the ArtifactData tool to read and update it). Take rows in this order: doing,
then todo work rows by phase and order, then todo verify rows. Set a row to
doing before you start it, run npm run verify before each commit, check UI in
the browser at desktop and 375px in all four themes, commit each finished row
on its own, and mark it done with the commit hash and what you checked. Use
your own judgement instead of asking. Before you stop, leave the tree clean and
add an entry to the shift log in docs/HANDOVER.md.
```

The scheduled shifts (below) use a longer version of the same instructions.

## Where the work is tracked

The **handover board** is the live work list:
https://claude.ai/artifact/8EzQNkWbb4L61sxHUrT9LA

Each row is one piece of work with its priority (P0–P3), why it matters, the
evidence, and a definition of done. Rows have a status: `todo`, `doing`,
`blocked` or `done`. Agents update rows through the page's shared store
(collection `items`; the page explains the protocol at the bottom). People can
change a row's status and notes directly on the page.

## Branches and safety

- All overhaul work happens on **`feat/overhaul`**. `main` has not been touched.
- The project as it was before the overhaul is kept twice: tag
  **`pre-overhaul-2026-10-27`** and branch **`backup/pre-overhaul-2026-10-27`**
  (which also includes the uncommitted Home page work that existed then).
- Commit finished work on `feat/overhaul`. Do not push, force-push, rewrite
  history, or delete branches and tags unless the owner asks. The owner
  pushed `feat/overhaul` once (2026-10-29); that does not make later pushes
  routine, so leave pushing to them.
- To bring the work into `main`, open a pull request from `feat/overhaul`.

## Before you change anything

1. Read `docs/WALKTHROUGH.md` (how it fits together) and `codebase.md` (where
   things are).
2. `npm ci` if `node_modules` is missing, then `npm run verify`. It should pass.
   If it does not, fixing that is the first job.

## How to work

- Keep each layer in its lane: rules in `src/game`, the match log in
  `src/match`, networking in `src/net`, AI in `src/ai`, React glue in
  `src/hooks`, visuals in `src/themes` and `src/styles`. Lower layers never
  import higher ones.
- Every behaviour change gets a test. Rules: `src/game/engine.test.ts`. Match
  and clocks: `src/match/match.test.ts`. Online: `src/net/net.test.ts`. UI:
  `src/test/ui.test.tsx`. Tutorial examples are checked automatically.
- Colours, borders and shadows come from theme tokens. Never write a colour in
  `src/styles/app.css`; a theme-specific look goes in that theme's `theme.css`.
- Words the game shows about outcomes, offers and moves live in
  `src/lib/describe.ts`.
- Check UI changes in the browser at desktop and 375px width, in all four
  themes. The Claude desktop app can start the dev server from
  `.claude/launch.json` ("open-dam dev").
- `npm run verify` before every commit. `npm run check:ai` after any change to
  `src/ai` (takes about two minutes).
- Update `codebase.md` and `docs/WALKTHROUGH.md` in the same commit when you
  add, move or repurpose files.

## Commands

| Command                | What it does                                    |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Dev server at http://localhost:5173             |
| `npm run verify`       | Typecheck, lint, format check, tests, build     |
| `npm test`             | Unit and UI tests (about 240, a few seconds)    |
| `npm run check:ai`     | AI strength match between tiers (slow)          |
| `npm run format`       | Apply Prettier formatting                       |
| `npm run build`        | Production build into `dist/`                   |
| `npm run build:static` | A copy for any static host, into `dist-static/` |
| `npm run server`       | The online server locally (port 8787)           |
| `npm run check:online` | Real games against a running server             |
| `npm run deploy`       | `verify`, then publish to Cloudflare            |

## Scheduled shifts

A scheduled task ("Open Dam: overhaul shift") opens a new Claude Code session
every five hours (2am, 7am, 12pm, 5pm, 10pm local time) while the Claude app is
running. Each shift reads this file, works through the board in priority order
on `feat/overhaul`, verifies, commits, updates the board, and adds an entry to
the log below. Manage it from the "Scheduled" section of the Claude app.

## Shift log

Newest first. Each entry: date and time, rows touched and their new status,
commits, checks run, notes for the next shift.

### 2026-11-01 (owner's request: PWA, offline, a logo)

- **Rows:** w48 (new: installable offline app and logo) → done.
- **Logo:** `src/themes/brand.ts` (one geometry), `BrandMark` in the top bar
  and on the Home page in each theme's colours, icons drawn by
  `npm run icons` (favicon.svg and .ico, 192, 512, maskable 512, Apple touch
  icon). The old favicon was Vite's default.
- **App:** manifest; `src/pwa/` (policy, service worker, registration);
  `scripts/vite-service-worker.ts`; offline notice and update card
  (`AppNotices`); Settings → App; the account remembered for opening
  offline, and caught up on reconnecting.
- **Checks:** `npm run verify` (308 tests); in headless Chrome against a
  production build: the first visit saves 28 files, then offline every page
  opens, every saved file loads, a game against the computer starts and its
  worker loads; a rebuild shows the update card, and "Update now" switches
  versions and deletes the old cache. The four themes' marks checked in the
  browser pane.
- **Deployed** with the owner's yes as be278349, which broke page loads
  once its worker took over: Cloudflare redirects `/index.html`, and the
  worker had saved that redirect as the page. Fixed in the next commit (save
  `/`), deployed as 60a12bae within minutes; checked in headless Chrome that
  a browser holding the broken worker recovers on its second load, and that
  the live site opens and works offline.
- **Then, at the owner's request:** an install button in the top bar and an
  install card on Home as soon as it opens (browsers only open their install
  dialog after a tap, so the card is that tap). At 375px the top bar's
  spacing and name tighten while the button shows, so a signed-in avatar
  still fits in all four themes. Deployed with the owner's yes as
  080db774; checked live: works offline, the card and button appear when
  the browser offers installing, Install opens its dialog, the top bar fits.
- **Not done:** trying an install on a real phone (the owner's to do).
- **Local servers:** `wrangler dev` on Windows does not pick up a rebuild's
  new file names (it answers them with the page); restart it after each
  build, and stop leftover `workerd` processes. The Claude app's browser pane
  cannot run a service worker from a local server; use real Chrome.

### 2026-10-31 evening (owner's request: accounts, users, leaderboards)

- **Rows:** w47 (new: accounts) → done; w26 (ratings and matchmaking) → done,
  finished by the same work.
- **Server:** `Accounts` and `LobbyRoom` Durable Objects (migration `v2`),
  `AccountStore` over SQLite with its own tests on Node's SQLite, every
  account route in `worker/index.ts`. The match room now knows who is signed
  in at each seat, keeps a claimed seat for its account, and reports finished
  games, which `Accounts` stores and rates.
- **App:** sign in, sign up and reset pages; the account menu; Settings
  (preferences for everyone, profile, sign-in, devices, data); profiles;
  real leaderboards; review of online games at `/game/<id>`; "Find a rated
  game"; names and ratings beside the board and in the result. New
  preferences: reduce motion, move hints, premoves, the result banner.
- **Placeholders removed:** `src/data/leaderboards.ts` (sample players), the
  "Preview" tags on Online, `public/board.png` (unused).
- **Checks:** `npm run verify` (299 tests); `check:online` against
  `wrangler dev` (9 tests, including two accounts paired in the lobby playing
  a rated game); by hand in the browser: sign-up, settings, a rated game
  against a scripted second account, profile, leaderboard, review, at desktop
  and 375px, in all four themes.
- **Deployed** with the owner's yes: version ece2c32e at
  https://play.open-dam.workers.dev; `check:online` against it passed (9),
  and its throwaway accounts were deleted (the 8×8 leaderboard is empty).
- **Not done:** abandoned untimed rated games never finish, so they are never
  rated; a later row could end them.

### 2026-10-31 15:00 (scheduled shift)

- **Rows:** w46 (new) → done; w26 → still doing (second slice). Nothing else
  was open.
- **w46 (be9166d):** the server trusted a browser's rules. `makeSettings` only
  merges objects, so `POST /api/matches` could store a 1000-square board or a
  made-up clock. `sanitizeSettings` in `src/game/settings.ts` now checks every
  field; the worker and `parseRecord` use it. **Not deployed:** the live site
  still accepts any settings until the next deploy.
- **w26 (6a80138):** `Lobby` in `src/net/lobby.ts` with seek, cancel,
  seeking, paired and seek-ended messages. Ratings are looked up on the
  server, not sent by the browser. The 2026-10-29 shift's note on w26 named
  this slice, but it had never been committed.
- **Checks:** `npm run verify` before each commit (259 tests at the end). No
  browser check: nothing the app shows changed. `check:ai` not run (no AI
  changes).
- **Next up (w26):** a lobby Durable Object and route. It needs a `v2`
  migration in `wrangler.jsonc`, so show the owner before deploying. Then the
  app's "Find a game" button, stored ratings, and real leaderboards.

### 2026-10-29 late evening (owner's requests: address, clock, premoves)

- **Address:** the worker is renamed `play`; the site is
  https://play.open-dam.workers.dev (w44). The old worker `open-dam` still
  serves an older build at the old address; delete it only if the owner asks.
- **Clock (w42, 17fbf0b):** each side's first move is free; the clock starts
  once both have moved.
- **Board and invite (w40, w41):** Neobrutalist pieces hop past the frame;
  the invite sits in the side panel on wide screens, above the board below
  1000px.
- **Premoves (w43, fecd529)** against the computer and online, and two
  Neobrutalist details (w45): round icon buttons, a readable invite heading.
- **Checks:** `npm run verify` (241 tests); `check:online` against the live
  site after each deploy (latest version 7d3d9080); premoves played against
  Seriñ in the browser.
- **Next up:** w26 (ratings and matchmaking), then identity.

### 2026-10-29 evening (first live online game, fixes, review)

- **Game:** the owner (Red) played Claude (Blue) on the live site, game
  `d31d6db07896`; Blue won by calling Red's last king. Claude played through
  a small Node bridge (MatchGuest over WebSocketTransport) so its seat stayed
  connected; a background browser tab would have stalled.
- **Bugs the owner found while playing, all fixed but NOT DEPLOYED:**
  - w36 (6609f99): moved pieces disappeared. A slide that never ran (page in
    the background) kept the piece hidden. Slides now end after 1.5 s, and a
    square hides only the piece sliding onto it.
  - w37 and the Atelier turn stripe (d2b4d5a): Neobrutalist's ring on Blue
    moves half the shadow offset; Atelier's turn card loses its black stripe.
  - w38 (d2b4d5a): Carnival's striped band above the board is gone.
- **Review (w39, bf2fdc0):** `npm run review` graded the game against Seriñ.
  Red matched Seriñ on 11 of 23 moves at 0.56 pieces a move; costliest were 25. b2-b3 (4.7), 3. a1xa3 (2.4), 13. c3-c4 (1.9). Blue matched 11 of 21 at
  0.07 pieces a move, plus 4 slower wins in the lone-king hunt where Seriñ saw
  a forced win. One position (24. e2-e1) scored better than Seriñ's choice in
  one run and 0.74 worse in the next: at 2.6 s the search is not fully stable.
- **Checks:** `npm run verify` (239 tests). Atelier and Carnival checked in
  the browser.
- **Deployed** at the owner's word (version 1a2ad76f): `check:online` passed live, and
  the background-tab move and all three theme rules were confirmed on the site.
- **Next up:** identity (MULTIPLAYER.md step 7).

### 2026-10-29 (owner's request: online server on Cloudflare)

- **Decision:** the owner asked for free, practical online play and chose
  Cloudflare (Workers and a SQLite-backed Durable Object per match) over a
  Node server on a free host that sleeps. This replaces the approved "local
  `ws` server" step; `MatchServer` needed no changes beyond typing.
- **Server:** `worker/index.ts` (create a match, WebSocket upgrade, serve the
  app from `dist/`), `worker/room.ts` (`MatchRoom` runs `MatchServer` with
  Durable Object storage; idle games are deleted after 30 days),
  `wrangler.jsonc`. Wrangler and the Workers types are dev dependencies.
- **App:** New game → Online asks the server for a game (`src/net/api.ts`);
  both players are `MatchGuest`s over `WebSocketTransport`. The invite link
  sits in a bar above the board while the opponent is away (on a phone the
  side panel is below the board), with Copy and Share. Unknown links show
  "Game not found" (new `missing` connection state). Home's Online link opens
  New game set to Online. The same-browser host mode is gone.
- **Checks:** `npm run verify` (237 tests, including three new UI tests and
  two guest tests). `npm run check:online` against `wrangler dev`, directly
  and through Vite's proxy (6 tests). `wrangler deploy --dry-run` bundles.
  In the in-app browser: a game between two tabs on the local server, a
  reload rejoining Blue's seat, a bad link, and the invite bar at desktop and
  375 px.
- **Deployed** at the owner's word to https://play.open-dam.workers.dev.
  The new `workers.dev` subdomain refused TLS for about 90 seconds while its
  certificate was issued; after that `npm run check:online` passed against it
  (6 tests) and the site loaded in the browser.
- **Not done:** accounts or identity: anyone with a link can take a free seat.
- **Next up:** identity (MULTIPLAYER.md step 7).

### 2026-10-28 evening to 2026-10-29 (owner's live requests, release)

- **End of game:** the small circles drawn under every piece when a game ends
  are gone (7cd3294; 85b08ae had only re-centred them). The hop and slump
  wave, the Neobrutalist flash, the Atelier rule and the Carnival confetti
  remain; Sand has no `EndSequence`.
- **Sounds:** every theme has a sound for every cue, synthesised in code
  (09b945d). They were then rebuilt from band-limited waves and filtered,
  because the first version sounded bitcrushed (0c2afcf). See
  `docs/SOUNDS.md`. They still need a person's ear: `npm run sounds`.
- **Sand pieces:** sticks are tapered twigs with knots, snapped ends and
  sometimes a side shoot (b2de765); stones are lumpy, grainy pebbles
  (2ab6d35).
- **House rules:** a choice group too wide for one row no longer strands one
  option on a row of its own, in every theme (2ab84a8).
- **Font:** Neobrutalist headings use Bowlby One in normal case, and nothing
  in that theme is forced into capitals (ba036ca). The small labels above page
  titles ("PLAY") are still capitals in every theme.
- **Phone copy:** `npm run build:static` (0566118) builds a copy with hash
  routes and relative paths. The owner plays it from a private artifact (link
  in Current state) and confirmed it works.
- **Release:** at the owner's request, `feat/overhaul` was pushed to GitHub.
  `main` is untouched and no pull request was opened.
- **Checks:** `npm run verify` before each commit (232 tests). Each UI change
  was checked in the in-app browser at desktop and 375 px in all four themes.
- **Next up:** unchanged, w25's local `ws` server.

### 2026-10-28 late evening (owner's requests: openings, lessons)

- **Rows added and done:** w31 (Sand theme), w32 (end of game, New Game,
  hero), w33 (sound effects) were finished earlier but missing from the board;
  w34 (opening book), w35 (strategy lessons and puzzles), v13 (puzzles played
  in the browser).
- **Engine fix:** `legalActions` left out the yin/yang centre placements, so
  the computer never used the special first move. It now lists every legal one.
- **Opening book:** Seriñ played itself from every first move on 5×5, 7×7 and
  9×9 (`npm run openings`, 16 games per opening on 5×5, 12 on 7×7, 8 on 9×9).
  Each tier picks its first move by weight, sharper for stronger tiers. 9×9 is
  still noisy at 8 games; more games there would sharpen it.
- **Lessons:** puzzles in five existing chapters plus two new chapters, built
  from the owner's strategy notes (the two-square trap, breaking it with a
  supported pair, defending it). Every puzzle replays in `tutorial.test.ts`.
- **Checks:** `npm run verify` (232 tests) and `npm run check:ai` (tiers in
  order: khale 6–0 doff, ndo 6–0 khale, maam 6–0 ndo, serin 4–1–1 maam). Every
  puzzle was played in the in-app browser at desktop and 375 px, in
  Neobrutalist, Sand and Carnival, mistakes included (row v13). Test progress
  was cleared from the in-app browser afterwards.
- **Owner review fixed:** the sacrifice example let the defender take the bait
  sideways, and the opening puzzle rejected moves without saying why. Both are
  fixed; every first move now explains itself, and a test checks no puzzle
  solution leaves the opponent an immediate capture.

### 2026-10-28 20:45–21:05 (scheduled shift)

- **Rows:** w25 → doing (first slice: `MatchServer` and `WebSocketTransport`),
  w26 → doing (first slice: Elo ratings, `SeekQueue`, `onFinished` hook). No
  other rows were open.
- **Commits:** 598f49b (w25), ffe75a5 (w26), 0cbdcba (server refuses stored
  games that do not replay instead of throwing), and this log entry.
- **Checks:** `npm run verify` before each commit (189 tests at the end).
  `server.test.ts` plays games end to end over a fake socket network,
  including a dropped link, a server crash and restart, and a flag. No
  browser check: nothing in the app uses the new code yet. `check:ai` not
  run (no AI changes).
- **Behaviour change to know about:** in `linkHost`, a `ping` from a client
  whose seat claim has lapsed now wins the seat back if nobody else holds it.
  Both reconnect tests fail without it. The two-tab online mode uses the same
  code; its tests pass, but it was not re-checked in the browser.
- **Notes:** this shift's session started at 02:10 and sat idle until 20:45,
  while another session committed the 08:00–20:12 work. Check `git log`
  before trusting the board. The next step for w25 is a Node entry point that
  runs a WebSocket server and hands connections to `MatchServer.accept`. That
  needs a dependency (for example `ws`) and a choice of where to host it, so
  it is the owner's call.

### 2026-10-28 (end of game, New Game, hero)

- At the owner's request: a new end-of-game moment (`OutcomeSplash`, plus a
  wave of piece reactions on the board), see "The end of a game" in Part 9 of
  WALKTHROUGH.md. New Game now asks for the mode first and shows the computer
  opponents as a ladder with strength pips only in computer mode. The Home hero
  has a short lede and the rules in three numbered lines.
- Checked with headless Chrome frames (the app's browser pane was hidden):
  win, loss and draw in all four themes at 1280 px, and at 390 px.

### 2026-10-28 (Sand theme)

- New theme **Sand** (`src/themes/sand`), from the owner's idea of a grid drawn
  in the sand with sticks and stones. The board is tilted in CSS 3D and pieces
  are stacks of thin layers lifted with `translateZ`; see "A 3D theme" in Part 8
  of WALKTHROUGH.md. `BoardView` now measures the board with `offsetWidth`, so
  a tilted board does not throw travelling pieces off course.
- A UI test renders every theme with kings, square marks and a finished game.

### 2026-10-28 (tier order)

- At the owner's request Khàlé (the child) is now the second tier and Ndö (the
  youngster) the third. Ids moved with the names, so `?vs=ndo` and the default
  opponent are now the third-strongest tier; the old "club" id maps to `ndo`.
  Earlier log entries use the old order.

### 2026-10-28 (tier meanings)

- The owner confirmed that Ndö means a youngster, usually a teen. Each tier now
  shows its meaning beside its name on Home and in the opponent picker
  (`meaning` in `difficulty.ts`).

### 2026-10-28 08:00–09:00 (owner's requests)

- **Done:** w23 (analysis move list), and new rows w27 (AI rebuilt: tiers Döff,
  Ndö, Khàlé, Màam, Seriñ; call-aware quiescence, chain and forced-reply
  extensions, transposition table, lone-king technique), w28 (house rules
  dialog), w29 (Home demo board and previews), w30 (Carnival tokens).
  Verification v04–v12 done in the browser.
- **Bugs found by checking, fixed:** rematch kept showing the finished game
  (route keyed by id; Online and Review too); every movable piece was its own
  Tab stop (framer-motion whileTap); dialogs scrolled their title away on short
  screens; "1 moves".
- **Commits:** 0dcfcad, 8d92af5, 0b27a76, 17ee157, b0b8b6c, and the docs commit.
- **Checks:** verify (163 tests). Ladder: ndo 6–0 doff, khale 6–0 ndo, maam
  5–0–1 khale, serin 2–1–3 maam (400 ms cap), serin 6–0 doff. Endgames, 7×7:
  K+K v K 8/8, K+man v K 8/8; 9×9 K+man v K 5/6 at full thinking time.
- **Notes:** the first lone-king term made the engine refuse winning captures
  (0–12 against the old engine); see Part 4 of WALKTHROUGH.md. A greyscale
  screenshot of the three themes could not be taken (hidden window); worth a
  look by a person. The meaning of "Ndö" is unconfirmed; the UI shows names
  only.
- **Artifacts:** handover board and walkthrough pages are now phone-friendly.

### 2026-10-28 (handover)

- **No code changes.** Added "Current state" and a paste-ready prompt for
  starting a new session to this file. The board matches the state above.
- **Scheduler:** the 2am shift did not run (no run recorded). Shifts only run
  while the Claude app is open and the PC is awake. If a shift's log entry is
  missing, check the task's run history in the app before assuming work
  happened.
- **Next up:** w23 (move list on the analysis page), then v04–v12.

### 2026-10-28 00:40 (overhaul session)

- **Done:** w01–w20, w22, w24 (build, AI input ownership, tutorial, calling UI,
  clocks, resume and rematch, no-move rule, all chapters, offers and resign,
  review, multiplayer core and two-tab online, accessibility, phone layout,
  reduced motion, Home, themes, copy, strict lint, tests, CI, AI worker).
  Verification v01–v03 done.
- **Doing:** w21 (docs; this commit), w23 (analysis board still lacks a move
  list), v05–v08, v11, v12 (partly checked; notes on each row say what is left).
- **Todo:** v04, v09, v10; w25 and w26 are future server work.
- **Commits:** 5528d18, 5098979, 0a0d082, 0d90758, and the docs commit after.
- **Checks:** `npm run verify` passes; `npm run check:ai` passes (club 6–0
  novice, expert 6–0 club, master 6–0 novice, master 5–0–1 expert).
- **Notes:** in development, React StrictMode mounts twice, so a local game's
  log gets an extra pause/resume pair on load. It is harmless and does not
  happen in production builds.
