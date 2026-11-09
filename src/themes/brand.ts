/**
 * The Open Dam mark: four sticks against four stones on a 3×3 grid, with the
 * centre open. It is the opening position of the game (the centre square is
 * always empty at the start), the "sticks against stones" of a game drawn in
 * the sand, and an O for Open.
 *
 * One geometry serves everything: `BrandMark` draws it in the current theme's
 * colours, and `scripts/render-icons.test.ts` draws it in the fixed brand
 * colours below for the favicon and the app icons, which have to look the
 * same whatever theme is chosen.
 */

/** The mark is drawn on a 48-unit square. */
export const MARK_SIZE = 48

/** Centres of the grid's three columns and rows. */
export const MARK_LINES = [12, 24, 36] as const

export const STONE_RADIUS = 5
export const STICK = { length: 13, width: 4.6, angle: 45 } as const

export interface MarkPiece {
  kind: 'stick' | 'stone'
  x: number
  y: number
}

/** The eight pieces: sticks on the top row and the left of the middle row, stones on the rest, as the game starts. */
export const MARK_PIECES: MarkPiece[] = MARK_LINES.flatMap((y, row) =>
  MARK_LINES.flatMap((x, col): MarkPiece[] => {
    if (row === 1 && col === 1) return []
    const stick = row === 0 || (row === 1 && col === 0)
    return [{ kind: stick ? 'stick' : 'stone', x, y }]
  }),
)

/** The grid lines, drawn as grooves behind the pieces, as one SVG path. */
export const MARK_GRID_PATH = MARK_LINES.map(
  (v) => `M${v} ${MARK_LINES[0]}V${MARK_LINES[2]}M${MARK_LINES[0]} ${v}H${MARK_LINES[2]}`,
).join('')

/** The fixed colours of the icons: sand, its grooves, dark stones and wooden sticks. */
export const BRAND_COLOURS = {
  sand: '#E9D3A6',
  groove: '#C9AE7C',
  stone: '#2E2216',
  stick: '#B5652F',
} as const

export interface BrandSvgOptions {
  /** 'rounded' for the favicon and plain icons; 'square' where the platform cuts its own shape (Apple, maskable). */
  tile: 'rounded' | 'square'
  /** How much of the tile the grid fills; less where a platform may crop the edges. */
  scale?: number
  /** Output size in pixels. */
  size?: number
}

/** The mark in brand colours as a standalone SVG document. */
export function brandSvg({ tile, scale = 1, size = MARK_SIZE }: BrandSvgOptions): string {
  const { sand, groove, stone, stick } = BRAND_COLOURS
  const half = MARK_SIZE / 2
  const pieces = MARK_PIECES.map(({ kind, x, y }) =>
    kind === 'stone'
      ? `<circle cx="${x}" cy="${y}" r="${STONE_RADIUS}" fill="${stone}"/>`
      : `<rect x="${x - STICK.width / 2}" y="${y - STICK.length / 2}" width="${STICK.width}" height="${STICK.length}" rx="${STICK.width / 2}" fill="${stick}" transform="rotate(${STICK.angle} ${x} ${y})"/>`,
  ).join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}">`,
    `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" rx="${tile === 'rounded' ? 11 : 0}" fill="${sand}"/>`,
    `<g transform="translate(${half} ${half}) scale(${scale}) translate(${-half} ${-half})">`,
    `<path d="${MARK_GRID_PATH}" stroke="${groove}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
    pieces,
    '</g></svg>',
  ].join('')
}

/** The size link previews ask for (Open Graph, WhatsApp, X): 1200 by 630. */
export const SHARE_IMAGE = { width: 1200, height: 630 } as const

/**
 * The picture a shared link shows: the mark, large, on sand, beside the name
 * and what the game is. The words use a system serif, since the picture is
 * drawn once by `npm run icons` and committed.
 */
export function shareImageSvg(): string {
  const { width, height } = SHARE_IMAGE
  const { sand, groove, stone } = BRAND_COLOURS
  const mark = 420
  const markX = 110
  const markY = (height - mark) / 2
  const inner = brandSvg({ tile: 'rounded', size: mark })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${sand}"/>`,
    `<rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="28" fill="none" stroke="${groove}" stroke-width="4"/>`,
    `<svg x="${markX}" y="${markY}" width="${mark}" height="${mark}" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}">${inner}</svg>`,
    `<text x="610" y="300" font-family="Georgia, 'DejaVu Serif', serif" font-size="96" font-weight="700" fill="${stone}">Open Dam</text>`,
    `<text x="614" y="372" font-family="Georgia, 'DejaVu Serif', serif" font-size="38" fill="${stone}">The Gambian board game.</text>`,
    `<text x="614" y="424" font-family="Georgia, 'DejaVu Serif', serif" font-size="38" fill="${stone}">Play online, free.</text>`,
    '</svg>',
  ].join('')
}
