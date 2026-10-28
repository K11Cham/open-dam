import type { ExampleSpec } from './script'

/**
 * The tutorial, as data. Each chapter is a list of sections; a section is a
 * heading, paragraphs, and optionally an example board. `{p1}` and `{p2}` in
 * any text become the current theme's side names.
 *
 * Coordinates: files a–e left to right, ranks 1–5 bottom to top. {p1} starts
 * at the bottom and moves up; {p2} starts at the top and moves down.
 */
export interface ChapterSection {
  heading: string
  paragraphs: string[]
  example?: ExampleSpec
}

export interface Chapter {
  id: string
  title: string
  summary: string
  sections: ChapterSection[]
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'moving',
    title: 'Moving and capturing',
    summary: 'How pieces travel, and how a capture works.',
    sections: [
      {
        heading: 'How pieces move',
        paragraphs: [
          'A piece moves one square at a time: forward, left or right. Never diagonally, and never backward.',
          '{p1} starts at the bottom and moves up the board. {p2} starts at the top and moves down. Because pieces cannot retreat, every step forward is a commitment.',
        ],
        example: {
          rows: ['b...b', '.....', '..a..', '.....', 'a....'],
          toMove: 'player1',
          intro: '{p1} to move. The piece on c3 has three choices: up, left or right.',
          steps: [
            { play: 'c3-c4', caption: '{p1} moves forward, from c3 to c4.' },
            { play: 'e5-e4', caption: '{p2} moves forward too. For {p2}, forward is down the board.' },
            { play: 'c4-b4', caption: 'Sideways is always allowed: c4 to b4.' },
            { play: 'a5-b5', caption: '{p2} steps sideways as well. Going back from b4 to b3 would be refused: pieces never retreat.' },
          ],
        },
      },
      {
        heading: 'How a capture works',
        paragraphs: [
          'A capture is a jump. If an enemy piece is right next to yours, straight across rather than diagonal, and the square just beyond it is empty, you may jump over it and land there. The piece you jumped is removed.',
          'Captures follow the same directions as moves, so a piece can capture forward or sideways, but not backward.',
          'Captures are never forced. You may always play something else instead, but passing one up has a cost, which the chapter on calling explains.',
        ],
        example: {
          rows: ['b...b', '.....', '.ab..', '.....', 'a....'],
          toMove: 'player1',
          intro: '{p1}’s piece on b3 sits next to {p2}’s piece on c3, and d3 beyond it is empty.',
          steps: [
            { play: 'b3xd3', caption: '{p1} jumps sideways over c3 and lands on d3. The {p2} piece is removed.' },
            { play: 'a5-a4', caption: 'Then it is {p2}’s turn as usual.' },
          ],
        },
      },
    ],
  },
  {
    id: 'chains',
    title: 'Chain captures',
    summary: 'Taking more than one piece in a turn.',
    sections: [
      {
        heading: 'Keep jumping',
        paragraphs: [
          'If, after a capture, the same piece can capture again, it may carry on. Each jump can change direction, as long as each one is a legal capture on its own.',
          'All the jumps together are one turn. Your opponent moves only when you stop.',
        ],
        example: {
          rows: ['b...b', '.....', '..b..', '.b...', '.a..a'],
          toMove: 'player1',
          intro: '{p1}’s piece on b1 can take b2, and from there another capture opens up.',
          steps: [
            { play: 'b1xb3', caption: '{p1} jumps b2 and lands on b3. Another capture is available from here, so it is still {p1}’s turn.' },
            { play: 'b3xd3', caption: 'The chain continues sideways: b3 jumps c3 and lands on d3. Two pieces in one turn.' },
            { play: 'a5-a4', caption: 'No more captures from d3, so the turn passes to {p2}.' },
          ],
        },
      },
      {
        heading: 'Stopping early',
        paragraphs: [
          'You may stop a chain whenever you like by ending your turn. But with the standard rules, stopping while a capture is still available counts as passing it up: your opponent may call the piece that stopped.',
        ],
        example: {
          rows: ['b...b', '.....', '..b..', '.b...', '.a..a'],
          toMove: 'player1',
          intro: 'The same position. This time {p1} stops after the first jump.',
          steps: [
            { play: 'b1xb3', caption: '{p1} takes b2 and lands on b3.' },
            { play: 'end', caption: '{p1} ends the turn, leaving the capture of c3 untaken. The piece on b3 is now callable.' },
            { play: 'call b3', caption: '{p2} calls it, and the {p1} piece on b3 is removed. Calling does not use up {p2}’s turn.' },
            { play: 'a5-a4', caption: '{p2} then makes a normal move.' },
          ],
        },
      },
    ],
  },
  {
    id: 'kings',
    title: 'Kings',
    summary: 'Crowning, long-range moves, and choosing where to land.',
    sections: [
      {
        heading: 'Crowning',
        paragraphs: [
          'A piece that reaches the far row is crowned and becomes a king. A king moves any distance in a straight line, in all four directions, backward included.',
        ],
        example: {
          rows: ['b...b', '..a..', '.....', '.....', 'a....'],
          toMove: 'player1',
          intro: '{p1}’s piece on c4 is one step from the far row.',
          steps: [
            { play: 'c4-c5', caption: 'It reaches c5 and is crowned.' },
            { play: 'a5-a4', caption: '{p2} moves.' },
            { play: 'c5-c1', caption: 'The new king slides all the way back down to c1 in a single move.' },
          ],
        },
      },
      {
        heading: 'Long captures',
        paragraphs: [
          'A king captures from a distance: it slides up to an enemy piece with nothing in between, jumps it, and may land on any empty square beyond it.',
          'Choosing the landing square is often the real decision, because it decides what the king can capture next and where it is safe.',
        ],
        example: {
          rows: ['b...b', '.....', 'A.b..', '.....', '....a'],
          toMove: 'player1',
          intro: '{p1}’s king on a3 sees {p2}’s piece on c3 along the row.',
          steps: [
            { play: 'a3xe3', caption: 'It jumps c3 and chooses to land on e3, two squares past it. Landing on d3 would also have been legal.' },
            { play: 'a5-a4', caption: '{p2} to move.' },
          ],
        },
      },
      {
        heading: 'Crowned in the middle of a chain',
        paragraphs: [
          'What happens when a piece reaches the far row partway through a chain is a house rule, chosen before the game. By default the piece is crowned at once and may continue the chain as a king. You can instead crown it only when the chain ends, or have the crowning end the turn.',
        ],
      },
    ],
  },
  {
    id: 'calling',
    title: 'Calling',
    summary: 'Punishing a capture your opponent passed up.',
    sections: [
      {
        heading: 'Pass up a capture, and it can be called',
        paragraphs: [
          'Captures are optional, but not free to ignore. If your opponent could have captured and did not, then on your turn you may call it: the piece that could have captured is removed from the board.',
          'Calling is free. It does not use your turn, and you still move afterwards. It is also optional, and the chance is gone once you make your move.',
          'If several pieces could have captured, the standard rule lets the caller choose one to remove. A house rule removes all of them.',
        ],
        example: {
          rows: ['b...b', '.....', '..b..', '..a..', 'a...a'],
          toMove: 'player1',
          intro: '{p1}’s piece on c2 could capture {p2}’s piece on c3.',
          steps: [
            { play: 'a1-a2', caption: '{p1} plays a1 to a2 instead and leaves the capture. The move list marks this with “?!”.' },
            { play: 'call', caption: '{p2} calls it: the {p1} piece on c2 that could have captured is removed.' },
            { play: 'e5-e4', caption: '{p2} still gets a normal move.' },
          ],
        },
      },
    ],
  },
  {
    id: 'opening',
    title: 'The opening',
    summary: 'The starting positions and the first move.',
    sections: [
      {
        heading: 'Interlocking start',
        paragraphs: [
          'On 5×5, 7×7 and 9×9 boards the two armies fill the board and interlock around a single empty square in the middle. Each side has 12 pieces on 5×5.',
          'Because the centre is the only empty square, {p1}’s first move is special: any {p1} piece may go straight into the centre, not just a neighbour, as long as {p2} still has a legal reply.',
        ],
        example: {
          rows: 'start',
          toMove: 'player1',
          intro: 'The 5×5 start. The centre square, c3, is empty.',
          steps: [
            { play: 'a2-c3', caption: '{p1} sends the piece on a2 straight into the centre. Only the first move may jump like this.' },
            { play: 'a3-a2', caption: '{p2} answers by stepping into the square it left.' },
          ],
        },
      },
      {
        heading: 'Row start',
        paragraphs: [
          'On 6×6 and 8×8 boards each side starts in full rows with two empty rows between the armies, and the first move is an ordinary move.',
        ],
      },
    ],
  },
  {
    id: 'endings',
    title: 'Winning, losing and drawing',
    summary: 'Auto-kings, blocked pieces, ties and draws.',
    sections: [
      {
        heading: 'How a game is won',
        paragraphs: [
          'You win when your opponent has no pieces left, or when it is their turn and they have no legal move and nothing to call.',
          'A player can also resign, and on a timed board a player who runs out of time loses.',
        ],
        example: {
          rows: ['baa..', 'a....', 'a....', '.....', '..a..'],
          toMove: 'player1',
          intro: '{p2}’s only piece is on a5, hemmed in by {p1}’s pieces, which cannot be jumped.',
          steps: [{ play: 'c1-c2', caption: '{p1} makes any move, and {p2} has no legal reply. {p1} wins.' }],
        },
      },
      {
        heading: 'The last piece is crowned',
        paragraphs: [
          'A player down to a single piece has it crowned straight away. If both players are down to one piece and neither can capture or call, the game is a draw.',
        ],
        example: {
          rows: ['.....', '.b...', '..b..', '..a..', '.....'],
          toMove: 'player1',
          intro: 'Two {p2} pieces against one {p1} piece.',
          steps: [
            {
              play: 'c2xc4',
              caption: '{p1} captures c3. Each side is now down to one piece, so both are crowned on the spot, and the new {p1} king can keep going.',
            },
            { play: 'c4xa4', caption: 'As a king it jumps b4 along the row. {p2} has no pieces left, so {p1} wins.' },
          ],
        },
      },
      {
        heading: 'Draws',
        paragraphs: [
          'Because captures are optional, a player who is behind could avoid them forever. So the game is drawn when the same position appears three times, or after 25 moves each without a capture. Players can also agree a draw.',
        ],
      },
    ],
  },
  {
    id: 'tempo',
    title: 'Tempo and shape',
    summary: 'Why one-way movement changes everything.',
    sections: [
      {
        heading: 'Every step is permanent',
        paragraphs: [
          'Pieces never move backward, so a piece that advances cannot come home to defend. Push forward with a purpose, usually toward crowning, and keep some pieces back.',
          'Your own back row is the square your opponent needs to crown. While a piece of yours sits there, nobody is crowned on that square.',
        ],
      },
      {
        heading: 'Leave nothing to call',
        paragraphs: [
          'Before you move, check whether any of your pieces can capture. If one can and you play elsewhere, you are handing your opponent a free call.',
          'The reverse is also true: put your pieces where your opponent must either capture into a bad square or leave a capture that you can call.',
        ],
      },
    ],
  },
  {
    id: 'sacrifices',
    title: 'Sacrifices',
    summary: 'Giving one piece to take two.',
    sections: [
      {
        heading: 'Offer one, take two',
        paragraphs: [
          'Because a skipped capture can be called, an opponent usually takes what you offer. You can use that to pull their piece onto a square where you get a chain back.',
        ],
        example: {
          rows: ['b...b', '.b...', 'a.b..', '.....', '.a..a'],
          toMove: 'player1',
          intro: '{p1} wants the {p2} pieces on b4 and c3.',
          steps: [
            { play: 'a3-b3', caption: '{p1} steps into b3, right under {p2}’s piece on b4.' },
            { play: 'b4xb2', caption: '{p2} takes it, landing on b2. Ignoring it would have let {p1} call.' },
            { play: 'b1xb3', caption: 'Now {p1} jumps back over b2 to b3…' },
            { play: 'b3xd3', caption: '…and keeps going over c3 to d3. One piece given, two taken.' },
          ],
        },
      },
    ],
  },
]

export const findChapter = (id: string | undefined) => CHAPTERS.find((c) => c.id === id) ?? null
