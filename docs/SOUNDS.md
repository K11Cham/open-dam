# Sounds

How the game's sound effects work, how to change them, and how to bring in
recorded sounds without licence trouble.

## How it works

Every theme has its own sounds, one for each **cue**:

| Cue       | When it plays                                                           |
| --------- | ----------------------------------------------------------------------- |
| `move`    | A piece slides.                                                         |
| `capture` | A piece is jumped (each leg of a chain).                                |
| `crown`   | A piece becomes a king.                                                 |
| `call`    | A piece that passed up a capture is called.                             |
| `illegal` | A move or request is refused.                                           |
| `offer`   | A draw or undo is offered.                                              |
| `win`     | The game ends and the listener won (or, in pass and play, someone won). |
| `lose`    | The game ends and the listener lost.                                    |
| `draw`    | The game ends drawn.                                                    |

One step plays one sound, the most important: end, call, crown, capture, move,
offer (`src/audio/cues.ts`).

By default the sounds are **synthesised in code**. Each one is a short recipe
in `src/themes/<theme>/sounds.ts`: a few layers ("voices") of a sine,
triangle, square or saw wave or noise, each with a pitch (or a pitch glide),
a start time, a rise, a fall, a volume and optional filters.
`src/audio/synth.ts` turns a recipe into samples; `src/audio/player.ts` plays
them through Web Audio and keeps each one after its first use.

Because the sounds are made from numbers in this repository, nobody else owns
them: no licence, no attribution, nothing to download, and almost nothing
added to the app's size.

| Theme        | Character                                                               |
| ------------ | ----------------------------------------------------------------------- |
| Neobrutalist | Blunt square-wave blips, dry and hard-edged, like old console menus.    |
| Atelier      | A wooden piece set down; soft glass bells for the moments that matter.  |
| Carnival     | Fairground: boings, pops, quick bright arpeggios, a slide whistle.      |
| Sand         | Stones thudding into sand, sticks knocking, a seed shaker, thumb piano. |

The speaker button in the top bar turns sound on or off (saved as
`openDam.sound`). Browsers only allow sound after the first click or key
press on the page, so a game opened from a link is silent until then.

## Listening to them

```bash
npm run sounds
```

writes every theme's sounds to `sound-preview/<theme>/<cue>.wav` and a page,
`sound-preview/index.html`, with a player for each. Open it in a browser to
compare themes side by side. The folder is not committed.

## Changing a sound

Edit the recipe in `src/themes/<theme>/sounds.ts`, run `npm run sounds`, and
listen again. What the fields do:

| Field      | Effect                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `wave`     | `sine` (pure, soft), `triangle` (soft, a little brighter), `square` (hollow, retro), `saw` (buzzy), `noise` (hiss, thud, click). |
| `freq`     | Pitch in Hz, or `[from, to]` to glide. 262 is middle C; doubling is an octave up.                                                |
| `at`       | Start time in seconds, for arpeggios and rhythms.                                                                                |
| `attack`   | Seconds to full volume. 0.001–0.005 is a sharp hit; 0.02+ swells in.                                                             |
| `decay`    | Seconds to fade out. 0.03 is a tick, 0.1 a tap, 1 a ringing bell.                                                                |
| `gain`     | Volume of this layer, 0–1.                                                                                                       |
| `lowpass`  | Remove highs above this Hz: 300–600 turns noise into a thud.                                                                     |
| `highpass` | Remove lows below this Hz: 2000+ turns noise into a click or hiss.                                                               |

Useful shapes: a **tap** is noise with `lowpass` around 1000 and a decay of
0.03–0.06; a **bell** is a sine plus a quieter sine at 2.76× the pitch with a
shorter decay; a **pluck** is a sine with a 0.002 attack and 0.5–1 s decay;
a **boing** is a triangle gliding up an octave in 0.1 s.

Tests (`src/audio/audio.test.ts`) check that every theme has every cue, that
each is audible and under 2.5 s, that nothing clips, and that the themes do
not share a sound.

## Using recorded sounds instead

Any cue can be a recorded file. Put it next to the theme:

```text
src/themes/carnival/sounds/win.ogg
```

and use it in that theme's `sounds.ts`, keeping a recipe as the fallback:

```ts
import winUrl from './sounds/win.ogg'

export const sounds: ThemeSounds = {
  // …
  win: {
    file: winUrl,
    credit: {
      title: 'Party horn',
      author: 'Kenney',
      url: 'https://kenney.nl/assets/…',
      licence: 'CC0-1.0',
    },
    fallback: { voices: [/* the old recipe */] },
  },
}
```

Prefer `.ogg` or `.mp3`, mono, trimmed tight, under about 50 KB per sound.
The tests require a credit with a link for every recorded sound.

### Which licences are allowed

This repository is public, so any file committed to it is redistributed to
everyone who clones it. Only two kinds of sound qualify (`SoundLicence` in
`src/audio/types.ts`):

- **CC0** (public domain dedication): anyone may copy, change and ship it,
  commercially, without credit. We record the credit anyway.
- **Your own recordings.**

Not allowed here, even though they are often sold as "royalty-free":

- Packs whose licence lets you use sounds _in_ a product but not share the raw
  files, such as the Sonniss GDC bundles, most stock sound sites, and Pixabay
  (its own licence, not CC0). A public repository shares the raw files.
- **CC BY** and **CC BY-SA**: usable in principle, but they require visible
  credit in the app (and BY-SA adds share-alike terms). If that is ever
  wanted, add a credits page first, then add the licence to `SoundLicence`.
- Anything marked "non-commercial" (NC) or "no derivatives" (ND).

### Where to find CC0 sounds

- **Kenney** (kenney.nl, "Audio" assets): whole packs released as CC0,
  including interface clicks, impacts, casino and RPG sounds. The best first
  stop: consistent quality, one licence for everything.
- **Freesound** (freesound.org): huge and varied. Use the licence filter and
  tick **Creative Commons 0** only; many sounds there are CC BY or CC BY-NC.
- **OpenGameArt** (opengameart.org): filter by the **CC0** licence.

Always check the licence on the page of the individual sound or pack you
download, not on a list or a search result, and paste that page's address
into `credit.url`.

### Theme direction for recordings

- **Neobrutalist:** dry, close, synthetic. Short UI clicks and blips; no room
  sound.
- **Atelier:** real wood and glass. Wooden game pieces, a chess piece set
  down, small bells or a glass struck lightly.
- **Carnival:** toys and fairground. Pops, squeakers, kazoo, party horn,
  slide whistle, a short crowd cheer for a win.
- **Sand:** outdoors and natural. Pebbles on sand or dirt, sticks knocking,
  a shaker, kalimba or balafon notes for the end of a game.
