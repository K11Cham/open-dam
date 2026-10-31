# codebase.md

Every file in the project with a one-line note on what it does. Keep this up to
date whenever files are added, removed or repurposed. For how the parts fit
together, read `docs/WALKTHROUGH.md`.

**Layers, bottom to top.** `src/game` is the pure rules engine. `src/ai` plays
it. `src/match` turns the engine into a game: an action log with seats, offers
and clocks. `src/net` sends that log between devices. `src/hooks` connect all
of it to React. `src/components` and `src/pages` are the UI. `src/themes` owns
every visual decision. Lower layers never import higher ones.

## Root

| File                                                       | Purpose                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`                                                | What the project is, how to run it, where to read next.                                                                                                                        |
| `CLAUDE.md`                                                | Short orientation for AI coding agents working in this repo.                                                                                                                   |
| `codebase.md`                                              | This file.                                                                                                                                                                     |
| `LICENSE`                                                  | MIT licence.                                                                                                                                                                   |
| `index.html`                                               | Vite entry document (meta tags, root element).                                                                                                                                 |
| `package.json` / `package-lock.json`                       | Dependencies and scripts: `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `check:ai`, `sounds`, `build:static`, `verify`, `server`, `check:online`, `deploy`, `review`. |
| `vite.config.ts`                                           | Vite: React plugin, React Compiler, ES-module workers, `/api` proxy to the local server, Vitest settings.                                                                      |
| `wrangler.jsonc`                                           | Cloudflare Workers config: the server's entry, the built app as assets, the Durable Object for matches.                                                                        |
| `vitest.ai.config.ts`                                      | Separate Vitest config for the slow AI strength match (`npm run check:ai`).                                                                                                    |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | TypeScript project references (plus `worker/tsconfig.json`); the app is `strict`.                                                                                              |
| `eslint.config.js`                                         | ESLint flat config (TypeScript, React Hooks, React Refresh rules).                                                                                                             |
| `.prettierrc.json`, `.prettierignore`                      | Formatting rules (no semicolons, single quotes, 130 columns).                                                                                                                  |
| `.env.static`                                              | Build mode for `npm run build:static`: hash routes, for static hosts.                                                                                                          |
| `.gitattributes`                                           | Normalises line endings to LF.                                                                                                                                                 |
| `.gitignore`                                               | Ignore rules.                                                                                                                                                                  |
| `.github/workflows/ci.yml`                                 | CI: typecheck, lint, format check, tests and build on push and pull request.                                                                                                   |
| `.claude/launch.json`                                      | Dev-server definition for the Claude desktop app's preview browser.                                                                                                            |

## `docs/`

| File                                      | Purpose                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `docs/WALKTHROUGH.md`                     | The guided tour: how everything connects, with traces and exercises.                 |
| `docs/HANDOVER.md`                        | How to pick up work: the board, the rules of the branch, the shift log.              |
| `docs/MULTIPLAYER.md`                     | The match log, the wire protocol, and how to add a real server.                      |
| `docs/SOUNDS.md`                          | How the sound effects work, how to tune them, and which recorded sounds may be used. |
| `docs/audit/2026-10-27-codebase-audit.md` | The audit that started the overhaul (describes the old code).                        |

## `scripts/`

| File                            | Purpose                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `scripts/ai-strength.test.ts`   | Tier-vs-tier matches; asserts stronger tiers outscore weaker ones. Slow; run with `npm run check:ai`.   |
| `scripts/ai-endgames.test.ts`   | Endgame conversion from random starts (`npm run check:endgames`).                                       |
| `scripts/ai-replay.test.ts`     | Prints one computer game ply by ply with scores (`npm run replay`), for studying its play.              |
| `scripts/ai-openings.test.ts`   | Seriñ plays itself from every first move; the source of the opening book (`npm run openings`).          |
| `scripts/render-sounds.test.ts` | Renders every theme's sounds to `sound-preview/` as WAV files with a listening page (`npm run sounds`). |
| `scripts/ai-review.test.ts`     | Grades a finished game against Seriñ, move by move (`npm run review`).                                  |
| `scripts/online-server.test.ts` | Real games against a running online server, local or deployed (`npm run check:online`).                 |

## `worker/` — the online server (Cloudflare Workers)

| File            | Purpose                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `index.ts`      | The Worker: `POST /api/matches`, WebSocket upgrades to the match's Durable Object, the app for other paths. |
| `room.ts`       | `MatchRoom`, one Durable Object per match: runs `MatchServer` with its own storage; clears idle games.      |
| `tsconfig.json` | Type checking with the Workers runtime's types instead of the DOM's.                                        |

## `public/`

| File                 | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `public/favicon.svg` | Site icon.                                                            |
| `public/board.png`   | Board illustration from the pre-overhaul Home page; currently unused. |

## `src/` entry

| File           | Purpose                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx` | Imports fonts and global CSS, mounts `<App>` in StrictMode.                                                                        |
| `src/App.tsx`  | `AppProviders` (theme, motion, toasts), `AppRoutes` (all routes, lazy-loading the rarer pages), and `App` with the browser router. |

## `src/game/` — the rules engine (pure: no React, no DOM, no storage, no clock)

| File             | Purpose                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`       | The vocabulary: pieces, board, rule settings, `EngineState`, `EngineAction`, `GameEvent`, results.                                                                                           |
| `board.ts`       | Direction convention, starting positions (interlocking and rows), cloning, counting, position keys.                                                                                          |
| `moves.ts`       | Move and capture generation; `classifyMove` turns a from/to pair into a slide, a capture or a reason it is illegal.                                                                          |
| `engine.ts`      | The state machine: `applyMove`, `applyCall`, `declineChain`, `resign`, `agreeDraw`, `flagTimeout`, the `applyAction` dispatcher, `legalActions`, `destinationsFor`, and every end condition. |
| `notation.ts`    | Square names (`c3`), move notation (`c2xc4xe4=K ?!`), and grouping plies into numbered rows.                                                                                                 |
| `settings.ts`    | Default rules (with reasons), time controls, labels, rules summary, matchmaking compatibility, `sanitizeSettings` for untrusted input.                                                       |
| `position.ts`    | Build a position from text rows (`'..a..'`) and back; used by tests, the tutorial and the analysis board.                                                                                    |
| `clock.ts`       | `formatClock` only; clock arithmetic lives in `src/match/clock.ts`.                                                                                                                          |
| `index.ts`       | Barrel re-export.                                                                                                                                                                            |
| `engine.test.ts` | 87 rule tests, one per rule branch.                                                                                                                                                          |

## `src/ai/` — the computer opponent (pure; the worker is the only browser-specific file)

| File               | Purpose                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evaluate.ts`      | Position scoring tuned to these rules (material, mobility, advancement, back row, call exposure, threats, king reach, endgame damping, draw counters, lone-king technique, `declineCost`).                                                   |
| `search.ts`        | Negamax with alpha-beta over the real engine: chain legs at no depth cost, greedy calls, call-aware quiescence, forced-reply extensions, transposition table, killer/history ordering, iterative deepening, root noise and bounded mistakes. |
| `hash.ts`          | Zobrist keys for positions, used by the transposition table.                                                                                                                                                                                 |
| `openings.ts`      | The opening book: measured scores for every yin/yang first move, and `pickOpening`, a weighted pick whose sharpness is each tier's `openingTemperature`.                                                                                     |
| `difficulty.ts`    | The five tiers (Döff, Khàlé, Ndö, Màam, Seriñ): depth, time budget, evaluation profile, noise, mistakes, missed calls, call awareness, extensions, undo and draw attitudes; old ids mapped by `normalizeDifficultyId`.                       |
| `opponent.ts`      | Non-move decisions: answer an undo request or a draw offer; thinking delay.                                                                                                                                                                  |
| `client.ts`        | `searchAsync`: runs the search in a Web Worker, falling back to the main thread.                                                                                                                                                             |
| `search.worker.ts` | The worker: receives a position, returns the chosen action.                                                                                                                                                                                  |
| `index.ts`         | Barrel re-export.                                                                                                                                                                                                                            |
| `ai.test.ts`       | Legality for every tier, the opening book, sacrifices, lone-king finishes, missed calls, time budget, offer decisions.                                                                                                                       |

## `src/audio/` — sound effects (pure, except `player.ts`)

| File            | Purpose                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------- |
| `types.ts`      | Cues, synthesis recipes, recorded sounds with credits, allowed licences.                     |
| `synth.ts`      | Renders a recipe to samples (no Web Audio needed) and encodes WAV.                           |
| `cues.ts`       | `cueForStep`: which one sound a game step makes.                                             |
| `player.ts`     | Plays sounds through Web Audio, caching each; the sound setting (on/off, volume) as a store. |
| `audio.test.ts` | Synth guarantees, cue choice, and every theme having an audible sound for every cue.         |

## `src/match/` — a game as an action log (pure, except `storage.ts`)

| File            | Purpose                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`      | `MatchConfig`, `Seat`, `MatchIntent`, `MatchAction`, `MatchRecord`, `MatchState`, `MatchClock`, notices.                          |
| `reducer.ts`    | `stepMatch`: validates and applies one intent (turn ownership, offers, undo, clock flags). `replay` rebuilds state from a record. |
| `clock.ts`      | Clock arithmetic driven by action timestamps: finish turn, settle, pause, resume, remaining time, flag time.                      |
| `session.ts`    | The observable `MatchSession` interface, `MatchHost` (authoritative), `createRecord`, ids.                                        |
| `setup.ts`      | The New Game form's result (`GameSetup`) and its URL form; builds records from it.                                                |
| `storage.ts`    | Validate, save and load the active match; archive finished games; pause the clock across a closed app.                            |
| `rating.ts`     | Elo ratings per pool (board size and clock) and which finished games count. Pure; a server applies it.                            |
| `match.test.ts` | Turn ownership, offers, undo, clocks, replay, storage round trips, ratings.                                                       |

## `src/net/` — online play (transport-agnostic)

| File             | Purpose                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `protocol.ts`    | Wire messages between guests and the host, and between seekers and the lobby; the `Transport` interface; match id format; heartbeats. |
| `api.ts`         | Where the server is (`VITE_MATCH_SERVER` or the site itself), its socket URL, and creating a match.                                   |
| `transport.ts`   | `BroadcastChannelTransport` (same browser); `MemoryHub` for tests; per-tab client id.                                                 |
| `hostLink.ts`    | Connects a `MatchHost` to a transport: binds seats, forwards guest intents, broadcasts actions and presence.                          |
| `guest.ts`       | `MatchGuest`: mirrors a remote host's log, sends intents, resynchronises on gaps.                                                     |
| `websocket.ts`   | `WebSocketTransport`: a browser's link to a match server; queues while down, reconnects with backoff.                                 |
| `server.ts`      | `MatchServer`: a server's match logic without the network (rooms, saving, server clock flags).                                        |
| `net.test.ts`    | Join, sync both ways, refusals, seat ownership, reconnect.                                                                            |
| `matchmaking.ts` | `SeekQueue`: pairs compatible seeks within a rating window that widens with waiting; resolves "match opponent".                       |
| `server.test.ts` | Server rooms end to end over a fake socket network (sync, refusals, spoofing, reconnect, restart, flags); matchmaking; rating hook.   |
| `lobby.ts`       | `Lobby`: the matchmaking server's logic without the network: seeks in, ratings looked up, games made, players told their seat.        |
| `lobby.test.ts`  | Pairing, server-side ratings, checked settings, cancel and leave, spoofed ids, a second tab, failed games, joining the paired game.   |

## `src/hooks/` — React adapters

| File                     | Purpose                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `useMatchSession.ts`     | Subscribe a component to a session (`useSyncExternalStore`) and receive each update.                          |
| `useMatchController.ts`  | Everything the match screen needs: what to draw, what is clickable, the actions, review, clock flags, toasts. |
| `useAIPlayer.ts`         | Plays one seat for the computer through the session; answers offers.                                          |
| `useMatchPersistence.ts` | Saves the hosted match after every action, archives finished games, pauses the clock on leaving.              |
| `useBoardAnimations.ts`  | Turns engine events into short-lived animations (travel, capture, call, crowning).                            |
| `usePointerDrag.ts`      | Tap-or-drag for mouse, touch and pen.                                                                         |
| `useNow.ts`              | A ticking "now" for clocks, only while a clock runs.                                                          |
| `useAnalysisBoard.ts`    | The analysis board's state: edit, play both sides, undo and redo, and the move list of the line being played. |

## `src/components/`

| File                       | Purpose                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `board/BoardView.tsx`      | The board: geometry, keyboard and pointer input, spoken labels, travelling pieces, the theme's parts.   |
| `board/BoardThumbnail.tsx` | A small static picture of a position (one SVG from theme tokens) for cards and lists.                   |
| `board/DemoBoard.tsx`      | Home's live demo game; runs only while visible and not under reduced motion.                            |
| `game/MatchScreen.tsx`     | Match layout: player cards, board, review bar, status, moves, info, resign confirmation, result dialog. |
| `game/PlayerCard.tsx`      | One side: name, pieces, turn state, clock, Undo/Draw/Resign.                                            |
| `game/StatusPanel.tsx`     | Whose turn, call and chain decisions, pending offers, the result.                                       |
| `game/MoveList.tsx`        | Notation list with review controls; takes a small `MoveListSource` (match or analysis line).            |
| `game/ResultDialog.tsx`    | End-of-game summary.                                                                                    |
| `game/OutcomeSplash.tsx`   | The result banner played before the summary: a different staging for a win, a loss and a draw.          |
| `game/ClockDisplay.tsx`    | One side's remaining time.                                                                              |
| `layout/AppShell.tsx`      | Skip link, top bar, main, footer.                                                                       |
| `layout/Navbar.tsx`        | Top bar, logo mark, navigation drawer on small screens.                                                 |
| `layout/ThemeMenu.tsx`     | Theme picker menu with swatches.                                                                        |
| `layout/SoundToggle.tsx`   | Sound effects on/off button in the top bar.                                                             |
| `layout/navItems.ts`       | Navigation destinations.                                                                                |
| `settings/RulesForm.tsx`   | Board and clock settings, and the house rules as a summary with an edit dialog.                         |
| `ui/Button.tsx`            | `Button`, `ButtonLink`, `IconButton`.                                                                   |
| `ui/Dialog.tsx`            | Accessible modal and drawer; `ConfirmDialog`.                                                           |
| `ui/Toasts.tsx`            | Toast provider and `useToast`.                                                                          |
| `ui/Segmented.tsx`         | Radio group drawn as segments.                                                                          |
| `ui/ChoiceCards.tsx`       | Radio group drawn as cards.                                                                             |
| `ui/Switch.tsx`            | On/off switch.                                                                                          |
| `ui/Panel.tsx`             | Themed surface.                                                                                         |

## `src/pages/`

| File                        | Purpose                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `HomePage.tsx`              | Hero, continue card, quick play, recent games, about.                       |
| `NewGamePage.tsx`           | Mode first, then opponent or side, then rules; starts a game.               |
| `MatchPage.tsx`             | `/match/:id` (a saved local game) and `/match/new` (start from a link).     |
| `OnlinePage.tsx`            | `/online/:id`: join a game on the server; invite bar and connection status. |
| `ReviewPage.tsx`            | `/review/:id`: step through a finished game.                                |
| `AnalysisPage.tsx`          | Free board with set-up tools and position codes.                            |
| `TutorialPage.tsx`          | `/learn` overview and `/learn/:chapterId`.                                  |
| `LeaderboardsPage.tsx`      | Sample standings, labelled as such.                                         |
| `NotFoundPage.tsx`          | Unknown addresses.                                                          |
| `tutorial/chapters.ts`      | The eleven chapters as data: text, example boards and puzzles.              |
| `tutorial/script.ts`        | Example-board scripts and their step notation.                              |
| `tutorial/ExampleBoard.tsx` | Plays a script through the engine, step by step.                            |
| `tutorial/puzzle.ts`        | Puzzle data types and `judge`, which decides if the reader's move is right. |
| `tutorial/PuzzleBoard.tsx`  | A board the reader plays: feedback, scripted replies, punished mistakes.    |
| `tutorial/progress.ts`      | Which puzzles this browser has solved (local storage).                      |
| `tutorial/openings.ts`      | The opening puzzle's answers, read from the AI's opening book.              |
| `tutorial/tutorial.test.ts` | Replays every example and every puzzle's answers, mistakes and punishments. |

## `src/themes/`

| File                | Purpose                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| `types.ts`          | The theme contract: tokens, parts, motion, side names.                               |
| `registry.ts`       | The four themes and the default.                                                     |
| `<theme>/theme.ts`  | Tokens, motion, side names.                                                          |
| `<theme>/parts.tsx` | Piece, square decoration, board frame, end-of-game sequence.                         |
| `<theme>/sounds.ts` | The theme's sound for every cue, as synthesis recipes (plain data, no CSS or React). |
| `<theme>/theme.css` | The theme's signature styles, scoped to `[data-theme='<theme>']`.                    |

## Elsewhere in `src/`

| File                            | Purpose                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `context/ThemeContext.tsx`      | Applies the theme's tokens to `<html>` and provides it.                      |
| `context/themeContextObject.ts` | The context object and its type.                                             |
| `context/useTheme.ts`           | `useTheme`, `useThemeParts`, `useSideNames`.                                 |
| `context/useSound.ts`           | `useSound`: play a cue in the current theme's voice, and the on/off setting. |
| `lib/describe.ts`               | Every sentence the game says about itself: outcomes, notices, spoken moves.  |
| `lib/usePageTitle.ts`           | Sets the browser tab title.                                                  |
| `services/storage.ts`           | Safe wrapper around localStorage; key list.                                  |
| `data/leaderboards.ts`          | Sample leaderboard data.                                                     |
| `styles/base.css`               | Reset, document defaults, focus ring, utilities, reduced motion.             |
| `styles/app.css`                | Structure for every component, using theme tokens only.                      |
| `test/setup.ts`                 | Test environment setup (jest-dom, cleanup, browser API stubs).               |
| `test/ui.test.tsx`              | UI tests through the real routes.                                            |
