/**
 * Render every theme's sounds to WAV files so they can be heard, compared and
 * tuned outside the app:
 *
 *   npm run sounds
 *
 * Writes sound-preview/<theme>/<cue>.wav and sound-preview/index.html (open
 * it in a browser to play them all side by side). The folder is ignored by
 * git; the recipes in src/themes/<theme>/sounds.ts are the source of truth.
 * Recorded sounds are listed on the page with their credit instead.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'vitest'
import { encodeWav, renderRecipe } from '../src/audio/synth'
import { SOUND_CUES, isRecorded } from '../src/audio/types'
import type { ThemeSounds } from '../src/audio/types'
import { sounds as atelier } from '../src/themes/atelier/sounds'
import { sounds as carnival } from '../src/themes/carnival/sounds'
import { sounds as neobrutalist } from '../src/themes/neobrutalist/sounds'
import { sounds as sand } from '../src/themes/sand/sounds'

// The sound files only, not the theme definitions, which pull in CSS and React.
const THEMES: Record<string, ThemeSounds> = { neobrutalist, atelier, carnival, sand }
const SAMPLE_RATE = 44_100
const OUT = 'sound-preview'

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

test('render theme sounds', () => {
  const sections: string[] = []
  for (const [theme, sounds] of Object.entries(THEMES)) {
    mkdirSync(join(OUT, theme), { recursive: true })
    const rows = SOUND_CUES.map((cue) => {
      const source = sounds[cue]
      if (isRecorded(source)) {
        const { title, author, url, licence } = source.credit
        return `<tr><th>${cue}</th><td>Recorded: ${escape(title)} by ${escape(author)} (${escape(licence)}), <a href="${escape(url)}">source</a></td></tr>`
      }
      writeFileSync(join(OUT, theme, `${cue}.wav`), encodeWav(renderRecipe(source, SAMPLE_RATE), SAMPLE_RATE))
      return `<tr><th>${cue}</th><td><audio controls preload="none" src="${theme}/${cue}.wav"></audio></td></tr>`
    })
    sections.push(`<section><h2>${theme}</h2><table>${rows.join('')}</table></section>`)
  }
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open Dam sounds</title>
<style>body{font:15px system-ui,sans-serif;margin:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}
h1{grid-column:1/-1;margin:0}th{text-align:left;padding-right:12px;font-weight:600}td{padding:2px 0}</style>
<h1>Open Dam sounds</h1>${sections.join('')}`,
  )
  process.stdout.write(`Wrote ${OUT}/index.html\n`)
})
