# AI Codebase Guide: open-dam

**Generated:** 2026-10-10  
**Purpose:** Comprehensive technical reference for AI coding agents  
**Status:** Complete initial analysis

---

## Document Purpose and Maintenance Rules

### Intended Audience

This document is written for AI coding agents working on the open-dam codebase. It provides:
- Complete file inventory and architecture overview
- Cross-file dependency mappings
- Core workflow traces
- Implementation details for common modification scenarios

### How to Use This Guide

**Before starting work:**
1. Read the relevant sections for your task area
2. Use the file inventory to locate implementation files
3. Follow workflow traces to understand data flow
4. Verify current implementation details before making changes

**This guide is NOT:**
- A substitute for reading the actual source code
- Always perfectly synchronized with the latest changes
- A replacement for running tests to verify behavior

### Maintenance Requirements

Future agents MUST:
- **Update** affected sections when making changes that alter:
  - File responsibilities or exports
  - Architecture or data flow
  - Dependencies between modules
  - Configuration or build processes
- **Verify** claims in this guide against current implementation before relying on them
- **Add** new files to the inventory when created
- **Remove** or reclassify deleted files
- **Record** significant discoveries or corrections in the change log
- **Preserve** verified information that remains accurate
- **Never** include secrets, credentials, tokens, or sensitive data

### Evidence Standards

- All claims are grounded in inspected source files
- File paths are repository-relative
- Line numbers are provided for context but may change
- Uncertainties are marked explicitly
- Conflicts between documentation and implementation are noted

---

## Project Overview

### What This Project Does

**open-dam** is a digital implementation of Dam, a traditional Gambian board game. The project provides:
- A playable web-based game with multiple board sizes (5x5 to 9x9)
- Four AI difficulty tiers (Novice, Club, Expert, Master)
- Customizable rule variations (promotion policies, calling rules, draw conditions)
- Three complete visual themes (Neobrutalist, Atelier, Carnival)
- Tutorial system, analysis board, and move history
- Hot-seat local multiplayer and single-player vs AI

### Cultural Context

The game represents Gambian culture and was created by someone who lived in The Gambia for 8 years. The traditional game was played in sand with sticks and stones. This digital version preserves the cultural heritage while making it accessible globally.

### Main Technologies

**Runtime:**
- React 19.2.5 with TypeScript 6.0.2
- Vite 8 (build tool and dev server)
- React Router 7.15.1 (client-side routing)
- Framer Motion 12.40.0 (animations)

**Development:**
- TypeScript with strict mode
- ESLint 10 with flat config
- Tailwind CSS 4.3.0 (PostCSS-based, CSS-configured)
- React Compiler (babel-plugin-react-compiler)

**Architecture Philosophy:**
- Pure functional game engine (no React, no DOM, no I/O)
- Separation of rules engine from UI layer
- Theme-based visual system with swappable components
- Event-driven animation system

---

## Repository Structure

```
open-dam/
├── .enginecheck/          # Compiled engine tests (generated, gitignored)
├── dist/                  # Production build output (generated, gitignored)
├── node_modules/          # Dependencies (generated, gitignored)
├── public/
│   └── favicon.svg       # Site icon
├── scripts/              # Standalone test harnesses
│   ├── ai-smoke.ts       # AI self-play verification
│   └── engine-check.ts   # Pure engine rule tests
├── src/
│   ├── ai/              # Pure AI opponent (no React)
│   ├── components/       # React components
│   ├── context/         # React contexts
│   ├── data/            # Mock/placeholder data
│   ├── game/            # Pure rules engine (no React)
│   ├── hooks/           # React hooks (engine adapters)
│   ├── pages/           # Route components
│   ├── services/        # External interfaces
│   ├── styles/          # Global CSS
│   ├── themes/          # Visual language system
│   ├── App.tsx          # Router configuration
│   ├── index.css        # Base styles, font imports
│   └── main.tsx         # React entry point
├── codebase.md          # Existing file manifest
├── eslint.config.js     # ESLint flat config
├── index.html           # Vite entry HTML
├── LICENSE              # Project license
├── package.json         # Dependencies and scripts
├── postcss.config.js    # PostCSS configuration
├── README.md            # Project readme
├── tsconfig.json        # TypeScript root config
├── tsconfig.app.json    # TS config for src/
├── tsconfig.node.json   # TS config for build tools
├── tsconfig.check.json  # TS config for CommonJS test harnesses
└── vite.config.ts       # Vite build configuration
```

### Generated Files (Excluded from Analysis)

**Build artifacts:**
- `dist/` - Production build output
- `.enginecheck/` - Compiled test harnesses
- `node_modules/.vite/` - Vite dependency cache
- `node_modules/.tmp/` - TypeScript build info

**Dependencies:**
- `node_modules/` - All npm packages
- `package-lock.json` - Locked dependency tree

**Reason for exclusion:** Generated files are derived from source and recreated on build. Analyzing them provides no architectural insight.

---

## Architecture Overview

### High-Level Design

The architecture follows a strict layering principle:

```
┌─────────────────────────────────────────────────┐
│  Pages (Routing & Page Layout)                  │
│  /pages/*                                       │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│  Components (UI Primitives & Layout)            │
│  /components/*                                  │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│  Hooks (React Adapters)                         │
│  /hooks/* - Bridge between React and engine     │
└─────┬─────────────────────────┬─────────────────┘
      │                         │
┌─────▼────────────┐     ┌──────▼──────────────────┐
│  Themes          │     │  Pure Engine            │
│  /themes/*       │     │  /game/* (no React)     │
│  Visual language │     │  State machine          │
└──────────────────┘     └─────────┬───────────────┘
                                   │
                         ┌─────────▼───────────────┐
                         │  AI Opponent            │
                         │  /ai/* (no React)       │
                         │  Search & evaluation    │
                         └─────────────────────────┘
```

### Key Architectural Boundaries

**1. Pure Engine (`src/game/`)**
- No React imports
- No DOM manipulation
- No localStorage or external I/O
- Pure functions: `(state, intent) => { state, events }`
- Can be tested in Node.js without a browser

**2. Pure AI (`src/ai/`)**
- No React imports
- Depends only on `src/game/`
- Search runs synchronously on main thread (Web Worker planned)
- Four difficulty tiers with different evaluation profiles

**3. React Adapters (`src/hooks/`)**
- Bridge between React and pure engine
- Manage selection, timeline, clock, animations, offers
- No game logic—only sequencing of engine calls

**4. Theme System (`src/themes/`)**
- Complete visual languages (tokens + components)
- Three themes: Neobrutalist, Atelier, Carnival
- Each theme provides: piece renderers, board frame, cell decorations, end sequence

---

## Entry Points and Execution Lifecycle

### Application Startup

**1. Browser loads `index.html`** ([index.html](../index.html))
   - Standard Vite entry document
   - Single div: `<div id="root"></div>`
   - Script import: `/src/main.tsx`

**2. React mounts** ([src/main.tsx](../src/main.tsx:6-10))
   ```typescript
   createRoot(document.getElementById('root')!).render(
     <StrictMode>
       <App />
     </StrictMode>
   )
   ```

**3. App initializes** ([src/App.tsx](../src/App.tsx:19-34))
   - Wraps everything in `<ThemeProvider>`
   - Sets up `<BrowserRouter>` with routes:
     - `/` → HomePage
     - `/play` → NewGamePage  
     - `/match` → MatchPage
     - `/analysis` → AnalysisPage
     - `/leaderboards` → LeaderboardsPage
     - `/learn` → TutorialPage
     - `*` → Redirect to `/`

**4. ThemeProvider loads** ([src/context/ThemeContext.tsx](../src/context/ThemeContext.tsx))
   - Reads theme preference from localStorage
   - Applies CSS custom properties to `<html>`
   - Sets `data-theme` attribute
   - Detects coarse pointers (touch devices)

### Match Execution Flow

**When user navigates to `/match`:**

1. **MatchPage parses query string** ([src/pages/MatchPage.tsx](../src/pages/MatchPage.tsx))
   - Reads rule settings from URL: `?size=5&tc=3%2B0&promo=promote-and-continue`
   - Determines AI opponent and side from query params
   - Checks localStorage for resume slot

2. **useGameLogic initializes** ([src/hooks/useGameLogic.ts](../src/hooks/useGameLogic.ts:55-95))
   - Calls `createInitialState(settings)` from game engine
   - Sets up timeline (400-state limit)
   - Initializes clock if time control specified
   - Connects to animation and offer systems

3. **Game loop begins:**
   - User clicks piece → `controller.selectSquare(coord)`
   - User clicks destination → `controller.move(from, to)`
   - Controller calls `applyMove(state, from, to)` from engine
   - Engine returns `{ state, events }` or error
   - If successful: animations ingest events, clock updates, state advances
   - If AI's turn: `useAIOpponent` triggers search after thinking delay

4. **AI makes move:**
   - `chooseAction(state, options)` runs negamax search
   - Returns `{ action, score, nodes, depthReached }`
   - Action applied via controller: `controller.move(from, to)`
   - Loop continues

---

## File-by-File Reference

### Root Configuration Files

#### `package.json`
**Purpose:** Dependencies, scripts, and project metadata  
**Key Scripts:**
- `dev` - Starts Vite dev server
- `build` - Type-checks and builds for production
- `lint` - Runs ESLint
- `preview` - Previews production build
- `check:engine` - Compiles and runs pure engine tests
- `check:ai` - Runs AI self-play verification

**Important Dependencies:**
- React 19.2.5 with new compiler
- Vite 8 (latest)
- Tailwind CSS 4.3.0 (PostCSS-based)
- TypeScript 6.0.2
- Framer Motion 12.40.0
- React Router 7.15.1

#### `vite.config.ts`
**Purpose:** Vite build configuration  
**Plugins:**
- `@vitejs/plugin-react` - React Fast Refresh
- `@rolldown/plugin-babel` with React Compiler preset

**Note:** React Compiler (babel-plugin-react-compiler 1.0.0) is enabled, which automatically memoizes components.

#### `tsconfig.json`
**Purpose:** Root TypeScript configuration  
**Structure:** Project references pattern
- References `tsconfig.app.json` (source code)
- References `tsconfig.node.json` (build tools)

#### `tsconfig.app.json`
**Purpose:** TypeScript configuration for `src/`  
**Key Settings:**
- `target: es2023`
- `module: esnext`
- `moduleResolution: bundler`
- `jsx: react-jsx` (new JSX transform)
- `noEmit: true` (Vite handles transpilation)
- Strict linting: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`

#### `tsconfig.check.json`
**Purpose:** Standalone CommonJS config for test harnesses  
**Why:** The engine check scripts run in Node.js without a bundler
- `module: commonjs`
- `outDir: .enginecheck`
- Includes: `src/game/**/*.ts`, `src/ai/**/*.ts`, `scripts/*.ts`

#### `eslint.config.js`
**Purpose:** Flat ESLint configuration  
**Extends:**
- `@eslint/js` recommended
- TypeScript ESLint recommended
- React Hooks rules
- React Refresh plugin for Vite HMR

#### `postcss.config.js`
**Purpose:** PostCSS processing chain  
**Plugins:**
- `@tailwindcss/postcss` - Tailwind CSS 4 (CSS-configured)
- `autoprefixer` - Vendor prefixes

---

### `src/game/` — Pure Rules Engine

**Architecture:** This directory contains the complete game logic as pure functions. No file imports React, uses the DOM, or touches localStorage. The engine can run in Node.js for testing.

#### `src/game/types.ts`
**Purpose:** Core type vocabulary for the entire engine  
**Exports:**
- `PlayerId` = 'player1' | 'player2'
- `PieceData` - piece with player, isKing, id
- `Board` - 2D array of pieces
- `Coord` - { row, col }
- `BoardType` - 'yinyang' | 'even'
- `BoardSize` - 5 | 6 | 7 | 8 | 9
- `PromotionPolicy` - Four variants for crowning behavior
- `CallSettings` - scope and abandoned-chain callability
- `DrawSettings` - threefold repetition and no-capture ply limit
- `TimeControl` - initialMs, incrementMs, label
- `RuleSettings` - Complete match configuration
- `MoveRecord` - Notation entry in move list
- `GameEvent` - Union type for animations (move, capture, promotion, etc.)
- `GameStatus` - playing | win | draw
- `EngineState` - Complete state machine state
- `EngineResult` - { state, events, error? }

**Important Details:**
- `PromotionPolicy` includes 'match-opponent' which resolves to opponent's choice
- `GameEvent` union drives the animation system
- `EngineState` includes position counts for threefold repetition
- Clock state is optional (null for untimed games)

#### `src/game/board.ts`
**Purpose:** Board construction, piece counting, position serialization  
**Key Functions:**
- `makeInitialBoard(size, type)` - Creates yin/yang or even starting position
- `makeYinYangBoard()` - Odd boards: center empty, armies interlock
- `makeEvenBoard()` - Even boards: two-row gap in middle
- `cloneBoard()` - Deep copy for engine state transitions
- `countPieces(board, player)` - Material counting
- `piecesOf(board, player)` - All pieces with coordinates
- `serializePosition(board, toMove)` - String key for repetition detection
- `forwardDir(player)` - Returns -1 for player1, +1 for player2
- `promotionRow(player, size)` - Row where pieces crown

**Direction Convention:**
- player1 sits at BOTTOM (high row indices), advances toward row 0
- player2 sits at TOP (row 0), advances toward row size-1
- Notation ranks count UP from player1's back row

#### `src/game/moves.ts`
**Purpose:** Move and capture generation, legality classification  
**Key Functions:**
- `getCaptures(board, player)` - All capture options for player
- `getSimpleMoves(board, player)` - All non-capturing moves
- `directionsFor(piece)` - Legal directions (forward/left/right for normal, all orthogonal for king)
- `classifyMove(board, player, from, to)` - Returns 'slide' | 'capture' | 'illegal'
- `hasAnyLegalMove(board, player)` - Stalemate detection

**Movement Rules:**
- Normal pieces: forward, left, right (never backward or diagonal)
- Kings: all four orthogonal directions, slide until blocked
- Captures: jump over adjacent enemy onto empty square beyond
- Kings can land anywhere beyond captured piece

#### `src/game/notation.ts`
**Purpose:** Square naming, move formatting, display grouping  
**Key Functions:**
- `coordToNotation(row, col, size)` - e.g., (4,2,5) → "c1"
- `formatMove(parts)` - Produces notation: "c3", "c3xc5", "c3xc5xe5=K", "c3-c4 ?!"
- `formatCall(targets, size)` - "!d4" or "!d4+e5" for multi-target
- `toMoveRows(moves)` - Groups plies into numbered pairs for display

**Notation Grammar:**
- `c2-c3` - quiet move
- `c2xc4` - single capture
- `c2xc4xe4` - chain capture
- `c2xc4=K` - crowning
- `c2-c3 ?!` - capture was available (callable)
- `!d4` - call removing piece at d4
- `½-½` - agreed draw

#### `src/game/engine.ts` (722 lines)
**Purpose:** State machine—the heart of the rules engine  
**Main Functions:**
- `createInitialState(settings)` - New match state
- `createAnalysisState(settings)` - Empty board for analysis mode
- `applyMove(state, from, to)` - Execute a move
- `applyCall(state, targetPieceId?)` - Execute a call
- `declineChain(state)` - Stop multi-capture chain
- `resign(state, player)` - Player resigns
- `agreeDraw(state)` - Mutual draw agreement
- `flagTimeout(state, player)` - Time forfeit
- `destinationsFor(state, from)` - UI helper: legal destinations
- `canCall(state)` - Whether current player can call

**Internal Logic:**
- `applyAutoKing()` - Player reduced to 1 piece gets it crowned
- `reachedPromotionRow()` - Check if piece should promote
- `evaluateStatus()` - Win/draw/threefold/no-captures detection
- `endTurn()` - Hand turn over, compute offenders, update counters
- `offendersFromSkippedCapture()` - Which pieces are callable

**Special Rules Handled:**
- Yin/yang opening: player1's first move may place any piece in center
- Three promotion policies (immediate, after-chain, end-turn)
- Auto-king when down to one piece (overrides deferred promotion)
- Abandoned chain callability
- Threefold repetition and 50-ply no-capture rule
- One-piece-each stalemate

#### `src/game/clock.ts`
**Purpose:** Pure clock arithmetic (React layer owns the interval)  
**Key Functions:**
- `createClock(control)` - Initialize clock state
- `tick(clock, now)` - Charge running player for elapsed time
- `startFor(clock, player, now)` - Start player's clock
- `pause(clock, now)` - Stop both clocks
- `completeMove(clock, mover, control, now)` - Settle, increment, hand over
- `flaggedPlayer(clock)` - Who ran out of time
- `formatClock(ms)` - Display string (shows tenths under 20s)

**Design:** One clock runs at a time. All state changes apply `tick()` first, then switch who is running.

#### `src/game/settings.ts`
**Purpose:** Default rules, time controls, compatibility checks  
**Exports:**
- `DEFAULT_SETTINGS` - 5x5 yin/yang, promote-and-continue, choose-one call scope, draw rules enabled
- `TIME_CONTROLS` - Five presets (1+0 through 30+10)
- `resolvePromotionPolicy()` - Handles 'match-opponent' resolution
- `settingsAreCompatible()` - Matchmaking compatibility check
- `filterCompatibleSeeks()` - Filter open seeks by compatibility
- `RULES_SUMMARY` - Text for settings panel

**Default Rationale:**
- `call.scope: 'choose-one'` - Taking every offender is too punishing on small boards
- `call.abandonedChainCallable: true` - Prevents optional-capture exploitation
- Threefold and 50-ply rules kept alongside 1v1-stalemate to avoid non-termination

#### `src/game/index.ts`
**Purpose:** Barrel export for entire game engine

---

### `src/ai/` — Pure AI Opponent

**Architecture:** Pure functions, no React. Depends only on `src/game/`. Runs synchronously on main thread with time budgets.

#### `src/ai/evaluate.ts`
**Purpose:** Position evaluation tailored to dam rules  
**Key Functions:**
- `evaluate(state, perspective, profile)` - Returns centipiece score
- `kingValue(boardSize)` - King worth scales with board size
- `measure(state, player)` - Collects side metrics

**Evaluation Terms:**
- **Material** - Pieces and kings (kings scale with board size)
- **Mobility** - Number of legal moves
- **Advancement** - Progress toward promotion row (scaled by promotion policy)
- **Back row** - Pieces blocking opponent's promotion row
- **Exposure** - Cost of being callable (scope-aware)
- **Threats** - Captures available
- **King activity** - Open lines for kings
- **Endgame damping** - Recognizes draws near auto-king threshold
- **Draw clock awareness** - Steers away from repetition when ahead

**EvalProfile:** Weight multipliers allow different tiers to see different things

#### `src/ai/difficulty.ts`
**Purpose:** Four difficulty tiers with distinct personalities  
**Exports:**
- `DIFFICULTIES` - Novice, Club, Expert, Master
- Each tier specifies: depth, time budget, evaluation profile, noise, blunder chance, undo tolerance, draw acceptance

**Tier Characteristics:**
- **Novice:** Material-only, 1 ply, 32% blunder rate, accepts any undo
- **Club:** Mobility/tempo/threats, 3 plies, blind to endgame damping
- **Expert:** Full eval, 5 plies, endgame-aware
- **Master:** Sharpened weights, 8 plies, iterative deepening, no deliberate error

#### `src/ai/search.ts`
**Purpose:** Negamax with alpha-beta, quiescence, iterative deepening  
**Key Functions:**
- `chooseAction(state, options)` - Main entry point
- `generateActions(state)` - All legal actions (moves, end-chain, call)
- `applyAction(state, action)` - Apply action via engine
- `bestCallTarget(state)` - Greedy call resolution (most valuable offender)

**Special Handling:**
- Non-alternating turns: chain legs keep same player on move
- Greedy call resolution: calling is free material, no need to branch
- Quiescence search: extends captures past horizon
- Move ordering: captures first, then forward progress
- Blunder roll: random move with configured probability

#### `src/ai/opponent.ts`
**Purpose:** Non-move decisions (undo, draw offers)  
**Key Functions:**
- `decideUndoRequest(context)` - Evaluates swing vs tolerance
- `decideDrawOffer(difficulty, aiSide, state)` - Accepts if position is level or worse
- `thinkingDelay(difficulty, random)` - Simulated thinking time

**Undo Decision:** AI evaluates current position vs undo target. If swing > tolerance, decline.

#### `src/ai/index.ts`
**Purpose:** Barrel export

---

### `src/hooks/` — React Adapters

**Architecture:** Bridge between React and pure engine. These hooks own selection, timeline, clock ticking, animation queue, but contain NO game logic.

#### `src/hooks/useGameLogic.ts`
**Purpose:** Main orchestrator for match/analysis gameplay  
**Returns:** `GameController` - object with state and action methods  
**Responsibilities:**
- Selection state
- Timeline (400-state undo buffer)
- Review mode (navigating move history)
- Committing engine results
- Wiring clock, animations, offers together

**Key Methods on Controller:**
- `move(from, to)` - Apply move
- `call(pieceId?)` - Execute call
- `endChain()` - Decline chain continuation
- `resign(player)`, `offerDraw()`, `acceptOffer()`, `declineOffer()`
- `selectSquare(coord)` - UI selection
- `goToMove(ply)` - Timeline navigation

**Timeline Cap:** 400 states to prevent unbounded memory growth

#### `src/hooks/useAIOpponent.ts`
**Purpose:** Drives AI side in match  
**Behavior:**
- Triggers search when AI's turn arrives
- Applies thinking delay before action
- Handles chain continuations automatically
- Answers draw offers based on evaluation

**Note:** Search runs synchronously on main thread. Time budgets prevent UI lock (worst case ~1.5s for Master).

#### `src/hooks/useBoardAnimations.ts`
**Purpose:** Converts engine events into short-lived animation queue  
**Tracks:**
- Recently crowned pieces (for visual treatment)
- Last move (for highlighting)
- Animation queue with timestamps

#### `src/hooks/useGameClock.ts`
**Purpose:** Live ticking clock with React interval  
**Guarantees:** Only one side runs at a time  
**Responsibilities:**
- Start/stop/pause clock
- Tick every 100ms when running
- Report flag when time expires

#### `src/hooks/useMatchOffers.ts`
**Purpose:** Undo and draw offer flow  
**State:** Pending offer (undo or draw) with requester

#### `src/hooks/usePointerDrag.ts`
**Purpose:** Unified pointer drag for mouse/touch/pen  
**Features:**
- Tap vs drag threshold
- Replaces old HTML5 drag-and-drop

---

### `src/themes/` — Visual Language System

**Architecture:** Each theme is a complete visual language with tokens, component implementations, and scoped CSS.

#### `src/themes/types.ts`
**Purpose:** Theme contract  
**Theme Interface:**
- `tokens` - CSS custom property map
- `Piece` - React component for piece rendering
- `CellDecor` - Optional decoration per cell
- `BoardFrame` - Border/background component
- `EndSequence` - Game-over animation
- `motion` - Animation configuration
- `boardStyle` - 'solid' | 'separated'
- `boardGap` - Spacing between cells

#### `src/themes/registry.ts`
**Purpose:** Theme catalog and default  
**Exports:**
- `THEMES` - neobrutalist, atelier, carnival
- `THEME_KEYS`, `DEFAULT_THEME`
- `isThemeKey()` type guard

#### Theme Implementations

Each theme has three files:

**`[theme]/theme.ts`** - Token map and motion config
**`[theme]/parts.tsx`** - React components (Piece, BoardFrame, EndSequence)
**`[theme]/theme.css`** - Scoped CSS with `[data-theme='...']]` selectors

**Neobrutalist:**
- Outlined disc pieces with star crown
- Cell dots
- Flash-and-jolt end sequence
- Bold, high-contrast

**Atelier:**
- Minimalist: solid disc vs open ring
- Hairline board and decorations
- Erase-and-rule end sequence
- Ledger-style side panel

**Carnival:**
- SVG character pieces with faces
- Sparkle decorations
- Bunting board frame
- Confetti end sequence
- Separated rounded tiles

#### `src/context/ThemeContext.tsx`
**Purpose:** Apply active theme to DOM  
**Responsibilities:**
- Set CSS custom properties on `<html>`
- Set `data-theme` attribute
- Detect coarse pointers (touch devices)
- Persist theme choice to localStorage

---

### `src/components/` — React Components

**Architecture:** Shared structure that styles itself from theme tokens. No hardcoded colors.

#### `src/components/ui/` — Primitives

**Button.tsx** - The only button component  
**Panel.tsx** - Themed surface container  
**Segmented.tsx** - Radio group option row  
**Switch.tsx** - Accessible toggle  

#### `src/components/layout/` — App Chrome

**AppShell.tsx** - Page frame: background, navbar, content slot, footer  
**Navbar.tsx** - Top bar with wordmark, links, theme menu  
**SideNav.tsx** - Slide-out mobile navigation  
**ThemeMenu.tsx** - Theme switcher  
**navItems.ts** - Navigation destinations (single source of truth)  

#### `src/components/board/` — Game Board

**BoardView.tsx** - Board geometry, hit-testing, piece layer, drag ghost  
**Features:**
- Optional board flipping for blue-side human
- Delegates piece rendering to active theme
- Travelling piece animations
- Destination highlighting

#### `src/components/game/` — Match Screen

**GameScreen.tsx** - Match layout: player bars, board, call picker, side panel  
**PlayerBar.tsx** - Per-side identity, clock, action buttons  
**GameClockView.tsx** - Clock display with low-time treatment  
**MoveHistory.tsx** - Notation list with timeline navigation  
**CallPicker.tsx** - Target selection for choose-one call scope  
**GameOverModal.tsx** - Result display  

#### `src/components/settings/` — Pre-Game

**OpponentPicker.tsx** - Hot seat or AI tier selection  
**RuleSettingsPanel.tsx** - Board size, time control, promotion policy, call rules, draw rules  

---

### `src/pages/` — Routes

#### `src/pages/HomePage.tsx`
**Route:** `/`  
**Purpose:** Lobby-style landing page  
**Features:**
- Hero with Play button
- Quick links
- Ranked sections (mock data)

#### `src/pages/NewGamePage.tsx`
**Route:** `/play`  
**Purpose:** Game setup screen  
**Features:**
- Rule configuration
- Opponent selection
- Matchmaking preview (compatibility check)
- Starts match by navigating to `/match` with query string

#### `src/pages/MatchPage.tsx`
**Route:** `/match`  
**Purpose:** Live match (hot-seat or vs AI)  
**Query Params:**
- `size`, `type`, `promo`, `call`, `acall`, `draw`, `tc`
- `ai` (tier), `side` (color)

**Features:**
- Reads settings from query string
- Checks localStorage for resume slot
- Autosaves every N moves
- Supplies AI undo decider

#### `src/pages/AnalysisPage.tsx`
**Route:** `/analysis`  
**Purpose:** Free board for position setup  
**Features:**
- Place pieces arbitrarily
- Choose side to move
- Play under real legality
- No result enforced

#### `src/pages/LeaderboardsPage.tsx`
**Route:** `/leaderboards`  
**Purpose:** Sample standings  
**Data:** Mock/placeholder (clearly labeled)

#### `src/pages/TutorialPage.tsx`
**Route:** `/learn`  
**Purpose:** Tutorial shell  
**Status:** Chapter 1 complete, chapters 2-8 are placeholder stubs

#### `src/pages/matchParams.ts`
**Purpose:** Rule settings serialization to/from query string  

#### `src/pages/tutorial/`

**chapters.ts** - Table of contents  
**Chapter1.tsx** - Movement and capture tutorial  
**ExampleBoard.tsx** - Scripted animated example board (uses real engine)  

---

### `src/data/` — Mock Data

**aiOpponents.ts** - Pairs AI tiers with mock elo bands  
**leaderboards.ts** - Sample standings tables  
**ranked.ts** - Mock ranked pools by mode/size/clock  

**Note:** No actual matchmaking or elo calculation exists. These files scaffold future features.

---

### `src/services/` — External Interfaces

#### `src/services/storage.ts`
**Purpose:** Namespaced localStorage wrapper  
**API:** `get(key)`, `set(key, value)`, `remove(key)`  
**Kept as seam for future backend**

---

### `src/styles/` — Global CSS

**index.css** - Font imports, Tailwind import, base element styles (no colors)  
**app.css** - Shared theme-agnostic layout for all `.dam-*` classes. Reads only `--dam-*` tokens. Includes reduced-motion override.

---

### `scripts/` — Test Harnesses

#### `scripts/engine-check.ts`
**Purpose:** Pure engine rule tests (75 assertions)  
**Run:** `npm run check:engine`  
**Coverage:**
- Board setup (yin/yang, even)
- Movement (normal pieces, kings)
- Captures (single, chain, king captures)
- All three promotion policies
- Auto-king
- Calling (both scopes)
- Abandoned chains
- End conditions (no pieces, 1v1 stalemate, threefold, 50-ply)
- Draw counters
- Yin/yang opening legality
- Matchmaking compatibility

**Execution:** Compiles to CommonJS in `.enginecheck/`, runs in Node.js (no test runner)

#### `scripts/ai-smoke.ts`
**Purpose:** AI self-play verification  
**Run:** `npm run check:ai`  
**Tests:**
- Tier-vs-tier games
- Every chosen action applies without error
- Stronger tier never outscored by weaker
- Time budgets respected
- Undo policy followed

---

## Core Workflows and Data Flows

### Workflow 1: User Makes a Move

```
1. User clicks piece at (2,3)
   ├→ GameScreen calls controller.selectSquare({row:2, col:3})
   └→ useGameLogic sets selected state

2. useGameLogic computes destinations
   ├→ Calls destinationsFor(state, {row:2, col:3}) from engine
   └→ Returns {slides: [...], captures: [...]}

3. BoardView highlights legal destinations

4. User clicks destination at (2,5)
   ├→ GameScreen calls controller.move({row:2,col:3}, {row:2,col:5})
   └→ useGameLogic calls applyMove(state, from, to)

5. Engine processes move
   ├→ classifyMove() determines slide/capture/illegal
   ├→ If capture: checks for chain continuation
   ├→ Applies promotion if reached far row
   ├→ Runs auto-king check
   ├→ Evaluates end conditions
   └→ Returns {state: newState, events: [...]}

6. Controller commits result
   ├→ setState(newState)
   ├→ Appends to timeline
   ├→ animations.ingest(events)
   ├→ If turn changed: clock.handOver(previousPlayer)
   └→ If AI's turn: useAIOpponent triggers

7. Animations play
   ├→ useBoardAnimations processes event queue
   ├→ BoardView renders travelling pieces
   └→ Theme's EndSequence plays if game ended
```

### Workflow 2: AI Makes a Move

```
1. Turn changes to AI side
   └→ useAIOpponent effect triggers

2. Thinking delay
   └→ setTimeout(thinkingDelay(difficulty))

3. Search executes
   ├→ chooseAction(state, options)
   ├→ Negamax with alpha-beta
   ├→ Iterative deepening (Master tier)
   ├→ Quiescence search for captures
   ├→ Move ordering for pruning efficiency
   └→ Blunder roll (if configured)

4. Action selected
   └→ {action, score, nodes, depthReached}

5. Action applied via controller
   ├→ If 'call': controller.call(pieceId)
   ├→ If 'end-chain': controller.endChain()
   └→ If 'move': controller.move(from, to)

6. Engine processes (same as user move)

7. If chain continues:
   └→ AI still on move, effect triggers again
```

### Workflow 3: Page Load → Match Start

```
1. Browser navigates to /match?size=5&tc=3%2B0&ai=expert&side=player2

2. MatchPage component mounts
   ├→ useSearchParams() extracts query
   └→ parseMatchParams() converts to RuleSettings

3. Check for resume slot
   ├→ storage.get('match-resume')
   └→ If found and settings match: use saved state

4. useGameLogic initializes
   ├→ createInitialState(settings) or resume state
   ├→ Sets up timeline [initialState]
   ├→ Creates clock if timeControl present
   └→ Returns controller

5. useAIOpponent initializes
   ├→ Watches controller.state
   └→ Waits for AI's turn

6. GameScreen renders
   ├→ PlayerBar (x2)
   ├→ BoardView with theme
   ├→ MoveHistory
   └→ CallPicker (if applicable)

7. Clock starts on first move
   └→ useGameClock begins ticking
```

### Workflow 4: Undo Request

```
1. User clicks Undo button
   └→ controller.requestUndo(requester)

2. useMatchOffers checks if undo available
   ├→ canUndoFor(timeline, requester, currentState)
   └→ Must have ≥2 states in timeline

3. If AI opponent:
   ├→ Calls onUndoRequest(requester) hook
   ├→ decideUndoRequest() evaluates swing
   │  ├→ eval(current) - eval(target)
   │  └→ Compare to difficulty.undo.maxSwing
   └→ Returns 'accept' | 'decline'

4. If accepted:
   ├→ rollbackTo(requester)
   ├→ Finds last state before requester's move
   ├→ setState(target)
   ├→ Clears review mode
   └→ Resets selection

5. Offer cleared
   └→ setOffer(null)
```

### Workflow 5: Theme Switch

```
1. User clicks theme in ThemeMenu
   └→ setActiveTheme(newKey)

2. ThemeContext updates
   ├→ Loads theme from THEMES[newKey]
   ├→ Applies tokens to <html> style
   │  └→ For each token: html.style.setProperty(name, value)
   ├→ Sets html.setAttribute('data-theme', newKey)
   └→ Persists to localStorage

3. CSS cascade updates
   ├→ [data-theme='...'] selectors activate
   └→ --dam-* custom properties change

4. Components re-render with new theme
   ├→ useTheme() provides new theme object
   ├→ BoardView uses theme.Piece, theme.BoardFrame
   └→ All .dam-* classes read new token values

5. Animations reconfigure
   └→ useBoardAnimations reads theme.motion
```

---

## Dependency and Integration Map

### Internal Module Dependencies

```
src/pages/*
  └→ src/components/*
       └→ src/hooks/*
            ├→ src/game/*
            ├→ src/ai/*
            └→ src/themes/*
                 └→ src/game/types (for piece rendering)

src/ai/*
  └→ src/game/*

src/hooks/useGameLogic
  ├→ src/game/engine
  ├→ src/hooks/useBoardAnimations
  ├→ src/hooks/useGameClock
  └→ src/hooks/useMatchOffers

src/hooks/useAIOpponent
  ├→ src/ai/search
  ├→ src/ai/opponent
  └→ src/hooks/useGameLogic (receives controller)
```

### Circular Dependencies

**None.** The architecture enforces unidirectional flow:
- game/ depends on nothing internal
- ai/ depends only on game/
- hooks/ depend on game/ and ai/, never the reverse
- components/ depend on hooks/, never the reverse
- pages/ depend on components/, never the reverse

### External Dependencies

**React & Ecosystem:**
- `react` 19.2.5 - Core library
- `react-dom` 19.2.5 - DOM rendering
- `react-router-dom` 7.15.1 - Client-side routing
- `framer-motion` 12.40.0 - Animation primitives
- `lucide-react` 1.16.0 - Icon components

**Build Tools:**
- `vite` 8.0.10 - Dev server and bundler
- `typescript` 6.0.2 - Type checker
- `@vitejs/plugin-react` 6.0.1 - React Fast Refresh
- `@rolldown/plugin-babel` 0.2.3 - Babel integration
- `babel-plugin-react-compiler` 1.0.0 - React Compiler

**Styling:**
- `tailwindcss` 4.3.0 - Utility CSS (PostCSS-based)
- `@tailwindcss/postcss` 4.3.0 - PostCSS plugin
- `autoprefixer` 10.5.0 - Vendor prefixes

**Linting:**
- `eslint` 10.2.1 - JavaScript linter
- `typescript-eslint` 8.58.2 - TypeScript rules
- `eslint-plugin-react-hooks` 7.1.1 - React Hooks rules
- `eslint-plugin-react-refresh` 0.5.2 - Vite HMR rules

### Integration Points

**localStorage:**
- Theme preference: `dam:theme`
- Match resume: `dam:match-resume`
- Accessed via `src/services/storage.ts` wrapper

**Browser APIs:**
- `performance.now()` - Clock timing
- `window.setTimeout()` - AI thinking delays
- `window.setInterval()` - Clock ticking
- Pointer events - Drag handling

**No external services:** All gameplay is local. No backend, no API calls.

---

## Configuration, Commands, and Development Workflow

### Verified Commands

**Development:**
```bash
npm run dev          # Start Vite dev server on http://localhost:5173
npm run build        # Type-check and build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

**Testing:**
```bash
npm run check:engine  # Compile and run pure engine tests
npm run check:ai      # Run AI self-play verification
```

**Testing Details:**
- `check:engine` compiles `src/game/**` and `scripts/engine-check.ts` to CommonJS, then runs in Node
- `check:ai` runs `check:engine` silently, then executes `scripts/ai-smoke.js`

### Configuration Files

**Build:**
- `vite.config.ts` - Vite configuration
- `tsconfig.*.json` - TypeScript configurations
- `postcss.config.js` - PostCSS chain

**Code Quality:**
- `eslint.config.js` - Flat ESLint config
- `.gitignore` - Git exclusions

**Environment:**
- No `.env` file required
- No environment variables consumed
- All configuration is in source or localStorage

### Development Prerequisites

**Required:**
- Node.js (version not pinned, but TypeScript 6.0.2 requires recent Node)
- npm (comes with Node)

**No additional setup needed.** Clone and run `npm install`.

---

## Testing and Verification

### Test Organization

This project does NOT use a test framework (Jest, Vitest, etc.). Instead:

**`scripts/engine-check.ts`** - 75 assertions covering:
- Board construction
- Move generation
- Capture logic
- Chain captures
- Promotion policies (all three)
- Auto-king rule
- Calling (both scopes)
- Abandoned chain callability
- End conditions
- Draw counters
- Yin/yang opening
- Matchmaking compatibility

**`scripts/ai-smoke.ts`** - AI verification:
- Self-play games (tier vs tier)
- Action application (no errors)
- Strength ordering (stronger tier never outscored)
- Time budget compliance
- Undo policy correctness

**Execution:** Both compile to CommonJS and run in Node.js without a test runner.

### Coverage Gaps

**Not covered by automated tests:**
- UI components
- React hooks
- Theme rendering
- Animation timing
- Touch/pointer interactions
- localStorage persistence
- URL query parsing
- Browser-specific behaviors

**Manual testing required for:**
- Visual appearance
- Animation smoothness
- Theme switching
- Responsive layout
- Accessibility (keyboard navigation, screen readers)

### Verification Requirements

Before claiming a feature works:
1. Run `npm run check:engine` and `npm run check:ai`
2. Manually test in browser (npm run dev)
3. Test all affected themes if changing board/piece rendering
4. Test both hot-seat and AI modes if changing game flow
5. Test board flip if changing coordinates or rendering

---

## Known Issues, Risks, and Uncertainties

### Verified Technical Debt

1. **AI runs on main thread**
   - Location: `src/hooks/useAIOpponent.ts:45`
   - Impact: UI can stutter during Master tier search (~1.5s worst case)
   - Future: Move to Web Worker
   - Comment in code: "A Web Worker would be the right long-term home for it"

2. **No actual online play**
   - Files: `src/data/*.ts`, `src/game/settings.ts:73`
   - Status: Data structures and compatibility checks exist
   - Missing: Networking, lobbies, matchmaking service
   - Hooks marked: "ONLINE HOOK" comments in code

3. **Mock leaderboards and elo**
   - Files: `src/data/leaderboards.ts`, `src/data/ranked.ts`, `src/data/aiOpponents.ts`
   - Status: Static mock data, no calculations
   - Clearly labeled in UI

4. **Incomplete tutorial**
   - File: `src/pages/TutorialPage.tsx`
   - Status: Chapter 1 complete, chapters 2-8 are titled stubs

### Unverified Behaviors

**Could not verify without running:**
- Actual time control behavior under time pressure
- Animation smoothness on low-end devices
- Touch interaction quality on mobile
- Screen reader accessibility
- Theme transitions on slow connections

### Potential Risks

1. **Timeline memory growth**
   - Capped at 400 states
   - On small boards: ~50KB per state
   - Max memory: ~20MB for timeline
   - Risk: Long games on large boards could approach cap

2. **localStorage limits**
   - Resume slot saves entire EngineState
   - No quota checking
   - Risk: Save could fail silently

3. **Search depth on large boards**
   - Master tier searches to depth 8
   - Branching factor grows with board size
   - 9x9 board could exceed time budget
   - Mitigation: Time budget enforced, returns best completed depth

---

## Change Impact Guide

### Modifying Game Rules

**Affected files:**
- `src/game/engine.ts` - Core rule logic
- `src/game/moves.ts` - Move generation
- `src/game/types.ts` - If adding new state
- `scripts/engine-check.ts` - Add test assertions

**Don't forget:**
- Update `RULES_SUMMARY` in `src/game/settings.ts`
- Update tutorial if rules change significantly
- Verify AI still makes sensible moves

**Tests to run:**
- `npm run check:engine` - Must pass
- `npm run check:ai` - Verify AI doesn't error
- Manual: Play full games in all modes

### Adding a New Theme

**Steps:**
1. Create directory: `src/themes/[name]/`
2. Add three files: `theme.ts`, `parts.tsx`, `theme.css`
3. Register in `src/themes/registry.ts`
4. Add `[data-theme='[name]']` selectors in CSS
5. Implement all required components

**Files to modify:**
- `src/themes/registry.ts` - Add to THEMES object
- `src/themes/types.ts` - If adding new component slots

**Verify:**
- All pieces render correctly
- Board frame appears
- Cell decorations work
- End sequence plays
- Theme switches without errors

### Modifying Board Rendering

**Affected files:**
- `src/components/board/BoardView.tsx`
- All `src/themes/*/parts.tsx` - Piece components
- `src/themes/*/theme.css` - Board structure

**Coordinate systems:**
- Engine: row 0 is top (player2 back row)
- Display: Can flip for blue-side human
- Animations: Must handle board flip

**Test:**
- Normal orientation
- Flipped orientation
- Drag and drop
- Click to move
- All three themes

### Adding AI Difficulty Tier

**Files to modify:**
- `src/ai/difficulty.ts` - Add new tier definition
- `src/components/settings/OpponentPicker.tsx` - Add UI option
- `scripts/ai-smoke.ts` - Add to tier-vs-tier matrix

**Tuning parameters:**
- `depth` - Plies to search
- `profile` - Evaluation weights
- `timeBudgetMs` - Hard search limit
- `noise`, `blunderChance` - Error simulation
- `undo.maxSwing` - Undo tolerance

**Verify:**
- Tier strength ordering maintained
- Time budget respected
- No search crashes

### Modifying Clock Behavior

**Affected files:**
- `src/game/clock.ts` - Pure clock arithmetic
- `src/hooks/useGameClock.ts` - React ticking
- `src/game/engine.ts` - Flag handling
- `src/components/game/GameClockView.tsx` - Display

**Invariants:**
- Only one clock runs at a time
- All state changes apply `tick()` first
- Flag detection is immediate

**Test:**
- Clock starts on first move
- Increments apply correctly
- Low time displays properly
- Flag triggers game end
- Pause/resume works

---

## Maintenance and Change Log

### Document History

**2026-10-10 - Initial creation**
- Comprehensive codebase analysis performed
- All 90+ source files inventoried
- Architecture, data flows, and dependencies mapped
- File-by-file reference documented
- Testing coverage assessed
- Known issues catalogued

### How to Update This Document

When making changes to the codebase:

1. **File changes:**
   - Add new files to inventory
   - Update file descriptions if responsibilities change
   - Remove deleted files
   - Update line references if significantly refactored

2. **Architecture changes:**
   - Update diagrams if module boundaries shift
   - Revise workflow traces if data flow changes
   - Update dependency map if imports change

3. **Feature additions:**
   - Add to workflow section if new user-facing flow
   - Update relevant file descriptions
   - Add to change impact guide if common modification

4. **Bug fixes:**
   - Remove from known issues if addressed
   - Note resolution in change log

5. **Record your changes:**
   - Add entry to this change log
   - Include date, affected sections, and reason

---

## Quick Reference

### Project Commands
```bash
npm run dev              # Development server
npm run build            # Production build
npm run check:engine     # Rule tests
npm run check:ai         # AI verification
```

### Key Directories
- `src/game/` - Pure rules engine
- `src/ai/` - Pure AI opponent
- `src/hooks/` - React adapters
- `src/themes/` - Visual languages
- `src/components/` - UI components
- `src/pages/` - Routes

### Core Flows
1. User move → controller.move() → engine.applyMove() → animations
2. AI turn → search → controller action → engine → animations
3. Theme switch → ThemeContext → CSS cascade → re-render

### Important Files
- `src/game/engine.ts` - Core rule logic (722 lines)
- `src/hooks/useGameLogic.ts` - Main orchestrator
- `src/hooks/useAIOpponent.ts` - AI driver
- `src/App.tsx` - Routing
- `src/themes/registry.ts` - Theme catalog

---

**End of AI Codebase Guide**

This document was generated through systematic inspection of 90+ source files, configuration files, and build artifacts. All architectural claims, dependency relationships, and workflow traces are grounded in verified source code as of 2026-10-10.

For the most accurate information, always read the relevant source files before making changes. This guide is a map, not a substitute for exploring the territory.
