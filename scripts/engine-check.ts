/**
 * Rules-engine sanity checks. Run with:
 *   node --experimental-strip-types scripts/engine-check.ts
 *
 * Not a substitute for a real test runner — this project has no test setup yet
 * — but it exercises every rule branch the engine implements so regressions in
 * promotion policy, calling and end conditions show up immediately.
 */
import { createInitialState, applyMove, applyCall, declineChain, resign, destinationsFor, canCall } from '../src/game/engine'
import { makeEmptyBoard, countPieces } from '../src/game/board'
import { getCaptures } from '../src/game/moves'
import { toMoveRows } from '../src/game/notation'
import { settingsAreCompatible, makeSettings } from '../src/game/settings'
import type { Board, EngineState, PlayerId, RuleSettings } from '../src/game/types'

let passed = 0
let failed = 0

const check = (name: string, cond: boolean, detail = '') => {
  if (cond) {
    passed++
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const section = (name: string) => console.log(`\n${name}`)

/** Build a state from an ASCII board. `a`=p1, `A`=p1 king, `b`=p2, `B`=p2 king. */
const fromAscii = (rows: string[], toMove: PlayerId, settings: Partial<RuleSettings> = {}): EngineState => {
  const size = rows.length
  const base = createInitialState({ ...settings, boardSize: size as 5 })
  const board: Board = makeEmptyBoard(size)
  let id = 0
  rows.forEach((line, r) => {
    line.split('').forEach((ch, c) => {
      if (ch === '.') return
      const player: PlayerId = ch.toLowerCase() === 'a' ? 'player1' : 'player2'
      board[r][c] = { player, isKing: ch === ch.toUpperCase(), id: `t-${id++}` }
    })
  })
  return { ...base, board, currentPlayer: toMove, isFirstMove: false, positionCounts: {} }
}

const ascii = (state: EngineState): string =>
  state.board
    .map((row) =>
      row
        .map((cell) => {
          if (!cell) return '.'
          const letter = cell.player === 'player1' ? 'a' : 'b'
          return cell.isKing ? letter.toUpperCase() : letter
        })
        .join(''),
    )
    .join('\n')

// ---------------------------------------------------------------------------
section('Board setup')
// ---------------------------------------------------------------------------
{
  const s5 = createInitialState({ boardSize: 5, boardType: 'yinyang' })
  check('5x5 yin/yang leaves the centre empty', s5.board[2][2] === null)
  check('5x5 yin/yang is 12 v 12', countPieces(s5.board, 'player1') === 12 && countPieces(s5.board, 'player2') === 12)
  check('player2 occupies the top-left half', s5.board[0][0]?.player === 'player2')
  check('player1 occupies the bottom-right half', s5.board[4][4]?.player === 'player1')

  const s6 = createInitialState({ boardSize: 6, boardType: 'even' })
  check('6x6 even leaves two empty rows', s6.board[2].every((c) => c === null) && s6.board[3].every((c) => c === null))
  check('6x6 even is 12 v 12', countPieces(s6.board, 'player1') === 12 && countPieces(s6.board, 'player2') === 12)

  const s9 = createInitialState({ boardSize: 9, boardType: 'yinyang' })
  check('9x9 yin/yang centre is empty', s9.board[4][4] === null)
  check('9x9 yin/yang is 40 v 40', countPieces(s9.board, 'player1') === 40 && countPieces(s9.board, 'player2') === 40)
}

// ---------------------------------------------------------------------------
section('Movement')
// ---------------------------------------------------------------------------
{
  const st = fromAscii(['.....', '.....', '..a..', '.....', '.....'], 'player1')
  const dests = destinationsFor(st, { row: 2, col: 2 })
  const set = new Set(dests.slides.map((d) => `${d.row},${d.col}`))
  check('normal piece moves forward/left/right only', set.size === 3 && set.has('1,2') && set.has('2,1') && set.has('2,3'), [...set].join(' '))
  check('normal piece cannot move backward', !set.has('3,2'))

  const diag = applyMove(st, { row: 2, col: 2 }, { row: 1, col: 1 })
  check('diagonal moves are rejected', !!diag.error)

  const king = fromAscii(['.....', '.....', '..A..', '.....', '.....'], 'player1')
  const kd = destinationsFor(king, { row: 2, col: 2 })
  check('king slides any distance in 4 directions', kd.slides.length === 8, `${kd.slides.length}`)

  const blocked = fromAscii(['.....', '..a..', '..A..', '.....', '.....'], 'player1')
  const bd = destinationsFor(blocked, { row: 2, col: 2 })
  check('king cannot slide through a friendly piece', !bd.slides.some((d) => d.row === 0 && d.col === 2))
}

// ---------------------------------------------------------------------------
section('Captures')
// ---------------------------------------------------------------------------
{
  const st = fromAscii(['.....', '.....', '..b..', '..a..', '.....'], 'player1')
  const res = applyMove(st, { row: 3, col: 2 }, { row: 1, col: 2 })
  check('short jump removes the jumped piece', !res.error && res.state.board[2][2] === null)
  check('short jump lands directly beyond', res.state.board[1][2]?.player === 'player1')
  check('capture emits a capture event', res.events.some((e) => e.type === 'capture'))

  const far = applyMove(st, { row: 3, col: 2 }, { row: 0, col: 2 })
  check('normal piece cannot overshoot the landing square', !!far.error)

  // Long-range king capture with a choice of landing square.
  const kingSt = fromAscii(['.....', '.....', '.....', '..b..', '..A..'], 'player1')
  const kd = destinationsFor(kingSt, { row: 4, col: 2 })
  check('king capture offers every empty square beyond', kd.captures.length === 3, `${kd.captures.length}`)
  const land = applyMove(kingSt, { row: 4, col: 2 }, { row: 0, col: 2 })
  check('king may land far beyond the captured piece', !land.error && land.state.board[0][2]?.isKing === true)
  check('king capture removes the right piece', land.state.board[3][2] === null)

  const gap = fromAscii(['.....', '..a..', '.....', '..b..', '..A..'], 'player1')
  const blockedLand = applyMove(gap, { row: 4, col: 2 }, { row: 0, col: 2 })
  check('king cannot land past an occupied square', !!blockedLand.error)
}

// ---------------------------------------------------------------------------
section('Chain captures')
// ---------------------------------------------------------------------------
{
  //  b at (1,2) and (1,0); a at (3,2). a jumps to (1,2)? no — set up an L chain.
  const st = fromAscii(['.....', '.b...', '.....', '.b...', '.a...'], 'player1')
  const first = applyMove(st, { row: 4, col: 1 }, { row: 2, col: 1 })
  check('chain stays with the same player', first.state.currentPlayer === 'player1')
  check('chain is flagged active', first.state.chain.active === true)
  check('chain-continue event emitted', first.events.some((e) => e.type === 'chain-continue'))

  const wrong = applyMove(first.state, { row: 2, col: 1 }, { row: 2, col: 2 })
  check('mid-chain sliding is rejected', !!wrong.error)

  const second = applyMove(first.state, { row: 2, col: 1 }, { row: 0, col: 1 })
  check('chain completes and hands over the turn', second.state.currentPlayer === 'player2')
  check('both pieces were taken', countPieces(second.state.board, 'player2') === 0)

  const rows = toMoveRows(second.state.moves)
  const firstRow = rows[0]
  check(
    'chain legs merge into one notation entry',
    firstRow.kind === 'pair' && !!firstRow.player1?.notation.startsWith('b1xb3xb5'),
    firstRow.kind === 'pair' ? firstRow.player1?.notation : '',
  )
}

// ---------------------------------------------------------------------------
section('Promotion policies')
// ---------------------------------------------------------------------------
{
  // a on (2,1) jumps b on (1,1) and lands on (0,1) = the promotion row. From
  // there a capture of b on (0,2) is available to a normal piece as well as a
  // king, so all three policies get a chain to make a decision about. The spare
  // pieces on row 4 keep either side from dropping to one and auto-kinging.
  const layout = ['..b..', '.b...', '.a...', '.....', 'a...b']

  const cont = fromAscii(layout, 'player1', { promotionPolicy: 'promote-and-continue' })
  const r1 = applyMove(cont, { row: 2, col: 1 }, { row: 0, col: 1 })
  check('promote-and-continue crowns immediately', r1.state.board[0][1]?.isKing === true)
  check('promote-and-continue keeps the chain alive', r1.state.chain.active === true && r1.state.currentPlayer === 'player1')

  const after = fromAscii(layout, 'player1', { promotionPolicy: 'promote-after-chain' })
  const r2 = applyMove(after, { row: 2, col: 1 }, { row: 0, col: 1 })
  check('promote-after-chain does not crown yet', r2.state.board[0][1]?.isKing === false)
  check('promote-after-chain flags a pending crown', r2.state.chain.pendingPromotionPieceId !== null)
  check('promote-after-chain emits a deferred promotion', r2.events.some((e) => e.type === 'promotion' && e.deferred))
  const r2b = declineChain(r2.state)
  check('pending crown arrives when the chain ends', r2b.state.board[0][1]?.isKing === true)

  const endTurn = fromAscii(layout, 'player1', { promotionPolicy: 'end-turn-on-promotion' })
  const r3 = applyMove(endTurn, { row: 2, col: 1 }, { row: 0, col: 1 })
  check('end-turn-on-promotion crowns', r3.state.board[0][1]?.isKing === true)
  check('end-turn-on-promotion hands over the turn', r3.state.currentPlayer === 'player2')
  check('end-turn-on-promotion kills the chain', r3.state.chain.active === false)
}

// ---------------------------------------------------------------------------
section('Auto-king')
// ---------------------------------------------------------------------------
{
  // player2 has two pieces; player1 takes one, leaving a lone uncrowned piece.
  const st = fromAscii(['.....', '.b...', '..b..', '..a..', '.....'], 'player1')
  const res = applyMove(st, { row: 3, col: 2 }, { row: 1, col: 2 })
  check('lone survivor is crowned automatically', res.state.board[1][1]?.isKing === true, ascii(res.state))
  check('auto-king emits its own event', res.events.some((e) => e.type === 'auto-king'))
}

// ---------------------------------------------------------------------------
section('Calling')
// ---------------------------------------------------------------------------
{
  // player1 has a capture available at (3,2) but slides elsewhere instead.
  const st = fromAscii(['.....', '.....', '..b..', '..a..', 'a....'], 'player1')
  const slid = applyMove(st, { row: 4, col: 0 }, { row: 3, col: 0 })
  check('skipping a capture creates an offender', slid.state.offenders.length === 1, `${slid.state.offenders.length}`)
  check('the offender is the piece that could have captured', slid.state.offenders[0]?.at.row === 3)
  check('notation flags the skipped capture', slid.state.moves[0].notation.includes('?!'))
  check('opponent may call', canCall(slid.state) && slid.state.currentPlayer === 'player2')

  const called = applyCall(slid.state)
  check('call removes the offending piece', countPieces(called.state.board, 'player1') === 1)
  check('call does not end the turn', called.state.currentPlayer === 'player2')
  check('call is recorded in the move list', called.state.moves.some((m) => m.kind === 'call'))
  check('call notation names the square', !!called.state.moves.find((m) => m.kind === 'call')?.notation.startsWith('!'))

  // scope: all
  const multi = fromAscii(['.....', '.....', '.b.b.', '.a.a.', 'a....'], 'player1', {
    call: { scope: 'all', abandonedChainCallable: true },
  })
  const slid2 = applyMove(multi, { row: 4, col: 0 }, { row: 3, col: 0 })
  check('two offenders detected', slid2.state.offenders.length === 2, `${slid2.state.offenders.length}`)
  const calledAll = applyCall(slid2.state)
  check("scope 'all' removes both", countPieces(calledAll.state.board, 'player1') === 1, `${countPieces(calledAll.state.board, 'player1')}`)

  // scope: choose-one needs a target when there is more than one
  const chooseSt = { ...slid2.state, settings: { ...slid2.state.settings, call: { scope: 'choose-one' as const, abandonedChainCallable: true } } }
  check('choose-one without a target is rejected', !!applyCall(chooseSt).error)
  const picked = applyCall(chooseSt, chooseSt.offenders[1].pieceId)
  check('choose-one removes exactly one', countPieces(picked.state.board, 'player1') === 2, `${countPieces(picked.state.board, 'player1')}`)

  // capturing discharges the obligation
  const took = applyMove(multi, { row: 3, col: 1 }, { row: 1, col: 1 })
  check('capturing clears the obligation', took.state.offenders.length === 0)
}

// ---------------------------------------------------------------------------
section('Abandoned chains')
// ---------------------------------------------------------------------------
{
  const layout = ['.....', '.b...', '.....', '.b...', '.a...']
  const on = fromAscii(layout, 'player1', { call: { scope: 'choose-one', abandonedChainCallable: true } })
  const mid = applyMove(on, { row: 4, col: 1 }, { row: 2, col: 1 })
  const stopped = declineChain(mid.state)
  check('declining a chain ends the turn', stopped.state.currentPlayer === 'player2')
  check('abandoned chain is callable when the toggle is on', stopped.state.offenders.length === 1)

  const off = fromAscii(layout, 'player1', { call: { scope: 'choose-one', abandonedChainCallable: false } })
  const mid2 = applyMove(off, { row: 4, col: 1 }, { row: 2, col: 1 })
  const stopped2 = declineChain(mid2.state)
  check('abandoned chain is safe when the toggle is off', stopped2.state.offenders.length === 0)
}

// ---------------------------------------------------------------------------
section('End conditions')
// ---------------------------------------------------------------------------
{
  const st = fromAscii(['.....', '.....', '..b..', '..a..', '.....'], 'player1')
  const win = applyMove(st, { row: 3, col: 2 }, { row: 1, col: 2 })
  check('losing every piece is a loss', win.state.status.kind === 'win' && win.state.status.winner === 'player1')
  check('win event emitted', win.events.some((e) => e.type === 'win'))

  // 1v1 with no captures and no calls = tie
  const tie = fromAscii(['....b', '.....', '.....', '.....', 'a....'], 'player1')
  const tieMove = applyMove(tie, { row: 4, col: 0 }, { row: 3, col: 0 })
  check('1v1 with nothing available is a tie', tieMove.state.status.kind === 'draw', JSON.stringify(tieMove.state.status))

  // 1v1 but a capture exists -> play continues
  const live = fromAscii(['.....', '.....', '..B..', '..A..', '.....'], 'player2')
  const liveMove = applyMove(live, { row: 2, col: 2 }, { row: 1, col: 2 })
  check('1v1 with a capture available keeps playing', liveMove.state.status.kind === 'playing', JSON.stringify(liveMove.state.status))

  const resigned = resign(fromAscii(['.....', '.....', '..b..', '..a..', '.....'], 'player1'), 'player1')
  check('resignation loses immediately', resigned.state.status.kind === 'win' && resigned.state.status.winner === 'player2')
  check('resignation is recorded', resigned.state.moves.some((m) => m.kind === 'resign'))
}

// ---------------------------------------------------------------------------
section('Draw counters')
// ---------------------------------------------------------------------------
{
  let st = fromAscii(['.A...', '.....', '.....', '.....', '.B...'], 'player1', {
    draw: { threefoldRepetition: false, pliesWithoutCapture: 6 },
  })
  const shuffle: Array<[number, number, number, number]> = [
    [0, 1, 0, 2], [4, 1, 4, 2],
    [0, 2, 0, 1], [4, 2, 4, 1],
    [0, 1, 0, 2], [4, 1, 4, 2],
  ]
  for (const [fr, fc, tr, tc] of shuffle) {
    const res = applyMove(st, { row: fr, col: fc }, { row: tr, col: tc })
    if (res.error) break
    st = res.state
  }
  check('no-capture counter draws the game', st.status.kind === 'draw', JSON.stringify(st.status))

  let rep = fromAscii(['.A...', '.....', '.....', '.....', '.B...'], 'player1', {
    draw: { threefoldRepetition: true, pliesWithoutCapture: null },
  })
  for (const [fr, fc, tr, tc] of [...shuffle, ...shuffle]) {
    const res = applyMove(rep, { row: fr, col: fc }, { row: tr, col: tc })
    if (res.error) break
    rep = res.state
  }
  check('threefold repetition draws the game', rep.status.kind === 'draw', JSON.stringify(rep.status))
}

// ---------------------------------------------------------------------------
section('Yin/yang opening')
// ---------------------------------------------------------------------------
{
  const st = createInitialState({ boardSize: 5, boardType: 'yinyang' })

  // Distant piece into the centre: legal in principle, but on the opening 5x5
  // position it leaves player two with nothing to play, so the rule forbids it.
  const far = applyMove(st, { row: 4, col: 4 }, { row: 2, col: 2 })
  check('centre placement that strands player two is refused', !!far.error, far.error ?? '')

  const near = applyMove(st, { row: 3, col: 2 }, { row: 2, col: 2 })
  check('centre placement that leaves a reply is allowed', !near.error, near.error ?? '')
  check('the centre placement consumes the first move', near.state.isFirstMove === false)
  check('the centre placement hands over the turn', near.state.currentPlayer === 'player2')

  const after = applyMove(near.state, { row: 0, col: 0 }, { row: 2, col: 2 })
  check('the centre rule is player1-only and first-move-only', !!after.error)

  const s7 = createInitialState({ boardSize: 7, boardType: 'yinyang' })
  const d = destinationsFor(s7, { row: 4, col: 3 })
  check('centre appears as a legal destination on move one', d.slides.some((c) => c.row === 3 && c.col === 3))
  const d2 = destinationsFor(s7, { row: 6, col: 6 })
  check('an illegal centre placement is not offered', !d2.slides.some((c) => c.row === 3 && c.col === 3))
}

// ---------------------------------------------------------------------------
section('Matchmaking compatibility')
// ---------------------------------------------------------------------------
{
  const a = makeSettings({ boardSize: 5, promotionPolicy: 'promote-and-continue' })
  const b = makeSettings({ boardSize: 5, promotionPolicy: 'end-turn-on-promotion' })
  const wild = makeSettings({ boardSize: 5, promotionPolicy: 'match-opponent' })
  check('different promotion policies do not pair', !settingsAreCompatible(a, b))
  check('match-opponent pairs with anything on the same board', settingsAreCompatible(wild, b))
  check('different board sizes never pair', !settingsAreCompatible(a, makeSettings({ boardSize: 7 })))
}

// ---------------------------------------------------------------------------
section('Regression: legacy direction bug')
// ---------------------------------------------------------------------------
{
  // The old Board.tsx highlighted player1 moving DOWN while the engine moved it
  // UP. Both sides now come from destinationsFor, so they cannot disagree.
  const st = fromAscii(['.....', '.....', '..a..', '.....', '.....'], 'player1')
  const d = destinationsFor(st, { row: 2, col: 2 })
  const engineAccepts = !applyMove(st, { row: 2, col: 2 }, { row: 1, col: 2 }).error
  check('highlight and engine agree on forward', d.slides.some((s) => s.row === 1) && engineAccepts)
  check('capture generator agrees with move generator', getCaptures(st.board, 'player1').length === 0)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed > 0 ? 1 : 0)
