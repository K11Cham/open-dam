import { useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { DIFFICULTIES } from '../../ai/difficulty'
import { chooseAction } from '../../ai/search'
import { useSideNames, useTheme } from '../../context/useTheme'
import { applyAction, canCall, createInitialState } from '../../game/engine'
import type { EngineState } from '../../game/types'
import { useBoardAnimations } from '../../hooks/useBoardAnimations'
import BoardView from './BoardView'

const STEP_MS = 1500
const RESTART_MS = 3500
const MAX_PLIES = 90

const fresh = () => createInitialState({ boardSize: 5 })

/** A quick, slightly varied player, so the demo is lively and never repeats exactly. */
const demoOptions = () => {
  const tier = DIFFICULTIES.khale
  return {
    depth: 3,
    profile: tier.profile,
    timeBudgetMs: 40,
    quiescenceDepth: 2,
    noise: 45,
    blunderChance: 0,
    callAware: true,
  }
}

/**
 * The home page's live board: the computer playing itself on the classic 5×5,
 * through the real engine and the theme's real pieces. It only runs while it
 * is on screen and the tab is visible, and not at all for people who prefer
 * reduced motion (they see the starting position).
 */
export default function DemoBoard() {
  const { theme } = useTheme()
  const names = useSideNames()
  const reducedMotion = useReducedMotion()
  const [state, setState] = useState<EngineState>(fresh)
  const [visible, setVisible] = useState(false)
  const [tick, setTick] = useState(0)
  const animations = useBoardAnimations(theme.motion.captureDurationMs)
  const { ingest, reset } = animations
  const frame = useRef<HTMLDivElement>(null)
  const running = visible && !reducedMotion

  useEffect(() => {
    const element = frame.current
    // No IntersectionObserver (old browsers, tests): stay still.
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!running) return
    const over = state.status.kind !== 'playing' || state.moves.length >= MAX_PLIES
    const handle = window.setTimeout(
      () => {
        if (document.hidden) {
          setTick(tick + 1)
          return
        }
        if (over) {
          reset()
          setState(fresh())
          return
        }
        const choice = chooseAction(state, demoOptions())
        if (!choice) {
          setState(fresh())
          return
        }
        const result = applyAction(state, choice.action)
        ingest(result.events)
        setState(result.state)
      },
      over ? RESTART_MS : STEP_MS,
    )
    return () => window.clearTimeout(handle)
  }, [running, state, tick, ingest, reset])

  const last = state.moves.at(-1)
  const caption =
    state.status.kind !== 'playing'
      ? 'Game over. A new one starts in a moment.'
      : last
        ? `Move ${state.moves.length}: ${names[last.player]} ${last.notation}`
        : 'The computer plays itself here. Pieces move straight, never diagonally.'

  return (
    <figure className="demo" ref={frame}>
      <BoardView
        position={state}
        orientation="player1"
        selected={null}
        destinations={{ slides: [], captures: [] }}
        offenderIds={new Set(canCall(state) ? state.offenders.map((o) => o.pieceId) : [])}
        animations={animations.animations}
        promotedIds={animations.promotedIds}
        lastMove={animations.lastMove}
        onAnimationComplete={animations.complete}
        interactive={false}
        canDragFrom={() => false}
        onSquare={() => {}}
        onDrop={() => {}}
        perspective={null}
        sideNames={names}
        label="A demonstration game on a 5 by 5 board"
        showCoordinates={false}
        hideEndSequence
      />
      <figcaption className="demo__caption">
        <span className="demo__live" aria-hidden={!running}>
          {running ? 'Live demo' : 'Starting position'}
        </span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  )
}
