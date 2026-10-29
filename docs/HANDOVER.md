# Handover

How to pick up work on Open Dam, whether you are a person or an agent.

## Current state (2026-10-28)

- `feat/overhaul` builds and `npm run verify` passes (189 tests). Every work
  row and every verification row is done except the server rows **w25** and
  **w26**. Both are `doing`: their pure, tested parts exist (`src/net/server.ts`,
  `websocket.ts`, `matchmaking.ts`, `src/match/rating.ts`); what is left needs
  a hosted server, a database or accounts (see each row's note and
  "Adding a real server" in MULTIPLAYER.md).
- **Next up (owner approved, 2026-10-28):** w25's next step. Add the `ws`
  dependency and a small Node entry point that hands connections to
  `MatchServer.accept`, with an in-memory store, runnable locally through an
  npm script.
- The AI was rebuilt with five Wolof-named tiers (row w27): Döff (the fool),
  Khàlé (the child), Ndö (the youngster), Màam (the elder), Seriñ (the master). To judge its play,
  use `npm run check:endgames` and `npm run replay`.
- With the board clear, shifts do the quality pass described in the scheduled
  task: look for real problems, add rows (next ids **w31**, **v13**), fix them.
- Nothing has been pushed and `main` is untouched.

## Starting a new session

Open a new Claude Code session in this folder and paste this:

```text
Continue the Open Dam overhaul. Work only on branch feat/overhaul; never push,
never touch main, never force anything, never delete branches or tags.
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
  history, or delete branches and tags unless the owner asks.
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
- Check UI changes in the browser at desktop and 375px width, in all three
  themes. The Claude desktop app can start the dev server from
  `.claude/launch.json` ("open-dam dev").
- `npm run verify` before every commit. `npm run check:ai` after any change to
  `src/ai` (takes about two minutes).
- Update `codebase.md` and `docs/WALKTHROUGH.md` in the same commit when you
  add, move or repurpose files.

## Commands

| Command            | What it does                                 |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Dev server at http://localhost:5173          |
| `npm run verify`   | Typecheck, lint, format check, tests, build  |
| `npm test`         | Unit and UI tests (about 150, a few seconds) |
| `npm run check:ai` | AI strength match between tiers (slow)       |
| `npm run format`   | Apply Prettier formatting                    |
| `npm run build`    | Production build into `dist/`                |

## Scheduled shifts

A scheduled task ("Open Dam: overhaul shift") opens a new Claude Code session
every five hours (2am, 7am, 12pm, 5pm, 10pm local time) while the Claude app is
running. Each shift reads this file, works through the board in priority order
on `feat/overhaul`, verifies, commits, updates the board, and adds an entry to
the log below. Manage it from the "Scheduled" section of the Claude app.

## Shift log

Newest first. Each entry: date and time, rows touched and their new status,
commits, checks run, notes for the next shift.

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
