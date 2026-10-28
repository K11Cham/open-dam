# open-dam: Codebase Audit (27 October 2026)

This is the read-only audit that started the overhaul on branch `feat/overhaul`.
It describes the code **as it was** at tag `pre-overhaul-2026-10-27` (branch
`backup/pre-overhaul-2026-10-27`). Line numbers refer to that state. What has
been fixed since is tracked on the handover board and in `docs/HANDOVER.md`.

Evidence tags: **[verified]** = ran or saw it, **[code]** = confirmed by reading
code, **[inferred]** = reasoning, not proven.

## 1. Executive summary

**What it is.** A browser version of Dam, a Gambian board game played on a 5×5 to
9×9 grid. Pieces move forward or sideways only; captures are optional, but a
skipped capture can be "called" by the opponent.

**What the code implemented:** a pure rules engine (`src/game`); a negamax AI
with four tiers (`src/ai`); React hooks connecting them to the UI; three themes;
hot-seat and vs-AI play; an analysis board; one tutorial chapter; leaderboards
and ranked pages built on sample data. No backend; localStorage only.

**Maturity:** strong engine, unfinished and partly broken product layer, no
passing build.

**Top findings:**

1. **Production build failed**: `tsc -b` reported 338 errors, 331 from 15 dead
   legacy files restored by merge `fd75a4a`, 7 from uncommitted Home page work. [verified]
2. **In AI games the human could move the AI's pieces** during its thinking
   delay; the board never checked who controls which side. [verified]
3. **The tutorial's first example broke**: the lone piece was auto-crowned and
   the engine declared a win after one step. It was the only written lesson. [verified]
4. **Clock state was never persisted**: `EngineState.clock` was never updated;
   a resumed timed game restarted at full time; the summary showed start times. [code]
5. **The calling UI was fragile**: offender squares went stale after the
   offending piece moved; tapping an offender on the board could never fire. [code]

## 2. Issue register

| ID  | Finding                                                  | Category           | Severity | Confidence      | Evidence                                                      |
| --- | -------------------------------------------------------- | ------------------ | -------- | --------------- | ------------------------------------------------------------- |
| 1   | Build fails (338 type errors)                            | Engineering        | High     | Verified        | `tsc`; merge fd75a4a                                          |
| 2   | Human can move the AI's pieces                           | Correctness        | High     | Verified        | `useGameLogic.ts:183-214`, `BoardView.tsx:88-92`              |
| 3   | Tutorial example breaks; 7 of 8 chapters missing         | UX                 | High     | Verified        | `Chapter1.tsx:12-21`, `engine.ts:97-127`                      |
| 4   | Board unusable without a pointer                         | Accessibility      | High     | Code            | `BoardView.tsx:139-156`                                       |
| 5   | Stale offender squares; tap-to-call unreachable          | Correctness        | Medium   | Code            | `engine.ts:175-185`, `CallPicker.tsx:29`, `BoardView.tsx:155` |
| 6   | Clock not persisted / rolled back; summary wrong         | Correctness        | Medium   | Code            | `engine.ts:56-63`, `GameOverModal.tsx:271-275`                |
| 7   | Rematch after resume returns to mid-game                 | Correctness        | Medium   | Code            | `useGameLogic.ts:60-65, 344-353`                              |
| 8   | No "no legal moves" outcome                              | Rules              | Medium   | Code / inferred | `engine.ts:125-149`                                           |
| 9   | Phone view hides the top player bar                      | UI                 | Medium   | Verified        | measured at 375px                                             |
| 10  | Resign without confirmation                              | UX                 | Medium   | Code            | `PlayerBar.tsx:127-136`                                       |
| 11  | Resume matches rules only; no Continue; silent overwrite | UX / data          | Medium   | Code            | `MatchPage.tsx:34-40`, `NewGamePage.tsx:35-42`                |
| 12  | Home quick-play: dead buttons, hardcoded colours         | UI                 | Medium   | Verified        | `HomePage.tsx:103-132`                                        |
| 13  | ~3,000 lines of dead code; docs out of date              | Maintainability    | Medium   | Verified        | —                                                             |
| 14  | Reduced motion ignored by JS animation                   | Accessibility      | Medium   | Code            | no `MotionConfig`                                             |
| 15  | AI search blocks the main thread                         | Performance        | Low      | Code            | `useAIOpponent.ts`                                            |
| 16  | Hot-seat wording wrong                                   | UX                 | Low      | Code            | `GameScreen.tsx:173-193`, `OpponentPicker.tsx:58`             |
| 17  | Modal accessibility; draw text hardcoded                 | Accessibility / UX | Low      | Code            | `GameOverModal.tsx`                                           |
| 18  | 41 lint errors; app TS not strict                        | Engineering        | Low      | Verified        | eslint                                                        |
| 19  | AI harness assertions trivially true                     | Tests              | Low      | Verified        | `ai-smoke.ts:42, 60`                                          |
| 20  | Unrelated `test-tool.ps1` in repo                        | Hygiene            | Info     | Verified        | repo root                                                     |

Found during the overhaul (not in the original audit):

| ID  | Finding                                                                                                          | Severity | Evidence                       |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| 21  | AI scored finished games from the root player's view, so Master avoided winning captures; Master drew Novice 6/6 | High     | `ai/search.ts` `terminalScore` |
| 22  | A call that ended the game was read by the search as "stuck = lost"                                              | High     | `ai/search.ts` `negamax`       |
| 23  | Root noise fed into alpha-beta, corrupting other moves' scores; Club lost to Novice 1–5                          | High     | `ai/search.ts` `chooseAction`  |
| 24  | Atelier draws black and white pieces but the UI called them Red and Blue                                         | Medium   | `themes/atelier`               |

## 3. What was run

| Command                             | Result                                                               |
| ----------------------------------- | -------------------------------------------------------------------- |
| `tsc -p tsconfig.app.json --noEmit` | 338 errors                                                           |
| Engine check harness                | 75 passed, 0 failed                                                  |
| AI smoke harness                    | "OK", but Master drew Novice 4/4 and the assertions passed trivially |
| `eslint .`                          | 41 errors, 12 warnings                                               |
| `vite build`                        | 497 KB JS (160 KB gzip), one chunk                                   |
| Browser                             | Findings 2, 3 and 9 reproduced                                       |

## 4. Final assessment (as of the audit)

- **Genuinely worked:** a complete, correct rules engine and a capable AI
  playable locally, three themes, an analysis board, settings in the URL.
- **Looked complete but was not:** the tutorial, timed games, the calling UI,
  resume/rematch, AI-mode input rules, the Home "Challenge" cards, ranked pages.
- **Biggest technical risks:** build broken by dead code, two copies of clock
  state, board input unaware of side ownership, no tests above the engine.
- **First steps:** delete the dead files (unblocks the build), then restrict
  board input to the human's sides.
