import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { BoardFrameProps, CellDecorProps, PieceViewProps } from '../types'

/**
 * Dam as it is played under a tree: a grid scratched into the sand, stones
 * for one side and broken sticks for the other.
 *
 * The board is tilted in 3D and the pieces are built from thin stacked layers
 * (CSS `translateZ`), so a stone is a real dome and a stick has real
 * thickness when seen from the side. The two sides differ in shape, not only
 * colour: a round grey stone against a long brown stick. A king is a second
 * stone balanced on the first, or a second stick laid across the first.
 */

/** A stable number in [0, 1) from a piece id, so each stone keeps its shape and each stick its angle. */
const jitter = (id: string, salt = 0) => {
  let hash = 2166136261 ^ salt
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return ((hash >>> 0) % 1000) / 1000
}

const vars = (values: Record<string, string | number>) => values as CSSProperties

export function Piece({ piece, scale = 0.84, selected, offender, justPromoted }: PieceViewProps) {
  const isStone = piece.player === 'player1'
  return (
    <motion.div
      className={['sd-piece', isStone ? 'is-stone' : 'is-stick', selected && 'is-selected', offender && 'is-offender']
        .filter(Boolean)
        .join(' ')}
      style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
      initial={false}
      // A new king is dropped onto the pile: it lifts off the sand and settles.
      animate={justPromoted ? { z: [0, 22, 0, 5, 0] } : { z: 0 }}
      transition={justPromoted ? { duration: 0.6, ease: 'easeOut' } : { duration: 0.2 }}
    >
      {isStone ? <Stone id={piece.id} king={piece.isKing} /> : <Stick id={piece.id} king={piece.isKing} />}
    </motion.div>
  )
}

/** Uneven outlines, so no two stones on the board look cut from the same mould. */
const STONE_SHAPES = [
  '47% 53% 44% 56% / 52% 45% 55% 48%',
  '55% 45% 52% 48% / 46% 54% 47% 53%',
  '50% 50% 42% 58% / 56% 48% 52% 44%',
  '44% 56% 54% 46% / 50% 43% 57% 50%',
  '52% 48% 47% 53% / 43% 55% 45% 57%',
]
const STONE_LAYERS = 8

function Stone({ id, king }: { id: string; king: boolean }) {
  const shape = Math.floor(jitter(id) * STONE_SHAPES.length)
  const size = 0.8 + jitter(id, 2) * 0.12
  return (
    <div className="sd-token" style={vars({ '--sd-turn': `${Math.round(jitter(id, 1) * 360)}deg` })}>
      <span className="sd-shadow" />
      <span className="sd-body">
        <Pebble shape={STONE_SHAPES[shape]} size={size} base={0} />
        {king && <Pebble shape={STONE_SHAPES[(shape + 2) % STONE_SHAPES.length]} size={size * 0.64} base={STONE_LAYERS - 1} />}
      </span>
    </div>
  )
}

/** One stone: layers that narrow towards the top make the dome, and get lighter where the sun hits. */
function Pebble({ shape, size, base }: { shape: string; size: number; base: number }) {
  return (
    <>
      {Array.from({ length: STONE_LAYERS }, (_, k) => {
        const t = k / (STONE_LAYERS - 1)
        const radius = size * Math.sqrt(1 - (t * 0.78) ** 2)
        return (
          <span
            key={k}
            className={k === STONE_LAYERS - 1 ? 'sd-layer sd-pebble is-top' : 'sd-layer sd-pebble'}
            style={vars({
              width: `${radius * 100}%`,
              height: `${radius * 100}%`,
              borderRadius: shape,
              backgroundColor: `color-mix(in srgb, var(--dam-p1) ${Math.round(45 + t * 55)}%, var(--dam-p1-edge))`,
              '--sd-z': base + k + 1,
            })}
          />
        )
      })}
    </>
  )
}

/**
 * A twig seen end-on, bottom layer to top: round, so narrower at the bottom.
 * Thin for its length on purpose: a fat, even, rounded stick reads as a cigar.
 */
const STICK_PROFILE = [0.7, 1, 0.86]
/** Thickness of the twig, as a share of the piece. */
const STICK_THICKNESS = 14

function Stick({ id, king }: { id: string; king: boolean }) {
  const angle = (jitter(id) < 0.5 ? -1 : 1) * (26 + jitter(id, 1) * 28)
  const length = 0.92 + jitter(id, 2) * 0.12
  return (
    <div className="sd-token" style={vars({ '--sd-turn': `${angle.toFixed(1)}deg` })}>
      <span className="sd-shadow is-long" />
      <span className="sd-body">
        <Twig id={id} length={length} base={0} />
        {king && <Twig id={`${id}:king`} length={length * 0.94} base={STICK_PROFILE.length} cross />}
      </span>
    </div>
  )
}

/**
 * One twig: tapered from a thin tip to a thicker snapped end (the clip-path in
 * theme.css), grain and knots along its length, and on most twigs a short
 * side shoot, the surest sign it came off a tree.
 */
function Twig({ id, length, base, cross = false }: { id: string; length: number; base: number; cross?: boolean }) {
  const flipped = jitter(id, 3) < 0.5
  const shoot =
    jitter(id, 4) < 0.75
      ? {
          // Where along the twig it grows (0 is the middle, 1 the thick end), and to which side.
          along: 0.1 + jitter(id, 5) * 0.45,
          turn: (jitter(id, 6) < 0.5 ? -1 : 1) * (28 + jitter(id, 7) * 14),
          length: 0.2 + jitter(id, 8) * 0.1,
        }
      : null
  const top = STICK_PROFILE.length - 1
  const shade = (k: number) =>
    // Weathered, not polished: the top is the stick's own brown greyed a little; lower layers fall into shadow.
    k === top
      ? 'color-mix(in srgb, var(--dam-p2) 80%, #77705f)'
      : `color-mix(in srgb, var(--dam-p2) ${Math.round(35 + (k / top) * 50)}%, var(--dam-p2-edge))`

  return (
    <span className={['sd-twig', cross && 'is-cross', flipped && 'is-flipped'].filter(Boolean).join(' ')}>
      {STICK_PROFILE.map((width, k) => (
        <span
          key={k}
          className={k === top ? 'sd-layer sd-stick is-top' : 'sd-layer sd-stick'}
          style={vars({
            width: `${length * 100}%`,
            height: `${width * STICK_THICKNESS}%`,
            backgroundColor: shade(k),
            '--sd-z': base + k + 1,
          })}
        />
      ))}
      {shoot &&
        STICK_PROFILE.slice(1).map((width, i) => {
          const k = i + 1
          return (
            <span
              key={`shoot-${k}`}
              className={k === top ? 'sd-layer sd-shoot is-top' : 'sd-layer sd-shoot'}
              style={vars({
                left: `${50 + shoot.along * length * 50}%`,
                width: `${shoot.length * 100}%`,
                height: `${width * STICK_THICKNESS * 0.6}%`,
                backgroundColor: shade(k),
                '--sd-z': base + k + 1,
                '--sd-shoot-turn': `${shoot.turn.toFixed(1)}deg`,
              })}
            />
          )
        })}
    </span>
  )
}

/**
 * Marks drawn with a finger: a poke where a piece can step, a scratched cross
 * where a capture lands, a ring around the chosen piece, and smoothed sand
 * where the last move went.
 */
export function CellDecor({ isTarget, isCaptureTarget, isChainTarget, isSelected, isLastMove }: CellDecorProps) {
  return (
    <>
      {isLastMove && <span className="sd-smoothed" />}
      {isSelected && <span className="sd-ring" />}
      {isTarget && !isCaptureTarget && <span className="sd-poke" />}
      {isCaptureTarget && <span className={isChainTarget ? 'sd-cross is-chain' : 'sd-cross'} />}
    </>
  )
}

/** Hand-drawn grid lines: each one wobbles a little and overshoots the edge, as a line drawn with a stick does. */
const sandLines = (size: number): string[] => {
  let seed = size * 7919 + 13
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const wobble = () => (rand() - 0.5) * 0.7
  const lines: string[] = []
  for (let i = 0; i <= size; i++) {
    const at = (i / size) * 100
    const start = -1.5 - rand() * 1.5
    const end = 101.5 + rand() * 1.5
    const mid = (start + end) / 2
    lines.push(
      `M${start.toFixed(2)} ${(at + wobble()).toFixed(2)} Q${(mid / 2).toFixed(2)} ${(at + wobble()).toFixed(2)} ${mid.toFixed(2)} ${(at + wobble()).toFixed(2)} T${end.toFixed(2)} ${(at + wobble()).toFixed(2)}`,
    )
    lines.push(
      `M${(at + wobble()).toFixed(2)} ${start.toFixed(2)} Q${(at + wobble()).toFixed(2)} ${(mid / 2).toFixed(2)} ${(at + wobble()).toFixed(2)} ${mid.toFixed(2)} T${(at + wobble()).toFixed(2)} ${end.toFixed(2)}`,
    )
  }
  return lines
}

/**
 * The patch of sand, tilted away from the player. `--sd-step` is the height
 * of one piece layer, set from the size of a square so pieces keep their
 * proportions on every board size and screen.
 */
export function BoardFrame({ gridSize, children }: BoardFrameProps) {
  const lines = useMemo(() => sandLines(gridSize), [gridSize])
  return (
    <div className="sd-stage" style={vars({ '--sd-size': gridSize })}>
      <div className="sd-table">
        <span className="sd-sand" aria-hidden />
        <svg className="sd-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden focusable="false">
          <g className="sd-lines__lip">
            {lines.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g className="sd-lines__groove">
            {lines.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </svg>
        {children}
      </div>
    </div>
  )
}

/**
 * Nothing is drawn over the board at the end: the winner's pieces jump off
 * the sand and the loser's tip over (theme.css), and the outcome splash says
 * the rest.
 */
export function EndSequence() {
  return null
}
