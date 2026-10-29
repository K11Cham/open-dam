import { OPENING_ANSWERS, OPENING_HINT } from './openings'
import type { PuzzleSpec } from './puzzle'
import type { ExampleSpec } from './script'

/**
 * The tutorial, as data. Each chapter is a list of sections; a section is a
 * heading, paragraphs, and optionally an example board. `{p1}` and `{p2}` in
 * any text become the current theme's side names.
 *
 * Coordinates: files a–e left to right, ranks 1–5 bottom to top. {p1} starts
 * at the bottom and moves up; {p2} starts at the top and moves down.
 *
 * A section can also hold a puzzle, where the reader plays {p1} and has to
 * find the move the section teaches (see puzzle.ts).
 */
export interface ChapterSection {
  heading: string
  paragraphs: string[]
  example?: ExampleSpec
  puzzle?: PuzzleSpec
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
            {
              play: 'a5-b5',
              caption: '{p2} steps sideways as well. Going back from b4 to b3 would be refused: pieces never retreat.',
            },
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
      {
        heading: 'Your turn: take it',
        paragraphs: ['Pick up a piece by tapping it, then tap where it should go. You can also drag it.'],
        puzzle: {
          id: 'moving-capture',
          rows: ['b...b', '.....', '..ba.', '.....', 'a....'],
          toMove: 'player1',
          goal: 'Capture the {p2} piece next to yours.',
          hint: 'Your piece on d3 can jump sideways. Look at the square just past c3.',
          turns: [{ accept: ['d3xb3'], praise: 'Jumped and removed.' }],
          solved: 'That is a capture: over the piece, onto the empty square beyond it.',
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
            {
              play: 'b1xb3',
              caption: '{p1} jumps b2 and lands on b3. Another capture is available from here, so it is still {p1}’s turn.',
            },
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
            {
              play: 'call b3',
              caption: '{p2} calls it, and the {p1} piece on b3 is removed. Calling does not use up {p2}’s turn.',
            },
            { play: 'a5-a4', caption: '{p2} then makes a normal move.' },
          ],
        },
      },
      {
        heading: 'Your turn: take three',
        paragraphs: ['One piece, three captures, one turn. Each jump can turn a corner.'],
        puzzle: {
          id: 'chains-three',
          rows: ['.....', 'b..b.', '..b..', '.b...', '.a..a'],
          toMove: 'player1',
          goal: 'Take three {p2} pieces in one turn with the piece on b1.',
          hint: 'Start straight up over b2. After each landing, look forward and sideways.',
          turns: [
            { accept: ['b1xb3'], praise: 'One. You are still on move, so keep going.' },
            { accept: ['b3xd3'], praise: 'Two. One more.' },
            { accept: ['d3xd5'], praise: 'Three, and it landed on the far row, so it is crowned.' },
          ],
          solved: 'Three pieces in one turn, and a king at the end of it.',
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
            {
              play: 'a3xe3',
              caption: 'It jumps c3 and chooses to land on e3, two squares past it. Landing on d3 would also have been legal.',
            },
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
      {
        heading: 'Your turn: call it',
        paragraphs: ['When a call is open, the pieces you can call are marked and a Call button appears.'],
        puzzle: {
          id: 'calling-call',
          rows: ['b.b.b', '..b..', '..a..', '.....', 'a....'],
          toMove: 'player2',
          setup: ['a5-a4'],
          goal: '{p2} just played a5 to a4, but its piece on c4 could have captured yours on c3. Punish it.',
          hint: 'Press Call. It removes the piece that skipped the capture.',
          turns: [{ accept: ['call'], praise: 'Called. The piece on c4 is gone.' }],
          solved: 'Calling cost you nothing: it is still your move.',
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
            {
              play: 'a2-c3',
              caption: '{p1} sends the piece on a2 straight into the centre. Only the first move may jump like this.',
            },
            { play: 'a3-a2', caption: '{p2} has only one legal answer: a3 steps into the square a2 left.' },
            {
              play: 'c3xa3',
              caption:
                'That empties a3, so the centre piece jumps b3 sideways into it. The Winning plans chapter goes through every first move like this.',
            },
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
              caption:
                '{p1} captures c3. Each side is now down to one piece, so both are crowned on the spot, and the new {p1} king can keep going.',
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
        heading: 'Cover the square behind',
        paragraphs: [
          'A piece can be jumped when an enemy is right next to it and the square on the other side is empty. So the squares behind and beside your pieces matter as much as the pieces themselves.',
          'Two pieces one behind the other cannot be jumped from the front. Two side by side protect each other from the side. The edge of the board counts as a friend: nothing lands off the board.',
        ],
        puzzle: {
          id: 'tempo-safe',
          rows: ['.....', '.b.b.', '.....', 'aaaaa', '.....'],
          toMove: 'player1',
          goal: 'Move one piece forward without giving {p2} anything to capture.',
          hint: 'Stepping up under b4 or d4 leaves an empty square behind you. Find a step with nobody waiting above it.',
          turns: [{ accept: ['c2-c3'], test: 'safe', praise: 'Nothing for {p2} to take.' }],
          mistakes: [
            { play: 'b2-b3', why: 'b3 sits right under b4, and b2 behind it is now empty, so b4 jumps you.', punish: ['b4xb2'] },
            { play: 'd2-d3', why: 'd3 sits right under d4, and d2 behind it is now empty, so d4 jumps you.', punish: ['d4xd2'] },
          ],
          solved: 'Before every step, ask: what is next to the square I land on, and what is behind it?',
        },
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
          'Before you offer, check every way the bait can be taken, not only the one you want. A sacrifice that leaves an empty square behind it can be taken from the side instead.',
        ],
        puzzle: {
          id: 'sacrifices-two',
          rows: ['b...b', '.b...', 'a.b..', '.a...', '.a..a'],
          toMove: 'player1',
          goal: 'Give {p2} one piece so that you take two back.',
          hint: 'Put a piece on b3, under b4, so that b4 has to jump into b2, right in front of your b1. Which piece can go there without leaving a hole that c3 can use?',
          turns: [
            {
              accept: ['b2-b3'],
              praise: 'Offered. c3 cannot take it sideways: a3 is still full.',
              reply: 'b4xb2',
              then: 'b4 took the bait and landed on b2, right in front of your b1. Collect.',
            },
            { accept: ['b1xb3'], praise: 'One back. Keep going.' },
            { accept: ['b3xd3'], praise: 'Two for one.' },
          ],
          mistakes: [
            {
              play: 'a3-b3',
              why: 'b3 is offered, but a3 is now empty, so c3 takes it sideways into a3 instead, and nothing of yours can take back.',
              punish: ['c3xa3'],
            },
          ],
          solved: 'The bait only works when every other way to take it is closed.',
        },
      },
    ],
  },
  {
    id: 'traps',
    title: 'Traps and breakthroughs',
    summary: 'The two-square gap, and the supported pair that breaks it.',
    sections: [
      {
        heading: 'The two-square trap',
        paragraphs: [
          'Put two pieces in a row with exactly two empty squares between them. Any enemy piece that steps into the gap lands next to one of yours, with an empty square beyond it, so it can be jumped sideways.',
          'One empty square is not enough: an enemy there has nothing beyond it to land on, so it is safe and blocks you. Three is too many: the middle square is safe.',
        ],
        example: {
          rows: ['....b', '.b...', 'a..a.', 'a..a.', '.....'],
          toMove: 'player2',
          intro: '{p1} has a trap on row 3: a3, two empty squares, d3.',
          steps: [
            { play: 'b4-b3', caption: '{p2} steps into the gap, next to a3.' },
            { play: 'a3xc3', caption: 'a3 jumps it and lands on c3, right beside d3. The trap became a solid pair.' },
            { play: 'e5-e4', caption: 'Skipping that capture would have let {p2} call, so the trap works on its own.' },
          ],
        },
      },
      {
        heading: 'Your turn: spring the trap',
        paragraphs: [
          'An enemy that walks in alone is a gift. If a second one stands where you land, with nothing behind it, you can take that one too.',
        ],
        puzzle: {
          id: 'traps-spring',
          rows: ['.....', '..b.b', 'ab.a.', 'a..a.', '.....'],
          toMove: 'player1',
          goal: '{p2} stepped into your trap on b3. Make it pay as much as you can.',
          hint: 'Jump from a3. Then look straight up from where you land.',
          turns: [
            { accept: ['a3xc3'], praise: 'Taken. Now look up from c3: nothing is behind c4.' },
            { accept: ['c3xc5'], praise: 'Two pieces, and the far row crowns you.' },
          ],
          solved: 'The piece on c4 had nothing behind it, so the trap paid twice.',
        },
      },
      {
        heading: 'Breaking a trap',
        paragraphs: [
          'A trap has a weakness: its capture lands on a fixed square. Line up two pieces in the column that capture lands in, one behind the other, and then send a third piece into the gap.',
          'The defender has to take, or be called. The capture lands right in front of your column, your back piece stops the chain, and your front piece jumps the capturer.',
        ],
        puzzle: {
          id: 'traps-break',
          rows: ['....b', 'b..b.', '.aa..', '..a..', '.....'],
          toMove: 'player1',
          goal: '{p2} has a trap on row 4: a4, two empty squares, d4. Break through it.',
          hint: 'Your column on c3 and c2 is aimed at c4, the square a4 lands on when it captures. Feed the trap from b3.',
          turns: [
            {
              accept: ['b3-b4'],
              praise: 'Bait. {p2} must take it or be called.',
              reply: 'a4xc4',
              then: 'a4 took it and landed on c4, right in front of your column. c2 stops it going further. Your move.',
            },
            { accept: ['c3xc5'], praise: 'Through, and crowned on the far row.' },
          ],
          mistakes: [
            {
              play: 'c3-c4',
              why: 'c4 lands right beside d4, and b4 on the far side of it is empty, so d4 jumps it sideways.',
              punish: ['d4xb4'],
            },
          ],
          solved: 'One piece given, a king made. The piece on c2 mattered: it stopped a4 jumping on to c2.',
        },
      },
      {
        heading: 'Your turn: defend the trap',
        paragraphs: [
          'The defence is to fill the square behind where your capture lands. Then the attacker’s front piece has nowhere to land, and your capture is safe.',
        ],
        puzzle: {
          id: 'traps-defend',
          rows: ['....b', '..b..', '.bb..', 'a..a.', '.a...'],
          toMove: 'player1',
          goal: '{p2} is lining up on your trap (a2, gap, d2). If b3 steps in and you take it, you land on c2, and c3 jumps you into your home row. Stop that.',
          hint: 'Your capture would land on c2. Fill the square behind it.',
          turns: [
            { accept: ['b1-c1'], praise: 'c1 is covered.', reply: 'b3-b2', then: 'b3 stepped into the gap anyway. Take it.' },
            { accept: ['a2xc2'], praise: 'Taken, and c3 cannot jump you: c1 is full.' },
          ],
          mistakes: [
            {
              play: 'b1-b2',
              why: 'That plugs the gap, but b2 now has an empty square behind it: b3 jumps into your home row and is crowned.',
              punish: ['b3xb1'],
            },
          ],
          solved: 'A trap needs a floor. Keep the squares behind its landing spots full.',
        },
      },
    ],
  },
  {
    id: 'endgame',
    title: 'Trapping a lone king',
    summary: 'Forcing the last king to capture into a recapture, and closing the net.',
    sections: [
      {
        heading: 'Why a lone king is hard to catch',
        paragraphs: [
          'A player down to one piece has it crowned at once, and one piece each is a draw. So winning means taking every piece, and a lone king is slippery: it crosses the board in one move and never has to stop next to you.',
          'Its weakness is the calling rule. If the lone king can capture and does not, its last piece is called and the game is over. So a lone king that can capture effectively must. Offer it a piece where every square it can land on leads into your recapture.',
        ],
      },
      {
        heading: 'Your turn: take it or be called',
        paragraphs: ['Men can do this too. The piece behind your bait decides where the king lands.'],
        puzzle: {
          id: 'endgame-men',
          rows: ['.....', '..B..', '.....', 'a.a..', '..a..'],
          toMove: 'player1',
          goal: '{p2} has one king left, on c4. Win the game with your men.',
          hint: 'Put a piece right under the king. With c1 behind, the king can only land on one square, and c1 is waiting there.',
          turns: [
            {
              accept: ['c2-c3'],
              praise: 'Offered. The king must take it or be called.',
              reply: 'c4xc2',
              then: 'It took, and landed on c2: the only square, because c1 is full. Finish it.',
            },
            { accept: ['c1xc3'], test: 'wins', praise: 'No {p2} pieces left.' },
          ],
          mistakes: [
            {
              play: 'c1-b1',
              why: 'Now c1 is empty, so the king jumps c2, lands on c1, and runs on to take every piece you have.',
              punish: ['c4xc1', 'c1xa1', 'a1xa3'],
            },
            {
              play: 'c2-d2',
              playable: true,
              why: 'Safe, but it threatens nothing, and the king walks away. Give it something it has to take.',
            },
          ],
          solved: 'Bait in front, a floor behind: the king has to land where you can take it.',
        },
      },
      {
        heading: 'Your turn: offer a king',
        paragraphs: ['With two kings against one, you can afford to give one away, as long as the other one takes back.'],
        puzzle: {
          id: 'endgame-offer',
          rows: ['B...A', '.....', '..A..', '.....', '.....'],
          toMove: 'player1',
          goal: 'Two kings against one. Win in two moves.',
          hint: 'Put a king on row 5, between {p2}’s king on a5 and yours on e5.',
          turns: [
            {
              accept: ['c3-c5'],
              praise: 'Offered. The king must jump it, and e5 blocks every landing square but d5.',
              reply: 'a5xd5',
              then: 'It landed on d5, right next to your king on e5. Finish it.',
            },
            { accept: ['e5xc5'], test: 'wins', praise: 'Caught.' },
          ],
          mistakes: [
            {
              play: 'e5-b5',
              why: 'b5 is right next to the king with c5 empty behind it, so it jumps, and lands on the c-file above your other king, and keeps going.',
              punish: ['a5xc5', 'c5xc1'],
            },
            {
              play: 'e5-d5',
              why: 'The king jumps d5 and lands on e5, where nothing of yours can reach it. One king each is a draw.',
              punish: ['a5xe5'],
            },
          ],
          solved: 'Giving a king away is fine when the only landing square is covered.',
        },
      },
      {
        heading: 'Your turn: close the net',
        paragraphs: [
          'In a corner a king has only two lines to move along. Cover both, and every move it makes walks into a capture. Or offer it a piece on one of them.',
        ],
        puzzle: {
          id: 'endgame-net',
          rows: ['B....', '.....', '....A', '.....', 'A....'],
          toMove: 'player1',
          goal: '{p2}’s king is in the a5 corner. Your a1 king already covers the a-file. Win in two moves.',
          hint: 'Use the e3 king. Either cover row 5 as well, or offer it on the a-file where a1 takes back.',
          turns: [
            {
              accept: ['e3-e5', 'e3-a3'],
              praise: 'Caught.',
              explain: {
                'e3-e5': {
                  text: 'Both lines are covered: e5 watches row 5 and a1 watches the a-file. Wherever the king goes, it lands next to one of your kings with an empty square behind it.',
                  line: ['a5-b5', 'e5xa5'],
                },
                'e3-a3': {
                  text: 'Offered on the a-file. The king must jump a3, and with a1 full it can only land on a2, right in front of a1.',
                  line: ['a5xa2', 'a1xa3'],
                },
              },
            },
          ],
          mistakes: [
            {
              play: 'a1-a4',
              why: 'That gives the king a piece with empty squares behind it: it jumps a4 and lands on the a-file below, out of reach. One king each is a draw.',
              punish: ['a5xa1'],
            },
          ],
          solved: 'Drive a lone king to a corner, then take away both of its lines.',
        },
      },
    ],
  },
  {
    id: 'plans',
    title: 'Winning plans',
    summary: 'Choosing an opening, guarding the home row, and winning by blocking.',
    sections: [
      {
        heading: 'Your turn: choose an opening',
        paragraphs: [
          'On 5×5, 7×7 and 9×9 the board starts packed, so whichever square your first move empties decides {p2}’s reply. Usually {p2} has exactly one legal answer.',
          'Never empty your home row: a piece that reaches it is crowned. And look one move further, at what {p2}’s answer leaves behind: often the square {p2} empties is one your pieces can jump into.',
        ],
        puzzle: {
          id: 'plans-opening',
          rows: 'start',
          toMove: 'player1',
          goal: 'Send a piece to the centre, c3, with a strong first move. Whatever you pick, you will see why it is strong or weak.',
          hint: OPENING_HINT,
          turns: [
            {
              accept: OPENING_ANSWERS,
              praise: 'A strong start.',
              explain: {
                'a2-c3': {
                  text: '{p2}’s only move is a3 into a2, filling the hole. That empties a3, so your centre piece jumps b3 sideways into it: a piece up on move two. The {p2} piece on a2 is stuck, held by a1 and b2, with c2 stopping it jumping. {p1} won all 16 of the computer’s games from here.',
                  line: ['a3-a2', 'c3xa3'],
                },
                'e2-c3': {
                  text: '{p2}’s only move is e4 jumping e3 into the hole at e2, deep in your camp, and e1 jumps straight back. The trade is even, but {p2}’s right edge is opened while yours stays solid. {p1} won all 16.',
                  line: ['e4xe2', 'e1xe3'],
                },
                'e3-c3': {
                  text: '{p2}’s only move is e4 into e3, which leaves e4 empty behind it: e2 jumps it, and e5 takes back. An even trade that opens the edge where you have more pieces. {p1} won 14 of 16 and drew 2.',
                  line: ['e4-e3', 'e2xe4', 'e5xe3'],
                },
                'd2-c3': {
                  text: '{p2}’s only move is d4 jumping d3 into the hole at d2, and d1 jumps straight back to d3. Even material, but {p2}’s d-file is open and your centre is strong. {p1} won 14 of 16.',
                  line: ['d4xd2', 'd1xd3'],
                },
              },
            },
          ],
          mistakes: [
            {
              play: 'a1-c3',
              why: 'That empties your home row. {p2}’s only move is a3 jumping a2 into a1, crowned on move one. You win a piece back, but a king in your camp is worth far more. {p1} lost all 16 of the computer’s games.',
              punish: ['a3xa1'],
            },
            {
              play: 'b1-c3',
              why: 'That empties your home row. {p2}’s only move is b3 jumping b2 into b1, crowned on move one. Your pieces hem the king in for now, so it is not lost, but {p1} won only 10 of 16 and lost 6.',
              punish: ['b3xb1'],
            },
            {
              play: 'b2-c3',
              why: '{p2}’s only move is b3 into b2, one step from your home row. a2 and c2 block each other’s jumps at it, and if b1 jumps it, b4 jumps back into b2 with b1 now empty. You spend the game guarding b1. {p1} lost all 16.',
              punish: ['b3-b2'],
            },
            {
              play: 'c2-c3',
              playable: true,
              why: '{p2}’s only move is c4 jumping your centre piece into c2, and c1 takes back. You have traded the centre for nothing, and the game tends to a draw: 11 of 16 were drawn.',
              punish: ['c4xc2', 'c1xc3'],
            },
            {
              play: 'd3-c3',
              playable: true,
              why: 'This is the one opening that gives {p2} a choice. b3 can jump your centre piece into the d3 you left, and e3 takes back: a plain trade with nothing gained. {p1} won 10 of 16 but lost 4.',
              punish: ['b3xd3', 'e3xc3'],
            },
          ],
          solved: 'In every strong opening, {p2}’s forced answer either loses a piece or opens {p2}’s own side.',
        },
      },
      {
        heading: 'Win by blocking',
        paragraphs: [
          'A player who cannot move, and has nothing to call, loses. Because pieces never go back, a few well-placed pieces can freeze an army without taking anything.',
        ],
        puzzle: {
          id: 'plans-block',
          rows: ['.....', '.....', 'a...a', 'b.aab', 'aa..a'],
          toMove: 'player1',
          goal: 'Win this game in one move, without capturing.',
          hint: '{p2}’s piece on e2 is already stuck. The one on a2 can only go to b2.',
          turns: [{ accept: ['b1-b2'], test: 'wins', praise: '{p2} has no move left.' }],
          mistakes: [
            { play: 'c2-b2', why: 'That fills b2, but c2 beside it is now empty, so a2 jumps sideways.', punish: ['a2xc2'] },
          ],
          solved: 'Blocked pieces count for nothing. When you have the space, look for the freeze.',
        },
      },
      {
        heading: 'Spare moves',
        paragraphs: [
          'Late in a game it often matters who runs out of safe moves first. Sideways steps do not commit you to anything, so they are your waiting moves. Count them for both sides before you push.',
        ],
      },
    ],
  },
]

export const findChapter = (id: string | undefined) => CHAPTERS.find((c) => c.id === id) ?? null
