# codebase.md

Every file in the project with a one-line note on what it does. Kept at the
repo root and updated whenever files are added, removed or repurposed.

Shape of the thing: `src/game` is a pure rules engine with no React in it,
`src/hooks` adapts that engine to React, `src/themes` owns all visual language,
`src/components` is shared structure that styles itself from theme tokens, and
`src/pages` wires routes together.

---

## Root

| File | Purpose |
| --- | --- |
| `codebase.md` | This file. |
| `README.md` | Project readme (unchanged from before the overhaul). |
| `LICENSE` | Project licence. |
| `index.html` | Vite entry document. |
| `package.json` | Dependencies and scripts (`dev`, `build`, `lint`, `preview`). |
| `package-lock.json` | Locked dependency tree. |
| `vite.config.ts` | Vite 8 config; React plugin plus the React Compiler babel preset. |
| `postcss.config.js` | PostCSS chain: `@tailwindcss/postcss` (Tailwind v4, CSS-configured) and autoprefixer. |
| `eslint.config.js` | Flat ESLint config. |
| `tsconfig.json` | Root project references. |
| `tsconfig.app.json` | Compiler options for `src`. |
| `tsconfig.node.json` | Compiler options for config files. |
| `tsconfig.check.json` | Standalone CommonJS config for the two node-run check harnesses (`npm run check:engine`, `npm run check:ai`). |
| `test-tool.ps1` | Pre-existing PowerShell helper; untouched. |
| `.gitignore` | Ignore rules. |

## `scripts/`

| File | Purpose |
| --- | --- |
| `scripts/ai-smoke.ts` | AI self-play harness: plays tier-vs-tier games, asserts every chosen action actually applies, checks the stronger tier is never outscored by the weaker, and verifies the time budget and undo policy. Run with `npm run check:ai`. |
| `scripts/engine-check.ts` | Standalone rules-engine check harness (75 assertions covering setup, movement, captures, chains, all three promotion policies, auto-king, calling, abandoned chains, end conditions, draw counters, the yin/yang opening and matchmaking compatibility). Run by compiling to CommonJS and executing with node; it has no test-runner dependency. |

## `public/`

| File | Purpose |
| --- | --- |
| `public/favicon.svg` | Site icon. |

## `src/` entry

| File | Purpose |
| --- | --- |
| `src/main.tsx` | React root; mounts `App` in StrictMode. |
| `src/App.tsx` | Router. Routes: `/`, `/play`, `/match`, `/analysis`, `/leaderboards`, `/learn`, catch-all redirect. Wraps everything in `ThemeProvider`. |
| `src/index.css` | Font imports, Tailwind import, base element styles. Holds no colour decisions — those live in themes. |
| `src/styles/app.css` | Shared, theme-agnostic layout for every component class (`.dam-*`). Reads only `--dam-*` tokens; hardcodes no colours. Includes the reduced-motion override. |

## `src/game/` — pure rules engine (no React, no DOM, no storage)

| File | Purpose |
| --- | --- |
| `src/game/types.ts` | The whole type vocabulary: pieces, board, rule settings, promotion policies, call settings, move records, the `GameEvent` union, engine state and result. |
| `src/game/settings.ts` | Rule defaults and the reasoning behind the subjective ones, time-control presets, `resolvePromotionPolicy` (with the online hook for "match opponent"), `settingsAreCompatible` / `filterCompatibleSeeks` for matchmaking, and the rules-summary text. |
| `src/game/board.ts` | Direction convention, board construction (yin/yang and even), cloning, piece counting, position serialisation for repetition detection. |
| `src/game/moves.ts` | Move and capture generation for normal pieces and kings, plus `classifyMove`, which turns a from/to pair into a slide, a capture, or a reason it is illegal. |
| `src/game/notation.ts` | Square naming, move formatting (quiet, capture, chain, crowning, skipped-capture annotation, calls, results) and `toMoveRows` for display grouping. |
| `src/game/engine.ts` | The state machine: `applyMove`, `applyCall`, `declineChain`, `resign`, `agreeDraw`, `flagTimeout`, `destinationsFor`, plus auto-king, promotion policy handling, offender computation and end-condition evaluation. |
| `src/game/clock.ts` | Pure clock arithmetic — tick, start, pause, `completeMove` (settle, increment, hand over), flag detection, display formatting. |
| `src/game/index.ts` | Barrel re-export of the above. |

## `src/ai/` — opponent (pure, no React)

| File | Purpose |
| --- | --- |
| `src/ai/evaluate.ts` | Evaluation written for this rule set: material with board-size-scaled king value, mobility, one-way advancement scaled by the active promotion policy, back-row blocking, call exposure priced by call scope, capture threats, king activity, endgame damping around the auto-king and one-piece-each tie rules, and awareness of the two draw counters. Term weights come from a swappable `EvalProfile`. |
| `src/ai/search.ts` | Negamax with alpha-beta over the real engine. Handles this game's non-alternating turns (a chain leg keeps the same side on move, so children are only negated when the turn actually changed), resolves calls greedily at node entry, extends captures with quiescence, and runs time-bounded iterative deepening with move ordering. |
| `src/ai/difficulty.ts` | Four tiers that differ in evaluation profile as well as depth — Novice is material-only at one ply, Master uses sharpened full weights to eight. Also carries per-tier noise, blunder rate, thinking delay, undo tolerance and draw-acceptance threshold. |
| `src/ai/opponent.ts` | Non-move decisions: `decideUndoRequest` prices an undo by evaluating the current position against the one it would rewind to and comparing the swing to the tier's tolerance; `decideDrawOffer` accepts when the position is level or worse. Replaces the auto-accept placeholder. |
| `src/ai/index.ts` | Barrel re-export. |

## `src/hooks/` — React adapters

| File | Purpose |
| --- | --- |
| `src/hooks/useGameLogic.ts` | Orchestrator. Owns selection, the state timeline (undo and move-list review), commits engine results, and wires the clock, offers and animation queue together. Contains no rule logic of its own. |
| `src/hooks/useBoardAnimations.ts` | Converts the engine's event stream into a short-lived animation queue and tracks recently-crowned pieces and the last move. |
| `src/hooks/useGameClock.ts` | Owns the live ticking clock, guarantees only one side runs at a time, and reports a flag. |
| `src/hooks/useMatchOffers.ts` | Undo and draw offer flow. `onUndoRequest` currently auto-accepts and is the marked extension point for AI-difficulty accept/reject logic. |
| `src/hooks/useAIOpponent.ts` | Drives the AI side: searches on its turn inside a time-budgeted timeout, applies the chosen action through the same controller methods a human uses, continues chains naturally, and answers draw offers. |
| `src/hooks/usePointerDrag.ts` | Pointer-events drag with a tap-vs-drag threshold, covering mouse, touch and pen in one path. Replaces the old mouse-only HTML5 drag-and-drop. |

## `src/themes/` — visual language

| File | Purpose |
| --- | --- |
| `src/themes/types.ts` | The theme contract: token map, component slots (`Piece`, `CellDecor`, `BoardFrame`, `EndSequence`), motion config, board gap and board style. |
| `src/themes/registry.ts` | The three themes, the key list, the default, and a type guard. |
| `src/themes/neobrutalist/theme.ts` | Neobrutalist token map and motion config — the original look, isolated. |
| `src/themes/neobrutalist/parts.tsx` | Neobrutalist pieces (outlined discs with a star crown), cell dots, board frame, and its flash-and-jolt end sequence. |
| `src/themes/neobrutalist/theme.css` | All neobrutalist structure, scoped to `[data-theme='neobrutalist']`. |
| `src/themes/atelier/theme.ts` | Atelier (minimalist) token map and motion config. |
| `src/themes/atelier/parts.tsx` | Atelier pieces (solid disc vs open ring, so the sides read in greyscale), hairline decorations, and its erase-and-rule end sequence. |
| `src/themes/atelier/theme.css` | Atelier structure: hairline board, full-bleed chrome, ledger-style side panel. Scoped to `[data-theme='atelier']`. |
| `src/themes/carnival/theme.ts` | Carnival (playful) token map and motion config. |
| `src/themes/carnival/parts.tsx` | Carnival pieces as drawn SVG characters with faces and crowns, sparkle decorations, bunting board frame, and its confetti end sequence. |
| `src/themes/carnival/theme.css` | Carnival structure: separated rounded tiles, floating chrome islands, card-stack side panel. Scoped to `[data-theme='carnival']`. |

## `src/context/`

| File | Purpose |
| --- | --- |
| `src/context/ThemeContext.tsx` | Applies the active theme's tokens to `<html>`, sets `data-theme`, exposes the theme and its parts, and detects coarse pointers so themes can skip hover-only affordances. |

## `src/components/ui/` — primitives

| File | Purpose |
| --- | --- |
| `src/components/ui/Button.tsx` | The only button. Carries layout, no visual opinion — themes decide its shape. |
| `src/components/ui/Panel.tsx` | Themed surface container. |
| `src/components/ui/Segmented.tsx` | Radio-group option row used across settings and lobby screens. |
| `src/components/ui/Switch.tsx` | Accessible toggle for the subjective rule settings. |

## `src/components/layout/`

| File | Purpose |
| --- | --- |
| `src/components/layout/AppShell.tsx` | Page frame: background, navbar, content slot, footer. `fill` mode for the match view. |
| `src/components/layout/Navbar.tsx` | Top bar with wordmark, routed links, theme menu and new-game button. |
| `src/components/layout/SideNav.tsx` | Slide-out navigation with backdrop and escape handling. |
| `src/components/layout/ThemeMenu.tsx` | Theme switcher listing each theme with its blurb. |
| `src/components/layout/navItems.ts` | Single source of truth for navigation destinations. |

## `src/components/board/`

| File | Purpose |
| --- | --- |
| `src/components/board/BoardView.tsx` | Board geometry, hit-testing, the travelling-piece layer, the drag ghost, and optional flipping for a blue-side human (board coordinates stay canonical; only drawing order and animation pixel maths mirror). Delegates the frame, each piece, each cell decoration and the end sequence to the active theme. |

## `src/components/game/`

| File | Purpose |
| --- | --- |
| `src/components/game/GameScreen.tsx` | Match layout: player bars, board, call picker, review banner, result strip, side panel, error toast. |
| `src/components/game/PlayerBar.tsx` | Per-side identity, clock and actions (end chain, call, undo, draw, resign), plus accept/decline when an offer is pending. |
| `src/components/game/GameClockView.tsx` | Clock readout with idle and low-time states. |
| `src/components/game/MoveHistory.tsx` | Notation list with annotation rows for calls and results, plus timeline navigation. |
| `src/components/game/CallPicker.tsx` | Target selection, shown only under `choose-one` scope with more than one offender. |

## `src/components/settings/`

| File | Purpose |
| --- | --- |
| `src/components/settings/OpponentPicker.tsx` | Opponent and side selection: hot seat or one of the four AI tiers, with each tier described by what its evaluation can see. |
| `src/components/settings/RuleSettingsPanel.tsx` | Pre-game rule toggles: board size, time control, promotion policy (all four options), call scope, abandoned-chain callability, both draw rules, and the rules summary. |

## `src/services/`

| File | Purpose |
| --- | --- |
| `src/services/storage.ts` | Namespaced JSON key/value wrapper over localStorage, kept as a seam for a real backend later. |

## `src/data/` — mock data for scaffolded pages

| File | Purpose |
| --- | --- |
| `src/data/ranked.ts` | Mock ranked pools broken out by mode, board size and time control, each carrying real `RuleSettings`. No elo maths. |
| `src/data/leaderboards.ts` | Mock leaderboard tables across four mode/size/clock combinations. |
| `src/data/aiOpponents.ts` | Pairs each AI tier against the existing mock elo bands — nearest ranked pool and approximate leaderboard rank. Still mock: nothing is recorded and beating Master moves no number. |

## `src/pages/`

| File | Purpose |
| --- | --- |
| `src/pages/HomePage.tsx` | Lobby-style home: hero with a Play button, quick links, and ranked sections backed by mock pools. |
| `src/pages/NewGamePage.tsx` | Rule settings plus a matchmaking preview driven by the engine's real compatibility check. |
| `src/pages/MatchPage.tsx` | A live match, hot-seat or vs computer (`?ai=<tier>&side=<colour>`). Reads rules from the query string, autosaves to a resume slot, and supplies the AI's undo decider. |
| `src/pages/AnalysisPage.tsx` | Free board: place pieces, pick the side to move, play under real legality with no result enforced. |
| `src/pages/LeaderboardsPage.tsx` | Sample standings, clearly labelled as placeholder data. |
| `src/pages/TutorialPage.tsx` | Tutorial shell and chapter navigation; chapter 1 is written, 2–8 are titled placeholders. |
| `src/pages/matchParams.ts` | Rule settings to and from the query string, so a refresh keeps the same rule set. |
| `src/pages/tutorial/chapters.ts` | Chapter table of contents with availability flags. |
| `src/pages/tutorial/ExampleBoard.tsx` | Scripted animated example board. Replays moves through the real engine, so a tutorial example cannot show an illegal move. |
| `src/pages/tutorial/Chapter1.tsx` | Chapter 1 content — movement and capture — with two working example boards. |

---

## Removed in this overhaul

`src/utils/gameLogic.ts`, `src/hooks/useGameStorage.ts`, `src/context/GameContext.tsx`,
and the old `src/components/{Board, Cell, Piece, Game, GameEndModal, GameInfo, GameLayout,
GameMenu, Home, MoveHistory, Navbar, PlayerBar, ThemeSelector, Button}` along with
`Home.css`, `GameMenu.css` and the three `public/home-*.svg` illustrations they used.
Their responsibilities moved into `src/game`, `src/hooks`, `src/themes` and the
component folders above.
