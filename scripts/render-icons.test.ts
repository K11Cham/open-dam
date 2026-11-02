/**
 * Draw the favicon and the app icons from the mark in src/themes/brand.ts:
 *
 *   npm run icons
 *
 * Writes public/favicon.svg, public/favicon.ico and public/icons/*.png. The
 * files are committed, so a build needs nothing but them; run this again
 * only after changing the mark or its colours.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { test } from 'vitest'
import { brandSvg } from '../src/themes/brand'
import type { BrandSvgOptions } from '../src/themes/brand'

const PUBLIC = 'public'
const ICONS = join(PUBLIC, 'icons')

const png = (options: BrandSvgOptions & { size: number }): Buffer =>
  new Resvg(brandSvg(options), { fitTo: { mode: 'width', value: options.size } }).render().asPng()

/** An .ico holding one PNG, which every browser that still asks for /favicon.ico reads. */
function ico(image: Buffer, size: number): Buffer {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // one image
  header.writeUInt8(size, 6)
  header.writeUInt8(size, 7)
  header.writeUInt8(0, 8) // no palette
  header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10) // colour planes
  header.writeUInt16LE(32, 12) // bits per pixel
  header.writeUInt32LE(image.length, 14)
  header.writeUInt32LE(22, 18) // the image starts after this header
  return Buffer.concat([header, image])
}

test('render icons', () => {
  mkdirSync(ICONS, { recursive: true })
  writeFileSync(join(PUBLIC, 'favicon.svg'), brandSvg({ tile: 'rounded' }) + '\n')
  writeFileSync(join(PUBLIC, 'favicon.ico'), ico(png({ tile: 'rounded', size: 32 }), 32))
  // Plain icons keep their own rounded corners.
  writeFileSync(join(ICONS, 'icon-192.png'), png({ tile: 'rounded', size: 192 }))
  writeFileSync(join(ICONS, 'icon-512.png'), png({ tile: 'rounded', size: 512 }))
  // Android may cut a maskable icon to a circle 80% wide, so the grid shrinks into that.
  writeFileSync(join(ICONS, 'maskable-512.png'), png({ tile: 'square', scale: 0.74, size: 512 }))
  // iOS rounds the corners itself and shows any transparency as black.
  writeFileSync(join(ICONS, 'apple-touch-icon.png'), png({ tile: 'square', scale: 0.86, size: 180 }))
})
