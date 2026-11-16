import { describe, expect, test } from 'vitest'
import assetsDoc from '../../docs/ASSETS.md?raw'
import { ART_PLACEHOLDERS, THEME_PALETTE, paintArt, swapSides } from './paint'
import { RESULT_ART } from './results'

// Every picture in this folder, as text, keyed by its path from here ('./chapters/kings.svg').
const FILES = import.meta.glob<string>('./**/*.svg', { query: '?raw', import: 'default', eager: true })
const entries = Object.entries(FILES)

describe('the illustration files', () => {
  test('there are some', () => {
    expect(entries.length).toBeGreaterThan(10)
  })

  test.each(entries)('%s is listed in docs/ASSETS.md with where it came from', (path) => {
    expect(assetsDoc).toContain(`src/art/${path.slice(2)}`)
  })

  test.each(entries)('%s uses only the four placeholder colours', (_path, svg) => {
    const colours = new Set([...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(([hex]) => hex.toUpperCase()))
    for (const colour of colours) expect(Object.keys(ART_PLACEHOLDERS)).toContain(colour)
    // Named colours or a <style> block would slip past the theme.
    expect(svg).not.toMatch(/(fill|stroke)="(?!none|#)[^"]*"/)
    expect(svg).not.toMatch(/<style/i)
  })

  // The files are inlined into the page, so nothing in them may run, load or link anything.
  test.each(entries)('%s holds nothing but drawing', (_path, svg) => {
    expect(svg).not.toMatch(/<(script|foreignObject|image|iframe|a|use)\b/i)
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i)
    expect(svg).not.toMatch(/href\s*=\s*"(?!#)/i)
    expect(svg).not.toMatch(/javascript:/i)
  })
})

describe('paintArt', () => {
  const sample = [
    '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">',
    '<title>A thing</title>',
    '<defs><clipPath id="c"><rect width="5" height="5"/></clipPath></defs>',
    '<g id="pieces" fill="#ff0000" stroke="#000000" clip-path="url(#c)"><circle r="2" fill="#0000FF"/></g>',
    '<path d="M0 0H5" stroke="#00FF00" fill="none"/>',
    '<circle r="1" fill="none" stroke="#0000FF"/>',
    '</svg>',
  ].join('')
  const painted = paintArt(sample, THEME_PALETTE, 'x-')

  test('puts the theme tokens in place of the placeholders', () => {
    expect(painted).not.toMatch(/#(000000|FF0000|0000FF|00FF00)/i)
    expect(painted).toContain('style="fill:var(--dam-p1);stroke:var(--dam-ink)"')
    expect(painted).toContain('<circle r="2" style="fill:var(--dam-p2)"/>')
    expect(painted).toContain('fill="none" style="stroke:var(--dam-art-accent)"')
  })

  test('draws a piece made of outline only in the side line colour', () => {
    expect(painted).toContain('<circle r="1" fill="none" style="stroke:var(--dam-art-p2-line)"/>')
    expect(paintArt(sample, swapSides(THEME_PALETTE))).toContain('style="stroke:var(--dam-art-p1-line)"')
  })

  test('prefixes ids and the references to them', () => {
    expect(painted).toContain('id="x-c"')
    expect(painted).toContain('clip-path="url(#x-c)"')
    expect(painted).toContain('id="x-pieces"')
  })

  test('lets the layout size the picture, and drops the title', () => {
    expect(painted).toMatch(/^<svg viewBox="0 0 10 10" xmlns="http:\/\/www.w3.org\/2000\/svg" focusable="false">/)
    expect(painted).not.toContain('<title>')
  })

  test('every result has a picture', () => {
    expect(Object.keys(RESULT_ART).sort()).toEqual(['draw', 'loss', 'win'])
  })
})
