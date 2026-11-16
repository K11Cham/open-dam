/**
 * The app's illustrations are generated SVGs drawn in four placeholder
 * colours, so one file can take any theme's colours: black for line work, red
 * and blue for the two sides' pieces, green for arrows and accents. `paintArt`
 * swaps those for real colours (theme tokens by default) and readies the
 * markup to sit inside the page. docs/ASSETS.md says where each file came from.
 */

/** The placeholder colours, in upper case, and what each one stands for. */
export const ART_PLACEHOLDERS = {
  '#000000': 'ink',
  '#FF0000': 'p1',
  '#0000FF': 'p2',
  '#00FF00': 'accent',
} as const

export type ArtRole = (typeof ART_PLACEHOLDERS)[keyof typeof ART_PLACEHOLDERS]

/**
 * Real colours for the placeholders. A side's colour used as a line (a piece
 * drawn as an outline only) has its own entry, because a side's fill may not
 * show as a thin line: a white piece's outline on a white page.
 */
export type ArtPalette = Record<ArtRole | 'p1Line' | 'p2Line', string>

/** The current theme's colours, so a picture changes with the theme and needs no code per theme. */
export const THEME_PALETTE: ArtPalette = {
  ink: 'var(--dam-ink)',
  p1: 'var(--dam-p1)',
  p2: 'var(--dam-p2)',
  p1Line: 'var(--dam-art-p1-line)',
  p2Line: 'var(--dam-art-p2-line)',
  // Not --dam-accent: some themes' accents only read as a fill, and arrows here are thin lines.
  accent: 'var(--dam-art-accent)',
}

/** The same palette with the sides' colours exchanged, for a picture about the second side. */
export const swapSides = (palette: ArtPalette): ArtPalette => ({
  ...palette,
  p1: palette.p2,
  p2: palette.p1,
  p1Line: palette.p2Line,
  p2Line: palette.p1Line,
})

const roleOf = (hex: string): ArtRole | undefined => ART_PLACEHOLDERS[hex.toUpperCase() as keyof typeof ART_PLACEHOLDERS]

const colourFor = (palette: ArtPalette, role: ArtRole, property: string): string =>
  property === 'stroke' && role === 'p1'
    ? palette.p1Line
    : property === 'stroke' && role === 'p2'
      ? palette.p2Line
      : palette[role]

/**
 * One picture's markup, painted and ready to inline. Colours become `style`
 * declarations rather than attributes, because a presentation attribute cannot
 * hold `var()` in every browser. Ids get `idPrefix`, so two pictures on a page
 * never share an id. Titles go too: each picture is decoration beside text that
 * already says the same thing.
 */
export function paintArt(svg: string, palette: ArtPalette = THEME_PALETTE, idPrefix = ''): string {
  const body = svg
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(title|desc)>[\s\S]*?<\/\1>/g, '')
    .trim()
  const painted = body.replace(/<([a-zA-Z]+)(\s[^>]*?)?(\/?)>/g, (_tag, name: string, attrs = '', selfClosing: string) => {
    const declarations: string[] = []
    let rest = (attrs as string).replace(/\s(fill|stroke)="(#[0-9a-fA-F]{6})"/g, (match, property: string, hex: string) => {
      const role = roleOf(hex)
      if (!role) return match
      declarations.push(`${property}:${colourFor(palette, role, property)}`)
      return ''
    })
    rest = rest
      .replace(/\sid="([^"]+)"/g, ` id="${idPrefix}$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${idPrefix}$1)`)
      .replace(/\shref="#([^"]+)"/g, ` href="#${idPrefix}$1"`)
    // The root's fixed size would fight the layout; the viewBox keeps the shape.
    if (name === 'svg') rest = rest.replace(/\s(width|height)="[^"]*"/g, '') + ' focusable="false"'
    const style = declarations.length ? ` style="${declarations.join(';')}"` : ''
    return `<${name}${rest}${style}${selfClosing}>`
  })
  return painted
}
