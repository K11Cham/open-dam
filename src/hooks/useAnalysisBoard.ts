import { useCallback, useMemo, useState } from 'react'
import { applyAction, canCall, createInitialState, destinationsFor } from '../game/engine'
import type { Destinations } from '../game/engine'
import { makeEmptyBoard } from '../game/board'
import { toMoveRows } from '../game/notation'
import { boardTypeForSize } from '../game/settings'
import type { BoardSize, Coord, EngineAction, EngineState, GameEvent, GameStatus, PieceData, PlayerId } from '../game/types'

const PLAYING: GameStatus = { kind: 'playing' }
const NO_DESTINATIONS: Destinations = { slides: [], captures: [] }
const same = (a: Coord | null, b: Coord | null) => !!a && !!b && a.row === b.row && a.col === b.col

/**
 * Whether `later` was reached by playing on from `earlier`. Editing the
 * position (placing pieces, changing the side to move, loading a code) starts
 * a new line with an empty move list, while playing only ever keeps or grows
 * it: a move or call adds a record, and ending a chain rewrites the last one.
 */
const continues = (earlier: EngineState, later: EngineState) =>
  later.moves.length > 0 && later.moves.length >= earlier.moves.length

/** An empty board of the given size, ready for setting up a position. */
export const emptyAnalysisPosition = (size: BoardSize): EngineState => {
  const base = createInitialState({ boardSize: size, boardType: boardTypeForSize(size) })
  return { ...base, board: makeEmptyBoard(size), isFirstMove: false, positionCounts: {} }
}

let paintCounter = 0

/**
 * The analysis board: set up any position, then play either side under the
 * real rules. Results are reported but never stop play — a position where one
 * side has no pieces is something to study, not a finished game.
 */
export function useAnalysisBoard(onEvents: (events: GameEvent[]) => void, notify: (message: string) => void) {
  const [past, setPast] = useState<EngineState[]>([])
  const [position, setPosition] = useState<EngineState>(() => emptyAnalysisPosition(5))
  const [future, setFuture] = useState<EngineState[]>([])
  const [selected, setSelected] = useState<Coord | null>(null)
  /** The result the last action would have produced in a real game. */
  const [verdict, setVerdict] = useState<GameStatus>(PLAYING)

  const commit = useCallback(
    (next: EngineState, keepHistory = true) => {
      if (keepHistory) setPast((p) => [...p, position].slice(-300))
      setFuture([])
      setPosition(next)
    },
    [position],
  )

  const act = useCallback(
    (action: EngineAction) => {
      const result = applyAction(position, action)
      if (result.error) {
        notify(result.error)
        return false
      }
      setVerdict(result.state.status)
      commit({ ...result.state, status: PLAYING })
      onEvents(result.events)
      setSelected(result.state.chain.active ? result.state.chain.at : null)
      return true
    },
    [position, commit, onEvents, notify],
  )

  const destinations = useMemo(() => (selected ? destinationsFor(position, selected) : NO_DESTINATIONS), [position, selected])

  const onSquare = useCallback(
    (coord: Coord) => {
      const piece = position.board[coord.row]?.[coord.col]
      if (piece && canCall(position) && position.offenders.some((o) => o.pieceId === piece.id)) {
        act({ type: 'call', pieceId: piece.id })
        return
      }
      if (piece && piece.player === position.currentPlayer) {
        setSelected((prev) => (same(prev, coord) && !position.chain.active ? null : coord))
        return
      }
      if (selected && [...destinations.slides, ...destinations.captures].some((d) => same(d, coord))) {
        act({ type: 'move', from: selected, to: coord })
        return
      }
      if (!position.chain.active) setSelected(null)
    },
    [position, selected, destinations, act],
  )

  const paint = useCallback(
    (coord: Coord, piece: Omit<PieceData, 'id'> | null) => {
      const board = position.board.map((row) => row.slice())
      const current = board[coord.row][coord.col]
      // Painting the same piece again clears the square, so one brush can toggle.
      const sameAsCurrent = current && piece && current.player === piece.player && current.isKing === piece.isKing
      board[coord.row][coord.col] = piece && !sameAsCurrent ? { ...piece, id: `paint-${paintCounter++}` } : null
      commit({
        ...position,
        board,
        offenders: [],
        chain: { active: false, at: null, pendingPromotionPieceId: null, legs: [] },
        positionCounts: {},
        moves: [],
      })
      setVerdict(PLAYING)
      setSelected(null)
    },
    [position, commit],
  )

  const load = useCallback(
    (next: EngineState) => {
      commit({ ...next, status: PLAYING, moves: [] })
      setVerdict(PLAYING)
      setSelected(null)
    },
    [commit],
  )

  const setTurn = useCallback(
    (player: PlayerId) => {
      commit({
        ...position,
        currentPlayer: player,
        offenders: [],
        moves: [],
        chain: { active: false, at: null, pendingPromotionPieceId: null, legs: [] },
      })
      setSelected(null)
    },
    [position, commit],
  )

  const undo = useCallback(() => {
    if (past.length === 0) return
    setFuture((f) => [position, ...f])
    setPosition(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
    setSelected(null)
    setVerdict(PLAYING)
  }, [past, position])

  const redo = useCallback(() => {
    if (future.length === 0) return
    setPast((p) => [...p, position])
    setPosition(future[0])
    setFuture((f) => f.slice(1))
    setSelected(null)
  }, [future, position])

  // The line being studied: the stretch of history around the current
  // position that was reached by playing moves, including any redo steps.
  const timeline = useMemo(() => [...past, position, ...future], [past, position, future])
  const current = past.length
  const line = useMemo(() => {
    let start = current
    while (start > 0 && continues(timeline[start - 1], timeline[start])) start--
    let end = current
    while (end < timeline.length - 1 && continues(timeline[end], timeline[end + 1])) end++
    return { start, end }
  }, [timeline, current])

  const jumpTo = useCallback(
    (index: number) => {
      if (index === current || index < 0 || index >= timeline.length) return
      setPast(timeline.slice(0, index))
      setPosition(timeline[index])
      setFuture(timeline.slice(index + 1))
      setSelected(null)
      setVerdict(PLAYING)
    },
    [timeline, current],
  )

  const lineMoves = timeline[line.end].moves
  const moveList = {
    moveRows: toMoveRows(lineMoves),
    viewIndex: position.moves.length,
    lastIndex: lineMoves.length,
    totalMoves: lineMoves.length,
    reviewing: current < line.end,
    indexAfterPly: (ply: number) => ply + 1,
    goTo: (count: number | null) => {
      if (count === null) return jumpTo(line.end)
      // The last state in the line with that many moves (ending a chain does
      // not add a move, so two states can share a count).
      for (let i = line.end; i >= line.start; i--) {
        if (timeline[i].moves.length <= Math.max(0, count)) return jumpTo(i)
      }
    },
  }

  return {
    moveList,
    position,
    selected,
    destinations,
    verdict,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    onSquare,
    act,
    paint,
    load,
    setTurn,
    undo,
    redo,
    deselect: () => setSelected(null),
  }
}
