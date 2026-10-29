import { Check, Eye, Lightbulb, Megaphone, RotateCcw, SkipForward } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cueForStep } from '../../audio/cues'
import BoardView from '../../components/board/BoardView'
import { Button } from '../../components/ui/Button'
import { useSound } from '../../context/useSound'
import { useSideNames, useTheme } from '../../context/useTheme'
import { applyAction, canCall, destinationsFor } from '../../game/engine'
import type { Coord, EngineAction, EngineState, GameEvent } from '../../game/types'
import { useBoardAnimations } from '../../hooks/useBoardAnimations'
import { puzzleProgress, useSolvedPuzzles } from './progress'
import { explanationFor, judge, puzzleStart } from './puzzle'
import type { PuzzleSpec } from './puzzle'
import { parseStep } from './script'

/** Pause before {p2}'s scripted moves, so the reader sees their own move land first. */
const REPLY_MS = 850

const fill = (text: string, names: Record<'player1' | 'player2', string>) =>
  text.replaceAll('{p1}', names.player1).replaceAll('{p2}', names.player2)

/**
 * 'play': the reader's move. 'auto': scripted moves are playing out.
 * 'wrong': a wrong move was played and the board waits for Try again.
 * 'solved' and 'shown': the puzzle is over, by the reader or by "Show me".
 */
type Phase = 'play' | 'auto' | 'wrong' | 'solved' | 'shown'
type Tone = 'goal' | 'right' | 'wrong' | 'solved'

interface Queue {
  steps: string[]
  /** What happens once the queue is empty. */
  then: { phase: Phase; turn?: number; message?: string; tone?: Tone; solvedWith?: string }
}

/**
 * A lesson board the reader plays on. Moves go through the real engine; each
 * one is judged against the puzzle (puzzle.ts). Right moves get praise and
 * {p2}'s scripted answer; tempting mistakes are explained and then punished
 * on the board, because seeing the capture land teaches more than a sentence.
 */
export default function PuzzleBoard({ spec, label }: { spec: PuzzleSpec; label: string }) {
  const { theme } = useTheme()
  const names = useSideNames()
  const sound = useSound()
  const solvedIds = useSolvedPuzzles()
  const animations = useBoardAnimations(theme.motion.captureDurationMs)
  const [state, setState] = useState<EngineState>(() => puzzleStart(spec))
  const [turn, setTurn] = useState(0)
  const [phase, setPhase] = useState<Phase>('play')
  const [message, setMessage] = useState({ text: spec.goal, tone: 'goal' as Tone })
  const [showHint, setShowHint] = useState(false)
  const [selected, setSelected] = useState<Coord | null>(null)
  const [queue, setQueue] = useState<Queue | null>(null)
  const solvedBefore = solvedIds.includes(spec.id)

  const show = (events: GameEvent[]) => {
    animations.ingest(events)
    const cue = cueForStep(events, [], ['player1'], { endings: false })
    if (cue) sound.play(cue)
  }

  const say = (text: string, tone: Tone) => setMessage({ text, tone })

  const finish = (praise: string) => {
    say(`${praise} ${fill(spec.solved, names)}`, 'solved')
    setPhase('solved')
    sound.play('win')
    puzzleProgress.markSolved(spec.id)
  }

  // Scripted moves ({p2}'s replies, punishments, "Show me") play one at a time.
  useEffect(() => {
    if (!queue) return
    const handle = window.setTimeout(() => {
      const [step, ...rest] = queue.steps
      if (step !== undefined) {
        const action = parseStep(step, state)
        const result = typeof action === 'string' ? null : applyAction(state, action)
        if (result && !result.error) {
          setState(result.state)
          show(result.events)
        }
      }
      if (rest.length > 0) {
        setQueue({ ...queue, steps: rest })
        return
      }
      setQueue(null)
      if (queue.then.solvedWith !== undefined) {
        finish(queue.then.solvedWith)
        return
      }
      setPhase(queue.then.phase)
      if (queue.then.turn !== undefined) setTurn(queue.then.turn)
      if (queue.then.message) say(queue.then.message, queue.then.tone ?? 'goal')
    }, REPLY_MS)
    return () => window.clearTimeout(handle)
  })

  const attempt = (action: EngineAction) => {
    if (phase !== 'play') return
    const current = spec.turns[turn]
    const result = applyAction(state, action)
    if (result.error) {
      sound.play('illegal')
      say(result.error, 'wrong')
      return
    }
    setSelected(null)
    setState(result.state)
    show(result.events)

    const verdict = judge(spec, current, state, action, result.state)
    if (verdict.kind === 'right') {
      const last = turn === spec.turns.length - 1
      // A right answer with its own explanation says why it works, then plays
      // out the line that proves it before the puzzle counts as solved.
      const explained = explanationFor(current, state, action)
      if (explained && last) {
        const text = fill(explained.text, names)
        if (!explained.line?.length) {
          finish(text)
          return
        }
        setPhase('auto')
        say(text, 'right')
        setQueue({ steps: explained.line, then: { phase: 'solved', solvedWith: text } })
        return
      }
      if (current.reply) {
        setPhase('auto')
        say(fill(current.praise, names), 'right')
        setQueue({
          steps: [current.reply],
          then: { phase: 'play', turn: turn + 1, message: current.then && fill(current.then, names), tone: 'goal' },
        })
      } else if (last && !result.state.chain.active) {
        finish(fill(current.praise, names))
      } else {
        setTurn(turn + 1)
        say(fill(current.praise, names), 'right')
      }
      return
    }

    setPhase(verdict.kind === 'mistake' && verdict.mistake.punish?.length ? 'auto' : 'wrong')
    if (verdict.kind === 'mistake') {
      const opener = verdict.mistake.playable ? 'Playable, but not the strongest.' : 'Not quite.'
      say(`${opener} ${fill(verdict.mistake.why, names)}`, 'wrong')
      if (verdict.mistake.punish?.length) {
        setQueue({ steps: verdict.mistake.punish, then: { phase: 'wrong' } })
      }
    } else {
      say(`That is legal, but it is not the move here. ${fill(spec.hint, names)}`, 'wrong')
    }
  }

  const reset = () => {
    setQueue(null)
    setState(puzzleStart(spec))
    setTurn(0)
    setPhase('play')
    setSelected(null)
    animations.reset()
    say(fill(spec.goal, names), 'goal')
  }

  const showMe = () => {
    reset()
    const line = spec.turns.flatMap((t) => {
      const shown = t.explain?.[t.accept[0]]?.line ?? (t.reply ? [t.reply] : [])
      return [t.accept[0], ...shown]
    })
    setPhase('auto')
    say('Watch.', 'goal')
    setQueue({
      steps: line,
      then: { phase: 'shown', message: `${fill(spec.solved, names)} Now try it yourself.`, tone: 'right' },
    })
  }

  const playing = phase === 'play' && state.currentPlayer === 'player1'
  // Mid-chain only the chain piece may move, so keep it selected for the reader.
  const active = state.chain.active ? state.chain.at : selected
  const destinations = playing && active ? destinationsFor(state, active) : { slides: [], captures: [] }
  const isDestination = (c: Coord) =>
    [...destinations.slides, ...destinations.captures].some((d) => d.row === c.row && d.col === c.col)

  const onSquare = (c: Coord) => {
    if (!playing) return
    if (active && isDestination(c)) {
      attempt({ type: 'move', from: active, to: c })
      return
    }
    if (state.chain.active) return
    setSelected(state.board[c.row][c.col]?.player === 'player1' ? c : null)
  }

  const canDragFrom = (c: Coord) =>
    playing &&
    state.board[c.row][c.col]?.player === 'player1' &&
    (!state.chain.active || (state.chain.at?.row === c.row && state.chain.at?.col === c.col))

  const text = message.tone === 'goal' ? fill(message.text, names) : message.text
  const over = phase === 'solved' || phase === 'shown'

  return (
    <figure className="example puzzle">
      <div className="example__board">
        <BoardView
          position={state}
          orientation="player1"
          selected={playing ? active : null}
          destinations={destinations}
          offenderIds={new Set(canCall(state) ? state.offenders.map((o) => o.pieceId) : [])}
          animations={animations.animations}
          promotedIds={animations.promotedIds}
          lastMove={animations.lastMove}
          onAnimationComplete={animations.complete}
          interactive={playing}
          canDragFrom={canDragFrom}
          onSquare={onSquare}
          onDrop={(from, to) => attempt({ type: 'move', from, to })}
          onEscape={() => setSelected(null)}
          perspective={null}
          sideNames={names}
          label={label}
          hideEndSequence
        />
      </div>
      <figcaption className={`example__caption puzzle__status is-${message.tone}`} aria-live="polite">
        <span className="puzzle__tag">
          {phase === 'solved' ? (
            <>
              <Check size={13} aria-hidden="true" /> Solved
            </>
          ) : (
            <>
              Your turn
              {solvedBefore && (
                <span className="puzzle__count">
                  {' '}
                  · <Check size={12} aria-hidden="true" /> solved before
                </span>
              )}
            </>
          )}
          {spec.turns.length > 1 && !over && (
            <span className="puzzle__count">
              {' '}
              · move {Math.min(turn + 1, spec.turns.length)} of {spec.turns.length}
            </span>
          )}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={text}
            className="puzzle__message"
            initial={{ opacity: 0, y: 6, scale: message.tone === 'solved' ? 0.96 : 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
        {showHint && phase === 'play' && <span className="puzzle__hint">{fill(spec.hint, names)}</span>}
      </figcaption>
      <div className="example__controls">
        {playing && canCall(state) && (
          <Button size="sm" variant="primary" icon={<Megaphone size={15} />} onClick={() => attempt({ type: 'call' })}>
            Call
          </Button>
        )}
        {playing && state.chain.active && (
          <Button size="sm" icon={<SkipForward size={15} />} onClick={() => attempt({ type: 'end-chain' })}>
            End turn
          </Button>
        )}
        {phase === 'play' && !showHint && (
          <Button size="sm" variant="ghost" icon={<Lightbulb size={15} />} onClick={() => setShowHint(true)}>
            Hint
          </Button>
        )}
        {(phase === 'wrong' || over || turn > 0) && (
          <Button size="sm" variant={phase === 'wrong' ? 'primary' : 'secondary'} icon={<RotateCcw size={15} />} onClick={reset}>
            {over ? 'Play again' : 'Try again'}
          </Button>
        )}
        {phase !== 'auto' && phase !== 'solved' && (
          <Button size="sm" variant="ghost" icon={<Eye size={15} />} onClick={showMe}>
            Show me
          </Button>
        )}
      </div>
    </figure>
  )
}
