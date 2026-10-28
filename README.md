# Open Dam

Dam is a board game played across The Gambia, often on a grid drawn in the sand
with sticks and stones for pieces. Open Dam is an open-source version you can
play in the browser.

## The story

I lived in The Gambia for about eight years. On trips to my father's home
village, Kerr Jarga Jobe in the North Bank Region, one of the most common games,
played by children and adults alike, was Dam. There were many variations; the
most common was the 5×5 board for two players, drawn in the sand with sticks
and stones as pieces.

I built this to keep those memories, to be able to play any time, and to share
a piece of Gambian culture with anyone who wants to try it.

## The game in one minute

- Pieces move one square forward, left or right. Never diagonally, never back.
- Capture by jumping an enemy piece next to you onto the empty square beyond.
  Keep jumping if you can.
- Reach the far row and your piece is crowned: kings move and capture any
  distance in a straight line.
- Captures are optional, but if you pass one up, your opponent can **call** it
  and remove the piece that could have captured.
- Take all your opponent's pieces, or leave them with no move, to win.

The full rules, with example boards, are on the **Learn** page.

## What you can do

- Play the computer at five levels named in Wolof, from Döff (plays on impulse) to Seriñ (plays to win).
- Play a friend on the same device.
- Play online between two browser tabs (preview; a server comes next).
- Pick a board from 5×5 to 9×9, a clock, and house rules.
- Review finished games move by move; study positions on the analysis board.
- Choose between three themes: Neobrutalist Pop, Atelier and Carnival.
- Play with the keyboard or a screen reader.

## Running it

You need Node.js 20.19 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

```bash
npm run verify
```

`verify` type-checks, lints, checks formatting, runs the tests and builds.

## Where to read next

- `docs/WALKTHROUGH.md` — how the whole codebase fits together, with exercises.
- `codebase.md` — every file and what it does.
- `docs/HANDOVER.md` — how to pick up work, and the work log.
- `docs/MULTIPLAYER.md` — the match log, the online protocol, and adding a server.

## Stack

React 19 with the React Compiler, TypeScript (strict), Vite, React Router,
framer-motion, Vitest and Testing Library.

## Licence

MIT. See `LICENSE`.
