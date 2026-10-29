import { motion, useReducedMotion } from 'framer-motion'
import type { TargetAndTransition, Transition } from 'framer-motion'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type OutcomeTone = 'win' | 'loss' | 'draw'

interface OutcomeSplashProps {
  tone: OutcomeTone
  title: string
  reason: string
  /** Called once the moment has played, or as soon as the player skips it. */
  onDone: () => void
}

const LENGTH_MS: Record<OutcomeTone, number> = { win: 2900, loss: 2900, draw: 2600 }
const REDUCED_LENGTH_MS = 1700

/** Deterministic pseudo-random, so the burst does not re-roll on every render. */
const seeded = (seed: number) => {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return value / 2147483647
  }
}

interface Bit {
  id: number
  x: number
  y: number
  fall: number
  spin: number
  delay: number
  size: number
  shape: 'chip' | 'dot' | 'strip'
  color: string
}

// Pieces of both sides, the crown gold and the accent: the whole game celebrates.
const BIT_COLORS = ['var(--dam-accent)', 'var(--dam-crown)', 'var(--dam-p1)', 'var(--dam-p2)', 'var(--dam-success)']

/** Bits thrown out from the centre, then pulled down. `reach` is in pixels so a phone and a desktop both fill. */
const burst = (reach: number): Bit[] => {
  const rand = seeded(9157)
  return Array.from({ length: 46 }, (_, i) => {
    const angle = rand() * Math.PI * 2
    const distance = reach * (0.3 + rand() * 0.7)
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.7,
      fall: reach * (0.35 + rand() * 0.45),
      spin: (rand() - 0.5) * 1080,
      delay: 0.18 + rand() * 0.18,
      size: 7 + rand() * 9,
      shape: (['chip', 'dot', 'strip'] as const)[i % 3],
      color: BIT_COLORS[i % BIT_COLORS.length],
    }
  })
}

/**
 * How the banner arrives. A win sweeps in fast; a loss drops like a weight
 * and lands; a draw opens from the middle once the two sides have met.
 */
const BAND: Record<OutcomeTone, { initial: TargetAndTransition; animate: TargetAndTransition; transition: Transition }> = {
  win: {
    initial: { clipPath: 'inset(0% 100% 0% 0%)' },
    animate: { clipPath: 'inset(0% 0% 0% 0%)' },
    transition: { duration: 0.42, ease: [0.2, 0.8, 0.2, 1], delay: 0.08 },
  },
  loss: {
    initial: { y: '-75vh' },
    animate: { y: '0vh' },
    // Accelerates all the way down, so it hits rather than glides.
    transition: { duration: 0.42, ease: [0.6, 0, 1, 0.6] },
  },
  draw: {
    initial: { clipPath: 'inset(0% 50% 0% 50%)' },
    animate: { clipPath: 'inset(0% 0% 0% 0%)' },
    transition: { duration: 0.5, ease: [0.3, 0.7, 0.2, 1], delay: 0.45 },
  },
}

const LANDING_S = 0.42

/**
 * The moment a game ends, before the summary opens: a banner across the
 * screen with the result, staged differently for each outcome.
 *
 * - Win: rays and a ring burst from the centre, the pieces of both sides fly
 *   out as confetti, and the letters of the title spring into place.
 * - Loss: the screen darkens at the edges, the banner falls and lands with a
 *   shake and a puff of dust, and after a beat its last letter droops.
 * - Draw: one piece of each side slides in from opposite edges, they knock
 *   together and settle side by side, and the banner opens from the middle.
 *
 * It closes on its own after about three seconds, or at once on a click, tap,
 * Enter or Escape. With reduced motion only the fades remain.
 */
export default function OutcomeSplash({ tone, title, reason, onDone }: OutcomeSplashProps) {
  const reducedMotion = useReducedMotion() ?? false
  const lively = !reducedMotion
  const skip = useRef<HTMLButtonElement>(null)
  const describedBy = useId()
  // Measured once, so the burst and the sliding pieces start just off screen whatever its size.
  const [screen] = useState(() => ({ reach: Math.min(window.innerWidth, window.innerHeight) * 0.62, width: window.innerWidth }))
  const [bits] = useState(() => (tone === 'win' ? burst(screen.reach) : []))

  useEffect(() => {
    skip.current?.focus({ preventScroll: true })
    const handle = window.setTimeout(onDone, reducedMotion ? REDUCED_LENGTH_MS : LENGTH_MS[tone])
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(handle)
      window.removeEventListener('keydown', onKey)
    }
  }, [onDone, reducedMotion, tone])

  const letters = Array.from(title)
  const lastLetter = letters.length - 1
  const band = BAND[tone]

  return createPortal(
    <motion.div
      className={`outcome outcome--${tone}`}
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="outcome__veil"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: tone === 'loss' ? 0.8 : 0.35 }}
      />

      {lively && tone === 'win' && <WinBurst bits={bits} />}

      <motion.div
        className="outcome__stage"
        aria-hidden
        animate={lively && tone === 'loss' ? { x: [0, -14, 11, -7, 4, 0] } : undefined}
        transition={{ delay: LANDING_S, duration: 0.45 }}
      >
        {lively && tone === 'draw' && <DrawClack width={screen.width} />}

        <div className="outcome__band-wrap">
          <motion.div
            className="outcome__band"
            initial={lively ? band.initial : { opacity: 0 }}
            animate={lively ? band.animate : { opacity: 1 }}
            transition={lively ? band.transition : { duration: 0.3 }}
          >
            {/* A landing squashes the banner for a moment, like a dropped weight. */}
            <motion.div
              className="outcome__band-body"
              animate={lively && tone === 'loss' ? { scaleY: [1, 0.78, 1.06, 1], scaleX: [1, 1.04, 0.99, 1] } : undefined}
              transition={{ delay: LANDING_S, duration: 0.38 }}
            >
              <p className="outcome__title">
                {letters.map((letter, index) => (
                  <Letter
                    key={index}
                    letter={letter}
                    index={index}
                    count={letters.length}
                    tone={tone}
                    lively={lively}
                    last={index === lastLetter}
                  />
                ))}
              </p>
              <motion.p
                className="outcome__reason"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: tone === 'win' ? 0.7 : tone === 'loss' ? 0.85 : 0.95, duration: 0.4 }}
              >
                {reason}
              </motion.p>
            </motion.div>
            {lively && tone === 'win' && (
              <motion.span
                className="outcome__sheen"
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ delay: 0.85, duration: 0.9, ease: 'easeInOut' }}
              />
            )}
          </motion.div>
          {lively && tone === 'loss' && <Dust />}
        </div>
      </motion.div>

      <span id={describedBy} className="visually-hidden">
        {title}. {reason}
      </span>
      <motion.button
        ref={skip}
        type="button"
        className="outcome__skip"
        aria-describedby={describedBy}
        onClick={(event) => {
          event.stopPropagation()
          onDone()
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.3 }}
      >
        Continue
      </motion.button>
    </motion.div>,
    document.body,
  )
}

interface LetterProps {
  letter: string
  index: number
  count: number
  tone: OutcomeTone
  lively: boolean
  last: boolean
}

function Letter({ letter, index, count, tone, lively, last }: LetterProps) {
  const text = letter === ' ' ? ' ' : letter
  if (!lively) return <span className="outcome__letter">{text}</span>

  if (tone === 'win') {
    return (
      <motion.span
        className="outcome__letter"
        initial={{ opacity: 0, y: '-0.45em', scale: 2.3, rotate: index % 2 === 0 ? -16 : 14 }}
        animate={{ opacity: 1, y: '0em', scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 480, damping: 15, delay: 0.22 + index * 0.05 }}
      >
        {text}
      </motion.span>
    )
  }

  if (tone === 'loss') {
    // The banner lands whole; a moment later its last letter comes loose and hangs.
    return (
      <motion.span
        className="outcome__letter"
        style={last ? { transformOrigin: '12% 88%' } : undefined}
        animate={last ? { rotate: 17, y: '0.05em' } : undefined}
        transition={{ type: 'spring', stiffness: 70, damping: 6, delay: 1.15 }}
      >
        {text}
      </motion.span>
    )
  }

  // Draw: each half of the word comes from its own side and they meet in the middle.
  const fromLeft = index < count / 2
  return (
    <motion.span
      className="outcome__letter"
      initial={{ opacity: 0, x: fromLeft ? '-1.1em' : '1.1em' }}
      animate={{ opacity: 1, x: '0em' }}
      transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.5 }}
    >
      {text}
    </motion.span>
  )
}

function WinBurst({ bits }: { bits: Bit[] }) {
  return (
    <div className="outcome__burst" aria-hidden>
      <motion.div
        className="outcome__rays"
        initial={{ scale: 0.2, rotate: -40, opacity: 0 }}
        animate={{ scale: 1, rotate: 25, opacity: 1 }}
        transition={{
          scale: { type: 'spring', stiffness: 110, damping: 14, delay: 0.1 },
          rotate: { duration: 3, ease: 'linear' },
          opacity: { duration: 0.4, delay: 0.1 },
        }}
      />
      {[0, 0.16].map((delay) => (
        <motion.span
          key={delay}
          className="outcome__ring"
          initial={{ scale: 0.1, opacity: 0.9 }}
          animate={{ scale: 5, opacity: 0 }}
          transition={{ duration: 1.1, delay: 0.12 + delay, ease: [0.1, 0.7, 0.3, 1] }}
        />
      ))}
      {bits.map((bit) => (
        <motion.span
          key={bit.id}
          className={`outcome__bit is-${bit.shape}`}
          style={{ width: bit.size, height: bit.shape === 'strip' ? bit.size * 0.4 : bit.size, backgroundColor: bit.color }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.4 }}
          animate={{
            x: [0, bit.x, bit.x * 1.1],
            y: [0, bit.y, bit.y + bit.fall],
            rotate: [0, bit.spin * 0.5, bit.spin],
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1, 1, 0.7],
          }}
          transition={{
            duration: 2.4,
            delay: bit.delay,
            times: [0, 0.28, 1],
            ease: ['easeOut', 'easeIn'],
            opacity: { duration: 2.4, delay: bit.delay, times: [0, 0.06, 0.75, 1] },
            scale: { duration: 2.4, delay: bit.delay, times: [0, 0.28, 0.75, 1] },
          }}
        />
      ))}
    </div>
  )
}

/** One piece of each side, sliding in from opposite edges until they knock together. */
function DrawClack({ width }: { width: number }) {
  const start = width * 0.6
  const disc = (side: -1 | 1) => (
    <motion.span
      className={`outcome__disc ${side < 0 ? 'is-p1' : 'is-p2'}`}
      initial={{ x: side * start }}
      animate={{ x: [side * start, side * 26, side * 44, side * 30] }}
      transition={{ duration: 0.85, times: [0, 0.5, 0.72, 1], ease: ['easeIn', 'easeOut', 'easeInOut'] }}
    />
  )
  return (
    <div className="outcome__clack" aria-hidden>
      <motion.span
        className="outcome__ring is-small"
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 2.6], opacity: [0, 0.8, 0] }}
        transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
      />
      {disc(-1)}
      {disc(1)}
    </div>
  )
}

/** Puffs thrown out sideways where the banner lands. */
function Dust() {
  return (
    <div className="outcome__dust" aria-hidden>
      {([-1, 1] as const).flatMap((side) =>
        [0, 1, 2].map((k) => (
          <motion.span
            key={`${side}${k}`}
            className="outcome__puff"
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0.6, 0], x: side * (70 + k * 60), y: -12 - k * 8, scale: [0.4, 1.3 + k * 0.25] }}
            transition={{ delay: LANDING_S + k * 0.03, duration: 0.8, ease: 'easeOut' }}
          />
        )),
      )}
    </div>
  )
}
