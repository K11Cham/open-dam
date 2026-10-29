/// <reference types="node" />
// Node types only for this test; the app itself never touches the file system.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

// Read from disk, relative to the project root where Vitest runs: CSS imports are stubbed in tests.
const read = (theme: string) => readFileSync(`src/themes/${theme}/theme.css`, 'utf8')

/**
 * The end-of-game markers are animated by framer-motion, which writes its own
 * inline `transform`. A marker centred with `transform: translate(-50%, -50%)`
 * loses that centring the moment it animates and hangs off the bottom-right
 * of its piece, so these rules must centre with the `translate` property.
 */
const markers: Array<[string, string, string]> = [
  ['neobrutalist', read('neobrutalist'), 'nb-end-marker'],
  ['atelier', read('atelier'), 'at-end-ring'],
  ['carnival', read('carnival'), 'cv-end-halo'],
]

const ruleBody = (css: string, className: string): string => {
  const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(css)
  if (!match) throw new Error(`no rule for .${className}`)
  return match[1]
}

describe('end-of-game markers', () => {
  test.each(markers)('%s centres its markers without transform', (_, css, className) => {
    const body = ruleBody(css, className)
    expect(body).toMatch(/(^|\n)\s*translate:\s*-50%\s+-50%/)
    expect(body).not.toMatch(/(^|\n)\s*transform:/)
  })
})
