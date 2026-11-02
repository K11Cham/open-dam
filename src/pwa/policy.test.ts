import { describe, expect, test } from 'vitest'
import { shouldPrecache, strategyFor } from './policy'

const ORIGIN = 'https://play.open-dam.workers.dev'
const get = (path: string, mode = 'cors') => strategyFor({ method: 'GET', mode, url: `${ORIGIN}${path}` }, ORIGIN)

describe('what the service worker does with a request', () => {
  test('accounts, games, the lobby and their sockets always go to the server', () => {
    expect(get('/api/me')).toBe('pass')
    expect(get('/api/matches/abc/socket')).toBe('pass')
    expect(get('/api/lobby/socket')).toBe('pass')
    expect(get('/api')).toBe('pass')
    expect(strategyFor({ method: 'POST', mode: 'cors', url: `${ORIGIN}/api/auth/signin` }, ORIGIN)).toBe('pass')
  })

  test('a page of the app is the saved app, even one under a path that only looks like /api', () => {
    expect(get('/', 'navigate')).toBe('shell')
    expect(get('/match/abc', 'navigate')).toBe('shell')
    expect(get('/apiary', 'navigate')).toBe('shell')
  })

  test('built files are kept; other files of ours are fresh when online', () => {
    expect(get('/assets/index-abc123.js')).toBe('cache-first')
    expect(get('/manifest.webmanifest')).toBe('network-first')
    expect(get('/icons/icon-192.png')).toBe('network-first')
  })

  test('the worker itself, other sites and anything but GET are left alone', () => {
    expect(get('/sw.js')).toBe('pass')
    expect(strategyFor({ method: 'GET', mode: 'cors', url: 'https://example.com/a.js' }, ORIGIN)).toBe('pass')
    expect(strategyFor({ method: 'PUT', mode: 'cors', url: `${ORIGIN}/assets/a.js` }, ORIGIN)).toBe('pass')
  })
})

describe('what is saved when the app installs', () => {
  test('code, styles, icons and the manifest', () => {
    for (const name of [
      'assets/index-abc.js',
      'assets/index-abc.css',
      'icons/icon-512.png',
      'favicon.svg',
      'manifest.webmanifest',
    ]) {
      expect(shouldPrecache(name), name).toBe(true)
    }
  })

  test('Latin fonts only; other alphabets and the old .woff copies wait until needed', () => {
    expect(shouldPrecache('assets/inter-latin-wght-normal-Dx4kXJAl.woff2')).toBe(true)
    expect(shouldPrecache('assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2')).toBe(false)
    expect(shouldPrecache('assets/inter-cyrillic-wght-normal-DqGufNeO.woff2')).toBe(false)
    expect(shouldPrecache('assets/inter-latin-wght-normal-abc.woff')).toBe(false)
  })
})
