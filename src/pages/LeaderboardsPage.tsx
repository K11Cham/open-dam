import { Info } from 'lucide-react'
import { useState } from 'react'
import AppShell from '../components/layout/AppShell'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import { LEADERBOARDS } from '../data/leaderboards'
import { usePageTitle } from '../lib/usePageTitle'

/** Sample standings. Real ratings arrive with the game server; the page says so up front. */
export default function LeaderboardsPage() {
  usePageTitle('Leaderboards')
  const [boardId, setBoardId] = useState(LEADERBOARDS[0].id)
  const board = LEADERBOARDS.find((entry) => entry.id === boardId) ?? LEADERBOARDS[0]

  return (
    <AppShell>
      <div className="page">
        <header className="page-head">
          <p className="eyebrow">Community</p>
          <h1 className="page-title">Leaderboards</h1>
        </header>

        <p className="notice">
          <Info size={16} aria-hidden />
          Ratings start once online play has a server. Until then this page shows made-up sample players, so you can see how it
          will look.
        </p>

        <Segmented
          label="Leaderboard"
          wrap
          value={boardId}
          options={LEADERBOARDS.map((entry) => ({
            value: entry.id,
            label: `${entry.modeLabel} · ${entry.boardSize}×${entry.boardSize} · ${entry.timeControlLabel}`,
          }))}
          onChange={setBoardId}
        />

        <Panel className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">
              Sample standings, {board.modeLabel}, {board.boardSize} by {board.boardSize}, {board.timeControlLabel}
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col" className="is-numeric">
                  Rating
                </th>
                <th scope="col" className="is-numeric">
                  Games
                </th>
                <th scope="col" className="is-numeric">
                  Win rate
                </th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((entry) => (
                <tr key={entry.name}>
                  <td className="is-numeric">{entry.rank}</td>
                  <th scope="row">{entry.name}</th>
                  <td className="is-numeric">{entry.rating}</td>
                  <td className="is-numeric">{entry.games}</td>
                  <td className="is-numeric">{Math.round(entry.winRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </AppShell>
  )
}
