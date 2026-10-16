import { Info } from 'lucide-react'
import { useState } from 'react'
import AppShell from '../components/layout/AppShell'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import { LEADERBOARDS } from '../data/leaderboards'

/** SCAFFOLD: sample data only, clearly labelled as such. */
export default function LeaderboardsPage() {
  const [boardId, setBoardId] = useState(LEADERBOARDS[0].id)
  const board = LEADERBOARDS.find((entry) => entry.id === boardId) ?? LEADERBOARDS[0]

  return (
    <AppShell showNewGame={false}>
      <div className="dam-page">
        <div className="dam-section-head">
          <h1 className="dam-section-title">Leaderboards</h1>
        </div>

        <div className="dam-mock-banner">
          <Info size={14} />
          Sample data. Ratings are not computed yet — there is no elo backend behind this page.
        </div>

        <Segmented
          label="Leaderboard"
          value={boardId}
          options={LEADERBOARDS.map((entry) => ({
            value: entry.id,
            label: `${entry.modeLabel} · ${entry.boardSize}×${entry.boardSize} · ${entry.timeControlLabel}`,
          }))}
          onChange={setBoardId}
        />

        <Panel style={{ marginTop: 16, padding: 4, overflowX: 'auto' }}>
          <table className="dam-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th style={{ textAlign: 'right' }}>Rating</th>
                <th style={{ textAlign: 'right' }}>Games</th>
                <th style={{ textAlign: 'right' }}>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((entry) => (
                <tr key={entry.name}>
                  <td className="is-numeric" style={{ textAlign: 'left' }}>{entry.rank}</td>
                  <td>{entry.name}</td>
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
