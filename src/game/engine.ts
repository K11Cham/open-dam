import {
  cloneBoard,
  countPieces,
  findPiece,
  makeInitialBoard,
  opponentOf,
  piecesOf,
  promotionRow,
  serializePosition,
} from './board'
import { classifyMove, getCaptures, getCapturesFrom, hasAnyLegalMove } from './moves'
import { DRAW_NOTATION, formatCall, formatMove, formatResign } from './notation'
import { makeSettings, resolvePromotionPolicy } from './settings'
import type {
  Board,
  Coord,
  DrawReason,
  EngineResult,
  EngineState,
  GameEvent,
  MoveRecord,
  Offender,
  PieceData,
  PlayerId,
  ResolvedPromotionPolicy,
  RuleSettings,
} from './types'

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export const createInitialState = (
  partialSettings: Partial<RuleSettings> = {},
  opponentPromotionPolicy?: ResolvedPromotionPolicy,
): EngineState => {
  const settings = makeSettings(partialSettings)
  const { board, nextPieceId } = makeInitialBoard(settings.boardSize, settings.boardType)

  // ONLINE HOOK: `opponentPromotionPolicy` is what a real lobby would pass down
  // once online play exists, so a "match opponent" player adopts the other
  // side's rule. Offline it is undefined and we fall back to the default.
  const resolved = resolvePromotionPolicy(settings.promotionPolicy, opponentPromotionPolicy)

  const state: EngineState = {
    settings: { ...settings, promotionPolicy: resolved },
    board,
    currentPlayer: 'player1',
    status: { kind: 'playing' },
    chain: { active: false, at: null, pendingPromotionPieceId: null, legs: [] },
    offenders: [],
    moves: [],
    positionCounts: { [serializePosition(board, 'player1')]: 1 },
    pliesSinceCapture: 0,
    isFirstMove: true,
    clock: settings.timeControl
      ? {
          player1Ms: settings.timeControl.initialMs,
          player2Ms: settings.timeControl.initialMs,
          running: null,
          lastTickAt: null,
        }
      : null,
    nextPieceId,
  }
  return state
}

/** An empty board with the same rules, used by the analysis page. */
export const createAnalysisState = (partialSettings: Partial<RuleSettings> = {}): EngineState => {
  const state = createInitialState(partialSettings)
  return {
    ...state,
    board: state.board.map((row) => row.map(() => null)),
    positionCounts: {},
    isFirstMove: false,
    clock: null,
  }
}

const ok = (state: EngineState, events: GameEvent[]): EngineResult => ({ state, events })
const reject = (state: EngineState, reason: string): EngineResult => ({
  state,
  events: [{ type: 'illegal', reason }],
  error: reason,
})

// ---------------------------------------------------------------------------
// Shared board maintenance
// ---------------------------------------------------------------------------

/**
 * A player reduced to a single piece has it crowned immediately. This is not a
 * toggle, and it deliberately outranks the deferred-promotion policy: if your
 * last piece is mid-chain with a crown pending, auto-king grants it now.
 */
const applyAutoKing = (board: Board, events: GameEvent[]): string[] => {
  const promotedIds: string[] = []
  for (const player of ['player1', 'player2'] as PlayerId[]) {
    const pieces = piecesOf(board, player)
    if (pieces.length !== 1) continue
    const only = pieces[0]
    if (only.piece.isKing) continue
    board[only.at.row][only.at.col] = { ...only.piece, isKing: true }
    promotedIds.push(only.piece.id)
    events.push({ type: 'auto-king', player, pieceId: only.piece.id, at: only.at })
  }
  return promotedIds
}

const reachedPromotionRow = (piece: PieceData, to: Coord, gridSize: number): boolean =>
  !piece.isKing && to.row === promotionRow(piece.player, gridSize)

/**
 * Terminal conditions, checked after every board change.
 *
 * KEPT ALONGSIDE THE 1v1 TIE RULE: threefold repetition and the no-capture
 * counter. The 1v1 rule only fires in the exact position where both sides have
 * a single piece, which leaves every other shuffling endgame (two kings vs one,
 * kings circling on a 9x9) with no way to end. Since captures are optional
 * here, a player who is behind can decline forever, so without these two the
 * game has a real non-termination hole. Both are settings-driven, so anyone who
 * wants the narrower rule set can switch them off in the pre-game panel.
 */
const evaluateStatus = (state: EngineState): { reason: DrawReason | null; winner: PlayerId | null } => {
  if (countPieces(state.board, 'player1') === 0) return { reason: null, winner: 'player2' }
  if (countPieces(state.board, 'player2') === 0) return { reason: null, winner: 'player1' }

  const p1 = countPieces(state.board, 'player1')
  const p2 = countPieces(state.board, 'player2')
  if (p1 === 1 && p2 === 1) {
    const anyCapture =
      getCaptures(state.board, 'player1').length > 0 || getCaptures(state.board, 'player2').length > 0
    // A pending call counts as "something still to play", same as a capture.
    if (!anyCapture && state.offenders.length === 0) {
      return { reason: 'one-each-stalemate', winner: null }
    }
  }

  const { draw } = state.settings
  if (draw.threefoldRepetition) {
    const key = serializePosition(state.board, state.currentPlayer)
    if ((state.positionCounts[key] ?? 0) >= 3) return { reason: 'threefold', winner: null }
  }
  if (draw.pliesWithoutCapture !== null && state.pliesSinceCapture >= draw.pliesWithoutCapture) {
    return { reason: 'no-captures', winner: null }
  }
  return { reason: null, winner: null }
}

const settleStatus = (state: EngineState, events: GameEvent[]): EngineState => {
  if (state.status.kind !== 'playing') return state
  const { reason, winner } = evaluateStatus(state)
  if (winner) {
    events.push({ type: 'win', winner, reason: 'no-pieces' })
    return { ...state, status: { kind: 'win', winner, reason: 'no-pieces' } }
  }
  if (reason) {
    events.push({ type: 'tie', reason })
    return { ...state, status: { kind: 'draw', reason } }
  }
  return state
}

// ---------------------------------------------------------------------------
// Calling
// ---------------------------------------------------------------------------

/**
 * Offenders are computed from the position as it stood when the player began
 * their turn. Capturing at all discharges the obligation for that turn — the
 * only exception is walking away from a chain partway through, which is handled
 * separately by `declineChain` and gated on `call.abandonedChainCallable`.
 */
const offendersFromSkippedCapture = (boardAtTurnStart: Board, mover: PlayerId): Offender[] => {
  const captures = getCaptures(boardAtTurnStart, mover)
  const seen = new Set<string>()
  const out: Offender[] = []
  for (const capture of captures) {
    if (seen.has(capture.pieceId)) continue
    seen.add(capture.pieceId)
    out.push({ pieceId: capture.pieceId, at: capture.from, fromAbandonedChain: false })
  }
  return out
}

export const applyCall = (state: EngineState, targetPieceId?: string): EngineResult => {
  if (state.status.kind !== 'playing') return reject(state, 'The game is over.')
  if (state.chain.active) return reject(state, 'Finish or end your chain before calling.')
  if (state.offenders.length === 0) return reject(state, 'There is nothing to call.')

  const events: GameEvent[] = []
  const board = cloneBoard(state.board)
  const caller = state.currentPlayer

  let targets: Offender[]
  if (state.settings.call.scope === 'all') {
    targets = state.offenders
  } else {
    const chosen = targetPieceId
      ? state.offenders.find((o) => o.pieceId === targetPieceId)
      : state.offenders.length === 1
        ? state.offenders[0]
        : undefined
    if (!chosen) return reject(state, 'Pick which piece to call.')
    targets = [chosen]
  }

  const removed: Array<{ piece: PieceData; at: Coord }> = []
  for (const offender of targets) {
    // Re-locate by id: the offender may have moved since it declined.
    const at = findPiece(board, offender.pieceId)
    if (!at) continue
    const piece = board[at.row][at.col]!
    board[at.row][at.col] = null
    removed.push({ piece, at })
  }
  if (removed.length === 0) return reject(state, 'Those pieces are no longer on the board.')

  events.push({ type: 'call', caller, removed })
  applyAutoKing(board, events)

  const record: MoveRecord = {
    ply: state.moves.length,
    player: caller,
    notation: formatCall(
      removed.map((r) => r.at),
      state.settings.boardSize,
    ),
    from: null,
    to: null,
    kind: 'call',
    capturedIds: removed.map((r) => r.piece.id),
    promoted: false,
    continuesChain: false,
  }

  let next: EngineState = {
    ...state,
    board,
    offenders: [],
    moves: [...state.moves, record],
    // A call removes material, so it resets the no-capture counter just like a
    // capture would, and invalidates repetition history.
    pliesSinceCapture: 0,
    positionCounts: { [serializePosition(board, caller)]: 1 },
  }
  next = settleStatus(next, events)
  return ok(next, events)
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

const centreSquare = (gridSize: number): Coord => ({
  row: Math.floor(gridSize / 2),
  col: Math.floor(gridSize / 2),
})

/**
 * Yin/yang opening. On odd boards player one's first move may send ANY of their
 * pieces to the empty centre square, not just an adjacent one — but only if
 * player two still has a legal reply afterwards.
 */
const centrePlacementCheck = (
  state: EngineState,
  from: Coord,
  to: Coord,
): { applicable: boolean; legal: boolean; reason?: string } => {
  if (!state.isFirstMove) return { applicable: false, legal: false }
  if (state.settings.boardType !== 'yinyang') return { applicable: false, legal: false }
  if (state.currentPlayer !== 'player1') return { applicable: false, legal: false }

  const centre = centreSquare(state.settings.boardSize)
  if (to.row !== centre.row || to.col !== centre.col) return { applicable: false, legal: false }

  const piece = state.board[from.row]?.[from.col]
  if (!piece || piece.player !== 'player1') return { applicable: false, legal: false }
  if (state.board[to.row][to.col] !== null) return { applicable: false, legal: false }

  const probe = cloneBoard(state.board)
  probe[to.row][to.col] = { ...piece }
  probe[from.row][from.col] = null
  if (!hasAnyLegalMove(probe, 'player2')) {
    return {
      applicable: true,
      legal: false,
      reason: 'That opening would leave player two with no legal move.',
    }
  }
  return { applicable: true, legal: true }
}

interface TurnEndOptions {
  boardAtTurnStart: Board
  moverCaptured: boolean
  abandonedChain: Offender | null
}

/** Hand the turn over, recomputing offenders, repetition and draw counters. */
const endTurn = (
  state: EngineState,
  events: GameEvent[],
  { boardAtTurnStart, moverCaptured, abandonedChain }: TurnEndOptions,
): EngineState => {
  const mover = state.currentPlayer
  const next = opponentOf(mover)

  let offenders: Offender[] = []
  if (abandonedChain && state.settings.call.abandonedChainCallable) {
    offenders = [abandonedChain]
  } else if (!moverCaptured) {
    offenders = offendersFromSkippedCapture(boardAtTurnStart, mover)
  }
  // Only keep offenders whose piece is still on the board.
  offenders = offenders.filter((o) => findPiece(state.board, o.pieceId) !== null)

  if (offenders.length > 0) {
    events.push({ type: 'call-available', caller: next, offenders })
  }

  const key = serializePosition(state.board, next)
  const positionCounts = moverCaptured
    ? { [key]: 1 } // a capture is irreversible; the old history can never recur
    : { ...state.positionCounts, [key]: (state.positionCounts[key] ?? 0) + 1 }

  events.push({ type: 'turn-change', player: next })

  return {
    ...state,
    currentPlayer: next,
    chain: { active: false, at: null, pendingPromotionPieceId: null, legs: [] },
    offenders,
    positionCounts,
    pliesSinceCapture: moverCaptured ? 0 : state.pliesSinceCapture + 1,
    isFirstMove: false,
  }
}

const pushMoveRecord = (
  state: EngineState,
  record: Omit<MoveRecord, 'ply'>,
): MoveRecord[] => [...state.moves, { ...record, ply: state.moves.length }]

export const applyMove = (state: EngineState, from: Coord, to: Coord): EngineResult => {
  if (state.status.kind !== 'playing') return reject(state, 'The game is over.')

  const gridSize = state.settings.boardSize
  const mover = state.currentPlayer
  const events: GameEvent[] = []
  const boardAtTurnStart = cloneBoard(state.board)

  // --- Chain lock: mid-chain you may only continue with the chain piece. -----
  if (state.chain.active) {
    const chainAt = state.chain.at!
    if (from.row !== chainAt.row || from.col !== chainAt.col) {
      return reject(state, 'Continue the chain with the same piece, or end your turn.')
    }
    const legal = getCapturesFrom(state.board, mover, chainAt).some(
      (c) => c.to.row === to.row && c.to.col === to.col,
    )
    if (!legal) return reject(state, 'Mid-chain, that piece may only capture.')
  }

  // --- Yin/yang centre opening -----------------------------------------------
  const centre = centrePlacementCheck(state, from, to)
  if (centre.applicable) {
    if (!centre.legal) return reject(state, centre.reason ?? 'Illegal opening.')

    const board = cloneBoard(state.board)
    const piece = board[from.row][from.col]!
    board[to.row][to.col] = { ...piece }
    board[from.row][from.col] = null
    events.push({ type: 'move', player: mover, pieceId: piece.id, from, to, isKing: piece.isKing })
    applyAutoKing(board, events)

    let next: EngineState = {
      ...state,
      board,
      moves: pushMoveRecord(state, {
        player: mover,
        notation: formatMove({ from, to, gridSize, isCapture: false }),
        from,
        to,
        kind: 'move',
        capturedIds: [],
        promoted: false,
        continuesChain: false,
      }),
    }
    next = endTurn(next, events, { boardAtTurnStart, moverCaptured: false, abandonedChain: null })
    next = settleStatus(next, events)
    return ok(next, events)
  }

  // --- Normal legality --------------------------------------------------------
  const intent = classifyMove(state.board, mover, from, to)
  if (intent.kind === 'illegal') return reject(state, intent.reason)

  if (intent.kind === 'slide') {
    if (state.chain.active) return reject(state, 'Mid-chain, that piece may only capture.')

    const board = cloneBoard(state.board)
    const piece = board[from.row][from.col]!
    board[to.row][to.col] = { ...piece }
    board[from.row][from.col] = null
    events.push({ type: 'move', player: mover, pieceId: piece.id, from, to, isKing: piece.isKing })

    let promoted = false
    if (reachedPromotionRow(piece, to, gridSize)) {
      board[to.row][to.col] = { ...board[to.row][to.col]!, isKing: true }
      promoted = true
      events.push({ type: 'promotion', player: mover, pieceId: piece.id, at: to, deferred: false })
    }
    applyAutoKing(board, events)

    const leftCapture = getCaptures(boardAtTurnStart, mover).length > 0

    let next: EngineState = {
      ...state,
      board,
      moves: pushMoveRecord(state, {
        player: mover,
        notation: formatMove({
          from,
          to,
          gridSize,
          isCapture: false,
          promoted,
          leftCaptureAvailable: leftCapture,
        }),
        from,
        to,
        kind: 'move',
        capturedIds: [],
        promoted,
        continuesChain: false,
      }),
    }
    next = endTurn(next, events, { boardAtTurnStart, moverCaptured: false, abandonedChain: null })
    next = settleStatus(next, events)
    return ok(next, events)
  }

  // --- Capture ----------------------------------------------------------------
  const board = cloneBoard(state.board)
  const piece = board[from.row][from.col]!
  const capturedPiece = board[intent.captured.row][intent.captured.col]!

  board[intent.captured.row][intent.captured.col] = null
  board[to.row][to.col] = { ...piece }
  board[from.row][from.col] = null

  events.push({ type: 'move', player: mover, pieceId: piece.id, from, to, isKing: piece.isKing })
  events.push({
    type: 'capture',
    player: mover,
    pieceId: piece.id,
    captured: capturedPiece,
    at: intent.captured,
  })

  const policy = state.settings.promotionPolicy as ResolvedPromotionPolicy
  const justReachedFarRow = reachedPromotionRow(piece, to, gridSize)
  let pendingPromotionPieceId = state.chain.pendingPromotionPieceId
  let promotedNow = false
  let turnEndsOnPromotion = false

  if (justReachedFarRow) {
    if (policy === 'promote-and-continue') {
      board[to.row][to.col] = { ...board[to.row][to.col]!, isKing: true }
      promotedNow = true
      events.push({ type: 'promotion', player: mover, pieceId: piece.id, at: to, deferred: false })
    } else if (policy === 'end-turn-on-promotion') {
      board[to.row][to.col] = { ...board[to.row][to.col]!, isKing: true }
      promotedNow = true
      turnEndsOnPromotion = true
      events.push({ type: 'promotion', player: mover, pieceId: piece.id, at: to, deferred: false })
    } else {
      // promote-after-chain: flagged now, crowned when the chain ends, and the
      // rest of the chain is played with normal-piece movement.
      pendingPromotionPieceId = piece.id
      events.push({ type: 'promotion', player: mover, pieceId: piece.id, at: to, deferred: true })
    }
  }

  const autoKinged = applyAutoKing(board, events)
  if (pendingPromotionPieceId && autoKinged.includes(pendingPromotionPieceId)) {
    // Auto-king is not a toggle and outranks the deferred policy.
    pendingPromotionPieceId = null
    promotedNow = true
  }

  const legs = [...state.chain.legs, to]
  const continuations = turnEndsOnPromotion ? [] : getCapturesFrom(board, mover, to)
  const chainContinues = continuations.length > 0

  const record: Omit<MoveRecord, 'ply'> = {
    player: mover,
    notation: formatMove({
      from: state.chain.active && state.chain.legs.length > 0 ? from : from,
      to,
      gridSize,
      isCapture: true,
      chainLandings: [to],
      promoted: promotedNow,
    }),
    from,
    to,
    kind: state.chain.active ? 'chain' : 'capture',
    capturedIds: [capturedPiece.id],
    promoted: promotedNow,
    continuesChain: state.chain.active,
  }

  let next: EngineState = { ...state, board, moves: pushMoveRecord(state, record) }

  if (chainContinues) {
    events.push({ type: 'chain-continue', player: mover, pieceId: piece.id, at: to })
    next = {
      ...next,
      chain: { active: true, at: to, pendingPromotionPieceId, legs },
      // Mid-chain the turn has not ended, so counters stay put.
      pliesSinceCapture: 0,
    }
    next = settleStatus(next, events)
    return ok(next, events)
  }

  // Chain (or single capture) is over.
  if (pendingPromotionPieceId) {
    const spot = findPiece(next.board, pendingPromotionPieceId)
    if (spot) {
      const finalBoard = cloneBoard(next.board)
      finalBoard[spot.row][spot.col] = { ...finalBoard[spot.row][spot.col]!, isKing: true }
      next = { ...next, board: finalBoard }
      events.push({
        type: 'promotion',
        player: mover,
        pieceId: pendingPromotionPieceId,
        at: spot,
        deferred: false,
      })
      const updated = [...next.moves]
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        promoted: true,
        notation: `${updated[updated.length - 1].notation}=K`,
      }
      next = { ...next, moves: updated }
    }
  }

  events.push({ type: 'chain-end', player: mover, pieceId: piece.id, at: to })
  next = endTurn(next, events, { boardAtTurnStart, moverCaptured: true, abandonedChain: null })
  next = settleStatus(next, events)
  return ok(next, events)
}

/**
 * Walk away from a chain that still has captures available. Captures are never
 * forced, so this is always allowed — but with `abandonedChainCallable` on
 * (the default) the piece that stopped becomes callable.
 */
export const declineChain = (state: EngineState): EngineResult => {
  if (state.status.kind !== 'playing') return reject(state, 'The game is over.')
  if (!state.chain.active || !state.chain.at) return reject(state, 'You are not in a chain.')

  const events: GameEvent[] = []
  const mover = state.currentPlayer
  const chainAt = state.chain.at
  const piece = state.board[chainAt.row][chainAt.col]
  if (!piece) return reject(state, 'The chain piece is gone.')

  let next = state
  if (state.chain.pendingPromotionPieceId) {
    const spot = findPiece(state.board, state.chain.pendingPromotionPieceId)
    if (spot) {
      const board = cloneBoard(state.board)
      board[spot.row][spot.col] = { ...board[spot.row][spot.col]!, isKing: true }
      next = { ...next, board }
      events.push({
        type: 'promotion',
        player: mover,
        pieceId: state.chain.pendingPromotionPieceId,
        at: spot,
        deferred: false,
      })
    }
  }

  events.push({ type: 'chain-end', player: mover, pieceId: piece.id, at: chainAt })

  const updated = [...next.moves]
  if (updated.length > 0) {
    updated[updated.length - 1] = {
      ...updated[updated.length - 1],
      notation: `${updated[updated.length - 1].notation} ?!`,
    }
  }
  next = { ...next, moves: updated }

  next = endTurn(next, events, {
    boardAtTurnStart: state.board,
    moverCaptured: true,
    abandonedChain: { pieceId: piece.id, at: chainAt, fromAbandonedChain: true },
  })
  next = settleStatus(next, events)
  return ok(next, events)
}

// ---------------------------------------------------------------------------
// Non-move outcomes
// ---------------------------------------------------------------------------

export const resign = (state: EngineState, player: PlayerId): EngineResult => {
  if (state.status.kind !== 'playing') return reject(state, 'The game is over.')
  const winner = opponentOf(player)
  const events: GameEvent[] = [{ type: 'win', winner, reason: 'resignation' }]
  return ok(
    {
      ...state,
      status: { kind: 'win', winner, reason: 'resignation' },
      chain: { active: false, at: null, pendingPromotionPieceId: null, legs: [] },
      offenders: [],
      moves: pushMoveRecord(state, {
        player,
        notation: formatResign(player),
        from: null,
        to: null,
        kind: 'resign',
        capturedIds: [],
        promoted: false,
        continuesChain: false,
      }),
    },
    events,
  )
}

export const agreeDraw = (state: EngineState): EngineResult => {
  if (state.status.kind !== 'playing') return reject(state, 'The game is over.')
  const events: GameEvent[] = [{ type: 'tie', reason: 'agreement' }]
  return ok(
    {
      ...state,
      status: { kind: 'draw', reason: 'agreement' },
      chain: { active: false, at: null, pendingPromotionPieceId: null, legs: [] },
      offenders: [],
      moves: pushMoveRecord(state, {
        player: state.currentPlayer,
        notation: DRAW_NOTATION,
        from: null,
        to: null,
        kind: 'draw-agreed',
        capturedIds: [],
        promoted: false,
        continuesChain: false,
      }),
    },
    events,
  )
}

export const flagTimeout = (state: EngineState, player: PlayerId): EngineResult => {
  if (state.status.kind !== 'playing') return reject(state, 'The game is over.')
  const winner = opponentOf(player)
  const events: GameEvent[] = [{ type: 'win', winner, reason: 'timeout' }]
  return ok({ ...state, status: { kind: 'win', winner, reason: 'timeout' } }, events)
}

// ---------------------------------------------------------------------------
// Queries used by the UI
// ---------------------------------------------------------------------------

export interface Destinations {
  slides: Coord[]
  captures: Coord[]
}

export const destinationsFor = (state: EngineState, from: Coord): Destinations => {
  if (state.status.kind !== 'playing') return { slides: [], captures: [] }
  const piece = state.board[from.row]?.[from.col]
  if (!piece || piece.player !== state.currentPlayer) return { slides: [], captures: [] }

  const captures = getCapturesFrom(state.board, state.currentPlayer, from).map((c) => c.to)

  if (state.chain.active) {
    const chainAt = state.chain.at!
    if (chainAt.row !== from.row || chainAt.col !== from.col) return { slides: [], captures: [] }
    return { slides: [], captures }
  }

  const slides: Coord[] = []
  const gridSize = state.settings.boardSize
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (row === from.row && col === from.col) continue
      const intent = classifyMove(state.board, state.currentPlayer, from, { row, col })
      if (intent.kind === 'slide') slides.push({ row, col })
    }
  }

  const centre = centreSquare(gridSize)
  const centreCheck = centrePlacementCheck(state, from, centre)
  if (centreCheck.applicable && centreCheck.legal) {
    if (!slides.some((s) => s.row === centre.row && s.col === centre.col)) slides.push(centre)
  }

  return { slides, captures }
}

export const canCall = (state: EngineState): boolean =>
  state.status.kind === 'playing' && !state.chain.active && state.offenders.length > 0

export const isOffenderSquare = (state: EngineState, row: number, col: number): boolean => {
  const piece = state.board[row]?.[col]
  if (!piece) return false
  return state.offenders.some((o) => o.pieceId === piece.id)
}
