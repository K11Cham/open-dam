# Handover

How to pick up work on Open Dam, whether you are a person or an agent.

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
