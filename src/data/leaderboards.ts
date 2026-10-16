/**
 * MOCK DATA. Sample leaderboards across a few mode / board size / time control
 * combinations so the page has real structure to render. None of these players
 * exist and none of these ratings are computed.
 */

export interface LeaderboardEntry {
  rank: number
  name: string
  rating: number
  games: number
  winRate: number
}

export interface LeaderboardBoard {
  id: string
  modeLabel: string
  boardSize: number
  timeControlLabel: string
  entries: LeaderboardEntry[]
}

const names = [
  'sulaymaan.k', 'nightjar', 'okonkwo', 'brambleline', 'quiet_rook',
  'mmadu', 'thirteenth', 'saltflat', 'oyelaran', 'kestrelbait',
]

const makeEntries = (seed: number): LeaderboardEntry[] =>
  names.map((name, index) => ({
    rank: index + 1,
    name,
    rating: 2100 - index * 37 + ((seed * (index + 3)) % 23),
    games: 180 + ((seed * 17 + index * 29) % 420),
    winRate: 0.72 - index * 0.021 + ((seed + index) % 5) / 200,
  }))

export const LEADERBOARDS: LeaderboardBoard[] = [
  { id: 'classic-5-10', modeLabel: 'Classic', boardSize: 5, timeControlLabel: '10+1', entries: makeEntries(1) },
  { id: 'classic-9-30', modeLabel: 'Classic', boardSize: 9, timeControlLabel: '30+10', entries: makeEntries(2) },
  { id: 'blitz-5-3', modeLabel: 'Blitz', boardSize: 5, timeControlLabel: '3+0', entries: makeEntries(3) },
  { id: 'chain-7-5', modeLabel: 'Chain rules', boardSize: 7, timeControlLabel: '5+0', entries: makeEntries(4) },
]
