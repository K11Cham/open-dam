// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** What the site serves as static files (index.html, public/), checked as crawlers and link previews read them. */

const file = (path: string) => readFileSync(join(process.cwd(), path))

describe('link previews and crawlers', () => {
  it('the page carries Open Graph and Twitter tags, with a 1200×630 picture', () => {
    // Tags may be wrapped over several lines; read them with the whitespace collapsed.
    const html = file('index.html').toString().replace(/\s+/g, ' ')
    const meta = (key: string) => {
      return new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html)?.[1] ?? null
    }
    expect(meta('og:title')).toMatch(/Open Dam/)
    expect(meta('og:description')).toBeTruthy()
    expect(meta('og:url')).toMatch(/^https:\/\//)
    expect(meta('og:image')).toMatch(/^https:\/\/.+\/og-image\.png$/)
    expect([meta('og:image:width'), meta('og:image:height')]).toEqual(['1200', '630'])
    expect(meta('twitter:card')).toBe('summary_large_image')
    const png = file('public/og-image.png')
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
  })

  it('robots.txt keeps crawlers out of the API and private pages, and points to the sitemap of public pages', () => {
    const robots = file('public/robots.txt').toString()
    expect(robots).toMatch(/^Disallow: \/api\/$/m)
    expect(robots).toMatch(/^Sitemap: https:\/\/.+\/sitemap\.xml$/m)
    const sitemap = file('public/sitemap.xml').toString()
    for (const path of ['/', '/play', '/learn', '/leaderboards', '/privacy', '/terms']) {
      expect(sitemap).toContain(`<loc>https://play.open-dam.workers.dev${path}</loc>`)
    }
  })
})
