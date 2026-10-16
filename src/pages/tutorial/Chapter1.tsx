import ExampleBoard from './ExampleBoard'
import type { ExampleSpec } from './ExampleBoard'

/**
 * Chapter 1 — the only chapter written for real in this pass.
 *
 * Both examples are verified by the engine at run time: the scripted moves are
 * replayed through `applyMove`, so if any of them were illegal the board would
 * refuse them rather than animate a lie.
 */

const MOVEMENT: ExampleSpec = {
  size: 5,
  rows: ['.....', '.....', '..a..', '.....', '.....'],
  toMove: 'player1',
  script: [
    { from: 'c3', to: 'c4', caption: 'Forward. Red advances toward the top of the board.' },
    { from: 'c4', to: 'b4', caption: 'Sideways. Left and right are always available.' },
    { from: 'b4', to: 'c4', caption: 'And back across. What a piece cannot do is retreat — c4 to c3 would be illegal.' },
  ],
}

const CAPTURE: ExampleSpec = {
  size: 5,
  rows: ['.....', '..b..', '..a..', '.....', 'a...b'],
  toMove: 'player1',
  script: [
    {
      from: 'c3',
      to: 'c5',
      caption:
        'Red jumps the blue piece on c4 and lands on the empty square directly beyond it. The jumped piece is removed.',
    },
  ],
}

export default function Chapter1() {
  return (
    <div className="dam-prose">
      <h3>How pieces move</h3>
      <p>
        A piece moves one square at a time: forward, left, or right. Never diagonally, and never
        backward. Red starts at the bottom and advances upward; blue starts at the top and advances
        down. That one-way restriction is what makes a crowning worth having later.
      </p>

      <ExampleBoard spec={MOVEMENT} />

      <h3>How a capture works</h3>
      <p>
        A capture is a jump. If an enemy piece sits on the square next to yours — horizontally or
        vertically — and the square directly beyond it is empty, you may jump over it and land
        there. The piece you jumped comes off the board.
      </p>
      <p>
        The word is <em>may</em>. Captures are never forced in dam. You are always allowed to play
        something else instead — but passing up a capture has a cost, which chapter 4 covers.
      </p>

      <ExampleBoard spec={CAPTURE} />

      <h3>What to take away</h3>
      <p>
        Three squares to move to, one way to capture, and no obligation to take. Everything else in
        the game — chains, kings, calling — builds on these. The next chapter starts with what
        happens when a capture leaves you in position to make another one.
      </p>
    </div>
  )
}
