/**
 * Review a finished game with the strongest tier: at every turn, what Seriñ
 * would have played, and how much the move actually played cost by its
 * search. It is how to tell whether a player went wrong or the engine
 * misjudges a position.
 *
 *   MATCH=d31d6db07896 ONLINE_URL=https://play.open-dam.workers.dev npm run review
 *   RECORD=path/to/record.json npm run review
 *
 * BUDGET is the search time per position in ms (default Seriñ's 2600).
 */
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { DIFFICULTIES } from '../src/ai/difficulty'
import { WIN_SCORE } from '../src/ai/evaluate'
import { bestCallTarget, chooseAction } from '../src/ai/search'
import { applyAction, canCall, createInitialState, legalActions } from '../src/game/engine'
import { coordToNotation } from '../src/game/notation'
import { positionToAscii } from '../src/game/position'
import type { EngineAction, EngineState, PlayerId } from '../src/game/types'
import type { MatchRecord } from '../src/match/types'
import { PROTOCOL_VERSION } from '../src/net/protocol'

const out = (text: string) => process.stdout.write(`${text}\n`)
const serin = DIFFICULTIES.serin
const budget = Number(process.env.BUDGET ?? serin.timeBudgetMs)

/** Ask a running server for a game's record: a new connection is sent a snapshot first. */
async function fetchRecord(base: string, matchId: string): Promise<MatchRecord> {
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/api/matches/${matchId}/socket`)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No snapshot from the server')), 10_000)
    socket.onopen = () =>
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, matchId, from: `review-${Date.now()}`, type: 'ping', seat: 'player1' }))
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { type: string; record?: MatchRecord }
      if (message.type === 'snapshot' && message.record) {
        clearTimeout(timer)
        socket.close()
        resolve(message.record)
      } else if (message.type === 'closed') reject(new Error(`The server has no game ${matchId}`))
    }
  })
}

const search = (state: EngineState) =>
  chooseAction(state, {
    depth: serin.depth,
    profile: serin.profile,
    timeBudgetMs: budget,
    quiescenceDepth: serin.quiescenceDepth,
    noise: 0,
    blunderChance: 0,
    callAware: true,
    forcingExtensions: serin.forcingExtensions,
  })

/**
 * Seriñ's value of a position for `side`. chooseAction reports 0 for forced
 * moves and calls (it does not search them), so those are played through.
 */
function value(state: EngineState, side: PlayerId, guard = 12): number {
  if (state.status.kind === 'win') return state.status.winner === side ? WIN_SCORE : -WIN_SCORE
  if (state.status.kind !== 'playing') return 0
  const sign = state.currentPlayer === side ? 1 : -1
  if (guard > 0 && canCall(state)) {
    return value(applyAction(state, { type: 'call', pieceId: bestCallTarget(state) }).state, side, guard - 1)
  }
  const options = legalActions(state).filter((a) => a.type !== 'call')
  if (guard > 0 && options.length === 1) return value(applyAction(state, options[0]).state, side, guard - 1)
  const result = search(state)
  return result ? sign * result.score : 0
}

const name = (state: EngineState, action: EngineAction): string => {
  const n = state.settings.boardSize
  if (action.type === 'move') {
    const from = coordToNotation(action.from.row, action.from.col, n)
    const to = coordToNotation(action.to.row, action.to.col, n)
    const after = applyAction(state, action)
    return after.events.some((e) => e.type === 'capture') ? `${from}x${to}` : `${from}-${to}`
  }
  return action.type === 'end-chain' ? 'end' : action.type
}

const same = (a: EngineAction, b: EngineAction) => JSON.stringify(a) === JSON.stringify(b)
const pieces = (score: number) =>
  Math.abs(score) >= WIN_SCORE / 2 ? (score > 0 ? 'wins' : 'loses') : `${(score / 100).toFixed(2)}`

test('review a game against Seriñ', async () => {
  const record: MatchRecord = process.env.RECORD
    ? (JSON.parse(readFileSync(process.env.RECORD, 'utf8')) as MatchRecord)
    : await fetchRecord(process.env.ONLINE_URL ?? 'http://127.0.0.1:8787', process.env.MATCH ?? '')
  const names: Record<PlayerId, string> = { player1: 'Red', player2: 'Blue' }
  let state = createInitialState(record.config.settings)
  const totals: Record<
    PlayerId,
    { turns: number; agreed: number; lost: number; slower: number; worst: Array<[number, string]> }
  > = {
    player1: { turns: 0, agreed: 0, lost: 0, slower: 0, worst: [] },
    player2: { turns: 0, agreed: 0, lost: 0, slower: 0, worst: [] },
  }
  /** Five pieces up: a move that keeps this much while Seriñ saw a forced win is slower, not a mistake. */
  const CRUSHING = 500

  out(`Review with Seriñ (${budget} ms a position). Scores are pieces for the side to move; a king is about 2.1.`)
  for (const entry of record.actions) {
    if (entry.intent.type !== 'engine') continue
    const played = entry.intent.action
    if (played.type === 'resign' || played.type === 'timeout' || played.type === 'agree-draw') break
    const mover = state.currentPlayer
    const choices = legalActions(state)
    const label = `${state.moves.length + 1}. ${names[mover].padEnd(4)} ${name(state, played).padEnd(7)}`

    if (choices.length > 1 && played.type !== 'call') {
      const best = search(state)
      const bestValue = best ? value(applyAction(state, best.action).state, mover) : 0
      const playedValue = best && same(best.action, played) ? bestValue : value(applyAction(state, played).state, mover)
      const slower = bestValue >= WIN_SCORE / 2 && playedValue >= CRUSHING && playedValue < bestValue
      const cost = slower ? 0 : Math.max(0, bestValue - playedValue)
      const t = totals[mover]
      t.turns++
      if (best && same(best.action, played)) t.agreed++
      if (slower) t.slower++
      t.lost += Math.min(cost, 1000)
      if (cost >= 50) t.worst.push([cost, `${label} Seriñ: ${best ? name(state, best.action) : '?'}`])
      const verdict = best && same(best.action, played) ? 'same as Seriñ' : `Seriñ: ${best ? name(state, best.action) : '?'}`
      const note = slower
        ? '  (Seriñ saw a forced win; this still wins, more slowly)'
        : cost >= 50
          ? `  (costs ${pieces(cost)})`
          : ''
      out(`${label} ${pieces(playedValue).padStart(6)}  best ${pieces(bestValue).padStart(6)}  ${verdict}${note}`)
    } else {
      out(`${label} ${played.type === 'call' ? 'call' : 'forced'}`)
    }
    const result = applyAction(state, played)
    expect(result.error, label).toBeUndefined()
    state = result.state
  }

  out(`\n${positionToAscii(state)}\nResult: ${JSON.stringify(state.status)}\n`)
  for (const side of ['player1', 'player2'] as PlayerId[]) {
    const t = totals[side]
    out(
      `${names[side]}: ${t.agreed}/${t.turns} moves matched Seriñ; average cost ${(t.lost / Math.max(1, t.turns) / 100).toFixed(2)} pieces a move;` +
        ` ${t.slower} slower wins`,
    )
    for (const [cost, line] of t.worst.sort((a, b) => b[0] - a[0]).slice(0, 5)) out(`  ${pieces(cost)} pieces: ${line}`)
  }
})
