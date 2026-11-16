/**
 * Photograph the real board for the link-preview picture:
 *
 *   npm run dev            (in another terminal)
 *   npm run share-board
 *
 * Opens the analysis board in Chrome, in the Sand theme at the 5×5 starting
 * position, photographs just the patch of sand with its sticks and stones (the
 * page behind it transparent), and writes public/og-image.png: that photo
 * beside the name, laid out by `shareImageSvg` in src/themes/brand.ts. The
 * Sand pieces are stacks of 3D layers in the page, not image files, so a
 * browser is the only thing that can draw them. The picture is committed, so
 * this is needed only when the board's look or the layout changes.
 *
 * BOARD_URL points it at another dev server; CHROME_PATH at another Chrome.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { SHARE_IMAGE, shareImageSvg } from '../src/themes/brand'

const BASE = (process.env.BOARD_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((path) => existsSync(path))

const OUTPUT = join('public', 'og-image.png')

/** Room around the sand for the soft glow its shadow casts. */
const MARGIN = 36

test('photograph the board', async () => {
  expect(CHROME, 'no Chrome found; set CHROME_PATH').toBeTruthy()
  const up = await fetch(BASE).catch(() => null)
  expect(up?.ok, `nothing answered at ${BASE}; start it with npm run dev`).toBe(true)

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  try {
    // Twice the pixels, so the photo stays sharp in a 1200-pixel picture.
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1200 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    })
    await context.addInitScript(() => localStorage.setItem('openDam.theme', JSON.stringify('sand')))
    const page = await context.newPage()
    await page.goto(`${BASE}/analysis`)
    await page.getByRole('button', { name: 'Starting position' }).click()
    // Only the board: no page behind it, no square names, nothing focused. A
    // hidden element paints no background, so hiding the rest clears it too.
    await page.addStyleTag({
      content: [
        'html, body { background: transparent !important; }',
        'body * { visibility: hidden; }',
        '.board-wrap, .board-wrap * { visibility: visible; }',
        '.board-wrap .coord { visibility: hidden; }',
      ].join('\n'),
    })
    // Clicking the button scrolled the page; the board must be wholly in view to be photographed.
    // This file is checked as Node code, without the DOM's types, hence the cast (as in browser-check).
    await page.evaluate(() => {
      const page$ = globalThis as unknown as {
        document: { activeElement: { blur?(): void } | null }
        scrollTo(x: number, y: number): void
      }
      page$.document.activeElement?.blur?.()
      page$.scrollTo(0, 0)
    })
    await page.mouse.move(0, 0)
    await page.locator('.sd-piece').first().waitFor()
    await page.waitForTimeout(400)

    const sand = await page.locator('.sd-sand').boundingBox()
    expect(sand, 'no .sd-sand on the page: is the Sand theme still drawing the board this way?').toBeTruthy()
    const clip = {
      x: sand!.x - MARGIN,
      y: sand!.y - MARGIN,
      width: sand!.width + MARGIN * 2,
      height: sand!.height + MARGIN * 2,
    }
    const photo = await page.screenshot({ omitBackground: true, clip })
    const board = { href: `data:image/png;base64,${photo.toString('base64')}`, width: clip.width, height: clip.height }
    const picture = new Resvg(shareImageSvg(board), {
      fitTo: { mode: 'width', value: SHARE_IMAGE.width },
      font: { loadSystemFonts: true, defaultFontFamily: 'Georgia' },
    })
    // The sand and stone grain makes a full-colour PNG over 400 KB, and WhatsApp shows no preview for a
    // picture over about 300 KB. A 256-colour palette looks the same here at about a quarter of the size.
    await sharp(picture.render().asPng())
      .png({ palette: true, quality: 90, colours: 256, effort: 10, compressionLevel: 9 })
      .toFile(OUTPUT)
  } finally {
    await browser.close()
  }
})
