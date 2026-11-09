import { describe, expect, test } from 'vitest'
import { THEMES, THEME_KEYS } from './registry'
import type { ThemeKey, ThemeTokens } from './types'

/**
 * WCAG contrast for every pair of tokens the stylesheets put together as
 * text on a background, or as a control against what is around it, in every
 * theme. Text needs 4.5:1 (3:1 when it is large: 24px, or 18.7px bold);
 * focus rings and other parts people must see need 3:1.
 *
 * The pairs come from the stylesheets (`color: var(--dam-…)` on a known
 * background). Adding a new pairing there means adding it here.
 */

type Token = keyof ThemeTokens
interface Pair {
  text: Token
  on: Token
  /** 'text' 4.5:1, 'large' 3:1, 'ui' 3:1. */
  kind: 'text' | 'large' | 'ui'
  where: string
}

const COMMON: Pair[] = [
  { text: '--dam-ink', on: '--dam-bg', kind: 'text', where: 'page text' },
  { text: '--dam-ink', on: '--dam-surface', kind: 'text', where: 'panel text' },
  { text: '--dam-ink', on: '--dam-surface-2', kind: 'text', where: 'stat tiles, inputs' },
  { text: '--dam-ink', on: '--dam-surface-hover', kind: 'text', where: 'hovered rows' },
  { text: '--dam-ink-muted', on: '--dam-bg', kind: 'text', where: 'secondary text on the page' },
  { text: '--dam-ink-muted', on: '--dam-surface', kind: 'text', where: 'secondary text in panels' },
  { text: '--dam-ink-muted', on: '--dam-surface-2', kind: 'text', where: 'stat labels' },
  { text: '--dam-accent-ink', on: '--dam-accent', kind: 'text', where: 'primary buttons, current move' },
  { text: '--dam-danger-ink', on: '--dam-danger', kind: 'text', where: 'danger buttons' },
  { text: '--dam-ink-inverse', on: '--dam-ink', kind: 'text', where: 'toasts, running clock' },
  { text: '--dam-success', on: '--dam-surface', kind: 'text', where: 'rating gains' },
  { text: '--dam-danger', on: '--dam-surface', kind: 'text', where: 'form errors, rating losses' },
  { text: '--dam-danger', on: '--dam-bg', kind: 'text', where: 'form errors on the page' },
  { text: '--dam-focus', on: '--dam-bg', kind: 'ui', where: 'focus ring on the page' },
  { text: '--dam-focus', on: '--dam-surface', kind: 'ui', where: 'focus ring in panels' },
]

const SPECIFIC: Partial<Record<ThemeKey, Pair[]>> = {
  neobrutalist: [{ text: '--dam-accent', on: '--dam-ink', kind: 'text', where: 'running clock' }],
  carnival: [
    { text: '--dam-accent', on: '--dam-bg', kind: 'large', where: 'hero title' },
    { text: '--dam-success', on: '--dam-bg', kind: 'text', where: 'eyebrow' },
  ],
  sand: [{ text: '--dam-accent', on: '--dam-bg', kind: 'text', where: 'eyebrow' }],
}

const MINIMUM = { text: 4.5, large: 3, ui: 3 }

type Rgba = [number, number, number, number]

/** A colour token as RGBA: #rgb, #rrggbb, rgb() and rgba() are what the themes use. */
function parse(value: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)).concat(1) as Rgba
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(value.trim())
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  throw new Error(`Cannot read the colour ${value}`)
}

/** A see-through colour as it looks over a solid one. */
const over = (top: Rgba, under: Rgba): Rgba => {
  const a = top[3]
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1) as Rgba
}

const luminance = ([r, g, b]: Rgba): number => {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(foreground: string, background: string, page = '#FFFFFF'): number {
  const back = over(parse(background), parse(page))
  const front = over(parse(foreground), back)
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

describe('colour contrast', () => {
  test('the arithmetic matches WCAG', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
  })

  for (const key of THEME_KEYS) {
    test(`${THEMES[key].name}: text and controls stand out from what is behind them`, () => {
      const tokens = THEMES[key].tokens
      const failures = [...COMMON, ...(SPECIFIC[key] ?? [])].flatMap((pair) => {
        const ratio = contrast(tokens[pair.text], tokens[pair.on], tokens['--dam-bg'])
        return ratio + 1e-9 < MINIMUM[pair.kind]
          ? [`${pair.text} on ${pair.on} (${pair.where}): ${ratio.toFixed(2)}:1, needs ${MINIMUM[pair.kind]}:1`]
          : []
      })
      expect(failures).toEqual([])
    })
  }
})
