// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SECURITY_HEADERS, secured } from './securityHeaders'

/** `public/_headers` as rules: each path with the headers indented under it. */
function parseHeadersFile(text: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>()
  let current: Record<string, string> | null = null
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      current = {}
      rules.set(line.trim(), current)
      continue
    }
    const colon = line.indexOf(':')
    if (current && colon > 0) current[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return rules
}

const rules = parseHeadersFile(readFileSync(new URL('../public/_headers', import.meta.url), 'utf8'))

describe('security headers', () => {
  it('forbid framing and plugins, and allow scripts only from this site', () => {
    const csp = rules.get('/*')?.['Content-Security-Policy'] ?? ''
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })

  it('are the same on static files and on the Worker’s own responses', () => {
    expect(rules.get('/*')).toEqual(SECURITY_HEADERS)
  })

  it('make the service worker always revalidate', () => {
    expect(rules.get('/sw.js')).toEqual({ 'Cache-Control': 'no-cache' })
  })

  it('are added to API responses, keeping what the response already says', async () => {
    const response = secured(new Response('{"ok":true}', { status: 201, headers: { 'Content-Type': 'application/json' } }))
    expect(response.status).toBe(201)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(await response.text()).toBe('{"ok":true}')
  })
})
