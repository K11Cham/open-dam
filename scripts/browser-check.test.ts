import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { chromium } from 'playwright-core'
import type { Browser, BrowserContext, Page } from 'playwright-core'

/**
 * The checks only a real browser can make, against a production build served
 * the way Cloudflare serves it: `npm run server` (or BROWSER_URL for another
 * address). Run with `npm run check:browser`. It drives the Chrome already
 * installed on the machine through playwright-core (CHROME_PATH overrides
 * where to find it); nothing is downloaded.
 *
 *  - **No Content Security Policy violations** on any page, with the
 *    computer's worker thinking, an online game's socket open, and the
 *    service worker installed.
 *  - **Offline:** after one visit, every page opens with the network off and a
 *    game against the computer starts.
 *  - **Updates:** a new service worker shows "Update now", which swaps
 *    versions and deletes the old saved files. To fake a deploy it rewrites
 *    the version in `dist/sw.js` for a moment (and puts it back), so it runs
 *    only against a server serving this checkout's `dist/`.
 *
 * Playwright's offline switch also cuts off the service worker in Chromium,
 * so "offline" here means every request to the site fails at the network,
 * which is what a phone without signal sees.
 */

const BASE = (process.env.BROWSER_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((path) => existsSync(path))

const PAGES = [
  '/',
  '/play',
  '/learn',
  '/analysis',
  '/leaderboards',
  '/settings',
  '/signin',
  '/signup',
  '/recover',
  '/privacy',
  '/terms',
  '/u/nobody-here',
  '/no-such-page',
]

let browser: Browser

/**
 * The browser globals the page functions below use. This file is checked as
 * Node code, without the DOM's types, so each function casts `globalThis` to
 * this (a cast only; nothing outside the function is captured).
 */
interface Page$ {
  caches: { keys(): Promise<string[]>; open(name: string): Promise<{ keys(): Promise<unknown[]> }> }
  navigator: { serviceWorker: { controller: unknown; getRegistration(): Promise<{ update(): Promise<unknown> } | undefined> } }
  document: { addEventListener(type: string, listener: (event: { violatedDirective: string; blockedURI: string }) => void): void }
}

beforeAll(async () => {
  expect(CHROME, 'no Chrome found; set CHROME_PATH').toBeTruthy()
  const health = await fetch(`${BASE}/api/health`).catch(() => null)
  expect(health?.ok, `nothing answered at ${BASE}; start it with npm run server`).toBe(true)
  browser = await chromium.launch({ executablePath: CHROME, headless: true })
})

afterAll(async () => {
  await browser?.close()
})

/** A fresh browser profile that records every CSP violation and page error. */
async function freshContext(): Promise<{ context: BrowserContext; problems: string[] }> {
  const context = await browser.newContext()
  const problems: string[] = []
  await context.addInitScript(() => {
    ;(globalThis as unknown as Page$).document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`)
    })
  })
  context.on('page', (page) => watch(page, problems))
  return { context, problems }
}

function watch(page: Page, problems: string[]) {
  page.on('console', (message) => {
    const text = message.text()
    if (/Content Security Policy|CSP violation/i.test(text)) problems.push(`${page.url()}: ${text}`)
  })
  page.on('pageerror', (error) => problems.push(`${page.url()}: ${error.message}`))
}

const heading = (page: Page) => page.locator('h1').first().textContent({ timeout: 10_000 })

/** Wait until the service worker controls the page and has saved the app. */
async function waitForOffline(page: Page) {
  await page.waitForFunction(
    async () => {
      const { navigator, caches } = globalThis as unknown as Page$
      if (!navigator.serviceWorker.controller) return false
      const names = await caches.keys()
      if (names.length === 0) return false
      const saved = await (await caches.open(names[0])).keys()
      return saved.length > 10
    },
    undefined,
    { timeout: 30_000, polling: 250 },
  )
}

/** Start a game against the computer, playing second so the computer moves at once. */
async function playComputer(page: Page) {
  await page.goto(`${BASE}/play`)
  await page.getByRole('radio', { name: /^Computer/ }).check()
  await page.getByRole('radiogroup', { name: 'Your side' }).getByRole('radio').nth(1).check()
  await page.getByRole('button', { name: 'Start game' }).click()
  await page.waitForURL(/\/match\//)
  await page.locator('.piece-slot').first().waitFor({ timeout: 10_000 })
}

/** Every request to the site fails, as with no signal; the service worker answers from what it saved. */
const goOffline = (context: BrowserContext) => context.route(`${BASE}/**`, (route) => route.abort('internetdisconnected'))

describe(`in Chrome, against ${BASE}`, () => {
  test('no page breaks the Content Security Policy', async () => {
    const { context, problems } = await freshContext()
    const page = await context.newPage()
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    const sockets: string[] = []
    page.on('websocket', (socket) => sockets.push(socket.url()))

    for (const path of PAGES) {
      await page.goto(`${BASE}${path}`)
      expect(await heading(page), path).toBeTruthy()
    }
    await waitForOffline(page)

    // The computer opponent runs in a worker, which the policy must allow; playing second, it thinks at once.
    await playComputer(page)
    await page.waitForTimeout(1500)
    expect(workers.some((url) => url.includes('search.worker'))).toBe(true)

    // An invite opens a socket to the match room.
    await page.goto(`${BASE}/play`)
    await page.getByRole('radio', { name: /^Online/ }).check()
    await page.getByRole('radio', { name: /^Invite a friend/ }).check()
    await page.getByRole('button', { name: 'Start game' }).click()
    await page.waitForURL(/\/online\//)
    await page.waitForTimeout(1500)
    expect(sockets.some((url) => /\/api\/matches\/[^/]+\/socket$/.test(url))).toBe(true)

    expect(problems).toEqual([])
    await context.close()
  })

  test('after one visit, every page opens offline and a game against the computer starts', async () => {
    const { context, problems } = await freshContext()
    const page = await context.newPage()
    await page.goto(`${BASE}/`)
    await waitForOffline(page)
    // One more load while online, so this page is one the worker answered, before the network goes.
    await page.reload()
    await waitForOffline(page)
    await goOffline(context)
    for (const path of PAGES) {
      await page.goto(`${BASE}${path}`)
      expect(await heading(page), `${path} offline`).toBeTruthy()
    }
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    await playComputer(page)
    await page.waitForTimeout(1500)
    expect(workers.some((url) => url.includes('search.worker'))).toBe(true)
    await context.unrouteAll()
    expect(problems).toEqual([])
    await context.close()
  })

  const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(BASE) && existsSync('dist/sw.js')
  test.runIf(local)('a new version waits for "Update now", then takes over and clears the old saved files', async () => {
    const { context, problems } = await freshContext()
    const page = await context.newPage()
    await page.goto(`${BASE}/`)
    await waitForOffline(page)
    const before = await page.evaluate(() => (globalThis as unknown as Page$).caches.keys())
    expect(before).toHaveLength(1)

    // Pretend a deploy happened: the same worker with another version, so another cache.
    const original = readFileSync('dist/sw.js', 'utf8')
    const version = before[0].replace(/^open-dam-/, '')
    expect(original).toContain(version)
    writeFileSync('dist/sw.js', original.replaceAll(version, 'feedc0ffee00'))
    try {
      // The local server can take a moment to serve the changed file; ask again until the browser sees the new worker.
      const update = page.getByRole('button', { name: 'Update now' })
      for (let i = 0; i < 30 && !(await update.isVisible()); i++) {
        await page.evaluate(async () =>
          (await (globalThis as unknown as Page$).navigator.serviceWorker.getRegistration())?.update().catch(() => {}),
        )
        await page.waitForTimeout(1000)
      }
      await update.waitFor({ timeout: 5_000 })
      await Promise.all([page.waitForEvent('load', { timeout: 30_000 }), update.click()])
      await page.waitForFunction(
        async () => {
          const names = await (globalThis as unknown as Page$).caches.keys()
          return names.length === 1 && names[0] === 'open-dam-feedc0ffee00'
        },
        undefined,
        { timeout: 30_000, polling: 250 },
      )
    } finally {
      writeFileSync('dist/sw.js', original)
    }
    expect(problems).toEqual([])
    await context.close()
  })
})
