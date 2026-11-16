# Illustrations

The board, the pieces, the logo and the app icons are drawn in code (see
`src/themes`). The app's other pictures are generated SVG files in `src/art`.
This file says where each one came from, what was changed by hand, and the
terms they are used under. `src/art/art.test.ts` fails if a file in `src/art`
is missing from this list.

The link-preview picture, `public/og-image.png`, is not generated: it is a
photo of the real board, the Sand theme at the starting position, taken in
Chrome by `npm run share-board` (with `npm run dev` running) and laid out
beside the name by `shareImageSvg` in `src/themes/brand.ts`. The script saves
it as a 256-colour PNG with `sharp`: WhatsApp shows no preview for a picture
over about 300 KB, and the sand's grain makes a full-colour one over 400 KB.
`worker/staticSite.test.ts` fails if it grows past 300 KB.

## How they work

Each picture is drawn in four placeholder colours: black `#000000` for line
work, red `#FF0000` for the first side's pieces, blue `#0000FF` for the
second side's, and green `#00FF00` for arrows and accents. `paintArt`
(`src/art/paint.ts`) swaps them for the current theme's `--dam-ink`,
`--dam-p1`, `--dam-p2` and `--dam-art-accent`, so one file suits every theme.
A piece drawn as an outline only takes `--dam-art-p1-line` or
`--dam-art-p2-line` instead, because a side's fill colour may not show as a
thin line (Atelier's white pieces on a white page). `components/ui/Art.tsx`
inlines the result and hides it from screen readers, since every picture sits
beside words that say the same thing.

They are inlined, not loaded with `<img>`, so a CSS variable can reach them.
The test therefore also checks that no file holds anything but drawing: no
scripts, links, embedded images or event handlers.

| File                              | Where it shows                                           |
| --------------------------------- | -------------------------------------------------------- |
| `src/art/chapters/moving.svg`     | Tutorial chapter 1, Moving and capturing (card and page) |
| `src/art/chapters/chains.svg`     | Chapter 2, Chain captures                                |
| `src/art/chapters/kings.svg`      | Chapter 3, Kings                                         |
| `src/art/chapters/calling.svg`    | Chapter 4, Calling                                       |
| `src/art/chapters/opening.svg`    | Chapter 5, The opening                                   |
| `src/art/chapters/endings.svg`    | Chapter 6, Winning, losing and drawing                   |
| `src/art/chapters/tempo.svg`      | Chapter 7, Tempo and shape                               |
| `src/art/chapters/sacrifices.svg` | Chapter 8, Sacrifices                                    |
| `src/art/chapters/traps.svg`      | Chapter 9, Traps and breakthroughs                       |
| `src/art/chapters/endgame.svg`    | Chapter 10, Trapping a lone king                         |
| `src/art/chapters/plans.svg`      | Chapter 11, Winning plans                                |
| `src/art/results/win.svg`         | The end-of-game summary, a win                           |
| `src/art/results/loss.svg`        | The end-of-game summary, a loss                          |
| `src/art/results/draw.svg`        | The end-of-game summary, a draw                          |
| `src/art/not-found.svg`           | The Not Found page                                       |

## Where they came from

All fifteen were generated on 2026-11-15 through Higgsfield (higgsfield.ai)
with the GPT Image 2.6 model, as SVG with a transparent background, at the
"low" quality setting. Each prompt began with the same paragraph, so the set
shares one style:

> Flat vector spot illustration, minimal and friendly, bold clean shapes, no
> text, no letters, no gradients, no shadows, transparent background. Use
> only these four flat colours: pure black #000000 for thick outlines and
> thin grid lines, pure red #FF0000 for one side's round game counters, pure
> blue #0000FF for the other side's round game counters, pure green #00FF00
> for arrows and small accents. Counters always sit in the middle of grid
> squares; moves go straight along a row or column, never diagonally.

and then described one scene: a red counter jumping a blue one (moving), two
hops in a row (chains), two stacked counters under a crown (kings), a
pointing hand and a ringed counter (calling), the 5×5 starting position
(opening), a level balance scale (endings), an hourglass and counters that
only go forward (tempo), one counter given and two taken (sacrifices), a pair
breaking through a two-square gap (traps), a crowned counter cornered by three
(endgame), a straight path to a flag (plans), a stacked, crowned pair in a
burst of rays (win), a tipped-over counter under a small cloud (loss), two
counters level with an equals sign (draw), and a counter that has rolled off a
grid (not found). The win took a second try: the first had a face and arms,
unlike the rest.

## Changed by hand

- Every picture: the `viewBox` was tightened to a square around what is drawn
  (measured with resvg's bounding box), because the generator leaves wide
  empty margins.
- `opening.svg`: the middle row's pieces were swapped left for right. The
  generator mirrored it; in the game the far side's two pieces are on the left
  (`makeYinYangBoard` in `src/game/board.ts`), and a picture of the opening
  must not teach a different one.
- `results/loss.svg`: a small blue patch on the tipped counter was made red,
  so the counter reads as one piece of one side.

When adding a picture: generate it with the same opening paragraph, check it
uses only the four colours, tighten its `viewBox`, check any board in it
against the rules, and add it to the table above.

## Terms

Higgsfield's Terms of Use (section 4.4, as described in its help centre in
November 2026) claim no ownership of what users generate and allow commercial
use; the one condition is that outputs may not be used to train AI models.
The files ship with the rest of the repository under its MIT licence. Work
generated by AI may not be protected by copyright at all; the MIT licence
grants whatever rights there are. Before relying on this for anything beyond
this project, read Higgsfield's current terms.
