import { opponentOf } from '../game/board'
import { applyAction, createInitialState } from '../game/engine'
import type { EngineAction, PlayerId } from '../game/types'
import { createMatchClock, finishTurn, pauseClock, remainingAt, resumeClock, runFor, settle, stop } from './clock'
import type { Actor, MatchAction, MatchConfig, MatchIntent, MatchNotice, MatchRecord, MatchState, MatchStepResult } from './types'

/**
 * The match reducer: `(state, action) -> state`. It is the only place that
 * decides whether an intent is allowed, so a hot-seat click, an AI decision
 * and a message from a remote peer are all judged by the same rules. A server
 * would run exactly this function to stay authoritative.
 */

const NOBODY: Record<PlayerId, boolean> = { player1: false, player2: false }

/** Clock tolerance for a timeout claim, so a claim stamped a hair early by a slow device is still honoured. */
const FLAG_TOLERANCE_MS = 250

export function createMatchState(config: MatchConfig): MatchState {
  const position = createInitialState(config.settings)
  return {
    config: { ...config, settings: position.settings },
    timeline: [position],
    position,
    offer: null,
    undoAskedThisTurn: NOBODY,
    drawOfferedThisTurn: NOBODY,
    clock: createMatchClock(config.settings.timeControl),
    lastSeq: 0,
  }
}

const refuse = (state: MatchState, error: string): MatchStepResult => ({ state, events: [], notices: [], error })

/**
 * The position an undo by `requester` rolls back to: the latest earlier
 * position where it was `requester`'s turn and no chain was in progress.
 */
export function undoTargetIndex(state: MatchState, requester: PlayerId): number | null {
  for (let i = state.timeline.length - 2; i >= 0; i--) {
    const candidate = state.timeline[i]
    if (candidate.currentPlayer === requester && !candidate.chain.active) return i
  }
  return null
}

/** Can `player` act on the board right now (move, call, end a chain)? */
export const isPlayersTurn = (state: MatchState, player: PlayerId): boolean =>
  state.position.status.kind === 'playing' && state.position.currentPlayer === player

export const isOver = (state: MatchState): boolean => state.position.status.kind !== 'playing'

/** Apply one engine action and keep the clock and per-turn flags in step. */
function stepEngine(state: MatchState, action: EngineAction, at: number, notices: MatchNotice[]): MatchStepResult {
  const before = state.position
  const result = applyAction(before, action)
  if (result.error) return refuse(state, result.error)

  const after = result.state
  let clock = state.clock
  if (clock) {
    if (after.status.kind !== 'playing') clock = stop(clock, at)
    else if (after.currentPlayer !== before.currentPlayer) {
      clock = finishTurn(
        clock,
        before.currentPlayer,
        after.currentPlayer,
        state.config.settings.timeControl?.incrementMs ?? 0,
        at,
      )
    } else clock = settle(clock, at)
  }

  const turnChanged = after.currentPlayer !== before.currentPlayer
  // Playing on answers any pending offer with "no", as over a real board.
  if (state.offer && action.type !== 'agree-draw') {
    notices.push({ type: 'offer-declined', kind: state.offer.kind, by: state.offer.by })
  }

  return {
    state: {
      ...state,
      timeline: [...state.timeline, after],
      position: after,
      offer: null,
      clock,
      undoAskedThisTurn: turnChanged ? NOBODY : state.undoAskedThisTurn,
      drawOfferedThisTurn: turnChanged ? NOBODY : state.drawOfferedThisTurn,
    },
    events: result.events,
    notices,
  }
}

/** Validate and apply one intent from `by` at time `at`. Pure. */
export function stepMatch(state: MatchState, by: Actor, intent: MatchIntent, at: number): MatchStepResult {
  const notices: MatchNotice[] = []
  const position = state.position
  const playing = position.status.kind === 'playing'

  switch (intent.type) {
    case 'engine': {
      const action = intent.action
      if (!playing) return refuse(state, 'The game is over.')
      if (action.type === 'agree-draw') return refuse(state, 'A draw has to be offered and accepted.')
      if (action.type === 'timeout') {
        if (by !== 'system') return refuse(state, 'Only the clock can call time.')
        if (!state.clock || state.clock.running !== action.player) return refuse(state, 'That clock is not running.')
        if (remainingAt(state.clock, action.player, at) > FLAG_TOLERANCE_MS)
          return refuse(state, 'There is still time on that clock.')
        return stepEngine(state, action, at, notices)
      }
      if (action.type === 'resign') {
        if (by !== action.player) return refuse(state, 'You can only resign for yourself.')
        return stepEngine(state, action, at, notices)
      }
      if (by !== position.currentPlayer) return refuse(state, 'It is not your turn.')
      return stepEngine(state, action, at, notices)
    }

    case 'offer': {
      if (by === 'system') return refuse(state, 'Only a player can make an offer.')
      if (!playing) return refuse(state, 'The game is over.')
      if (state.offer) return refuse(state, 'An offer is already waiting for an answer.')
      if (intent.kind === 'undo') {
        if (state.undoAskedThisTurn[by]) return refuse(state, 'You have already asked for an undo this turn.')
        if (position.chain.active) return refuse(state, 'Finish the chain before asking for an undo.')
        if (undoTargetIndex(state, by) === null) return refuse(state, 'There is nothing of yours to undo yet.')
      } else if (state.drawOfferedThisTurn[by]) {
        return refuse(state, 'You have already offered a draw this turn.')
      }
      notices.push({ type: 'offer-made', kind: intent.kind, by })
      return {
        state: {
          ...state,
          offer: { kind: intent.kind, by },
          undoAskedThisTurn: intent.kind === 'undo' ? { ...state.undoAskedThisTurn, [by]: true } : state.undoAskedThisTurn,
          drawOfferedThisTurn: intent.kind === 'draw' ? { ...state.drawOfferedThisTurn, [by]: true } : state.drawOfferedThisTurn,
        },
        events: [],
        notices,
      }
    }

    case 'cancel-offer': {
      if (!state.offer) return refuse(state, 'There is no offer to withdraw.')
      if (by !== state.offer.by) return refuse(state, 'Only the player who made the offer can withdraw it.')
      notices.push({ type: 'offer-cancelled', kind: state.offer.kind, by: state.offer.by })
      return { state: { ...state, offer: null }, events: [], notices }
    }

    case 'answer-offer': {
      const offer = state.offer
      if (!offer) return refuse(state, 'There is no offer to answer.')
      if (by === 'system' || by === offer.by) return refuse(state, 'Only the other player can answer this offer.')
      if (!intent.accept) {
        notices.push({ type: 'offer-declined', kind: offer.kind, by: offer.by })
        return { state: { ...state, offer: null }, events: [], notices }
      }
      notices.push({ type: 'offer-accepted', kind: offer.kind, by: offer.by })
      if (offer.kind === 'draw') return stepEngine({ ...state, offer: null }, { type: 'agree-draw' }, at, notices)

      const index = undoTargetIndex(state, offer.by)
      if (index === null) return refuse(state, 'There is nothing to undo any more.')
      const target = state.timeline[index]
      notices.push({ type: 'undo-applied', for: offer.by })
      return {
        state: {
          ...state,
          timeline: state.timeline.slice(0, index + 1),
          position: target,
          offer: null,
          clock: state.clock ? runFor(state.clock, target.currentPlayer, at) : null,
        },
        events: [],
        notices,
      }
    }

    case 'pause':
      if (by !== 'system') return refuse(state, 'Only the match can pause the clock.')
      return { state: { ...state, clock: state.clock ? pauseClock(state.clock, at) : null }, events: [], notices }

    case 'resume':
      if (by !== 'system') return refuse(state, 'Only the match can resume the clock.')
      return { state: { ...state, clock: state.clock ? resumeClock(state.clock, at) : null }, events: [], notices }
  }
}

/** Apply an already-stamped action from the log. */
export function applyMatchAction(state: MatchState, action: MatchAction): MatchStepResult {
  if (action.seq !== state.lastSeq + 1) {
    return refuse(state, `Out-of-order action: expected #${state.lastSeq + 1}, got #${action.seq}.`)
  }
  const result = stepMatch(state, action.by, action.intent, action.at)
  if (result.error) return result
  return { ...result, state: { ...result.state, lastSeq: action.seq } }
}

export class ReplayError extends Error {
  readonly seq: number
  constructor(seq: number, reason: string) {
    super(`Action #${seq} could not be replayed: ${reason}`)
    this.seq = seq
  }
}

/** Rebuild the full match state from a record. Throws `ReplayError` on a bad log. */
export function replay(record: MatchRecord): MatchState {
  let state = createMatchState(record.config)
  for (const action of record.actions) {
    const result = applyMatchAction(state, action)
    if (result.error) throw new ReplayError(action.seq, result.error)
    state = result.state
  }
  return state
}

/** Who the seat on the other side of `player` is. */
export const opponentSeat = (state: MatchState, player: PlayerId) => state.config.seats[opponentOf(player)]
