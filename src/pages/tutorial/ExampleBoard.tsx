import { ChevronRight, Play, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import BoardView from '../../components/board/BoardView'
import { Button } from '../../components/ui/Button'
import { useSideNames, useTheme } from '../../context/useTheme'
import { canCall } from '../../game/engine'
import type { EngineState } from '../../game/types'
import { useBoardAnimations } from '../../hooks/useBoardAnimations'
import { initialPosition, playStep } from './script'
import type { ExampleSpec } from './script'

const STEP_MS = 1400

/** Captions mention sides as {p1}/{p2}, so they follow the theme's names ("Red" or "Black"). */
const fill = (text: string, names: Record<'player1' | 'player2', string>) =>
  text.replaceAll('{p1}', names.player1).replaceAll('{p2}', names.player2)

/**
 * A small board that plays a scripted example through the real engine. Step
 * through it, play it automatically, or restart. If a step were ever illegal
 * the engine would refuse it and the caption says so, instead of animating a
 * move the rules do not allow.
 */
export default function ExampleBoard({ spec, label }: { spec: ExampleSpec; label: string }) {
  const { theme } = useTheme()
  const names = useSideNames()
  const [state, setState] = useState<EngineState>(() => initialPosition(spec))
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const animations = useBoardAnimations(theme.motion.captureDurationMs)
  const done = step >= spec.steps.length || problem !== null

  const advance = () => {
    const next = spec.steps[step]
    if (!next) return
    const result = playStep(state, next)
    if (result.error) {
      setProblem(result.error)
      setPlaying(false)
      return
    }
    setState(result.state)
    animations.ingest(result.events)
    setStep(step + 1)
  }

  const restart = () => {
    setState(initialPosition(spec))
    setStep(0)
    setProblem(null)
    setPlaying(false)
    animations.reset()
  }

  useEffect(() => {
    if (!playing || done) return
    const handle = window.setTimeout(advance, STEP_MS)
    return () => window.clearTimeout(handle)
  })

  const caption = problem
    ? `This example could not continue: ${problem}`
    : fill(step === 0 ? spec.intro : spec.steps[step - 1].caption, names)

  return (
    <figure className="example">
      <div className="example__board">
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
          label={label}
          hideEndSequence
        />
      </div>
      <figcaption className="example__caption" aria-live="polite">
        <span className="example__count">
          Step {step} of {spec.steps.length}
        </span>
        {caption}
      </figcaption>
      <div className="example__controls">
        <Button size="sm" icon={<ChevronRight size={15} />} onClick={advance} disabled={done}>
          Next step
        </Button>
        <Button size="sm" variant="primary" icon={<Play size={15} />} onClick={() => setPlaying(true)} disabled={done || playing}>
          Play
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw size={15} />} onClick={restart} disabled={step === 0 && !problem}>
          Restart
        </Button>
      </div>
    </figure>
  )
}
