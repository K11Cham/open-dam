import { Cpu, Users } from 'lucide-react'
import type { DifficultyId } from '../../ai/difficulty'
import { AI_OPPONENTS } from '../../data/aiOpponents'
import type { PlayerId } from '../../game/types'
import Panel from '../ui/Panel'
import Segmented from '../ui/Segmented'

interface OpponentPickerProps {
  opponent: DifficultyId | 'human'
  onOpponentChange: (next: DifficultyId | 'human') => void
  side: PlayerId
  onSideChange: (next: PlayerId) => void
}

/**
 * Opponent selection. The tiers are described by what they can and cannot see,
 * not by a star rating — the difference between them is the evaluation they
 * use, so that is what the blurb says.
 */
export default function OpponentPicker({
  opponent,
  onOpponentChange,
  side,
  onSideChange,
}: OpponentPickerProps) {
  return (
    <Panel style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span className="dam-section-label">Opponent</span>
        <div style={{ marginTop: 8 }}>
          <Segmented
            label="Opponent"
            value={opponent}
            options={[
              { value: 'human' as const, label: 'Hot seat' },
              ...AI_OPPONENTS.map((entry) => ({
                value: entry.difficulty.id,
                label: entry.difficulty.name,
                hint: entry.difficulty.blurb,
              })),
            ]}
            onChange={onOpponentChange}
          />
        </div>
      </div>

      {opponent === 'human' ? (
        <p
          style={{
            fontSize: 12.5,
            color: 'var(--dam-ink-muted)',
            margin: 0,
            display: 'flex',
            gap: 8,
          }}
        >
          <Users size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          Two players on one device. Undo requests are accepted automatically, since the other
          player is sitting right there.
        </p>
      ) : (
        (() => {
          const entry = AI_OPPONENTS.find((option) => option.difficulty.id === opponent)
          if (!entry) return null
          return (
            <div style={{ display: 'flex', gap: 8 }}>
              <Cpu size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 13, margin: 0 }}>{entry.difficulty.blurb}</p>
                <p style={{ fontSize: 12, color: 'var(--dam-ink-muted)', margin: '6px 0 0' }}>
                  Rated {entry.difficulty.elo} — {entry.bandLabel}. Closest ranked pool:{' '}
                  {entry.poolLabel}. Searches {entry.difficulty.depth} plies with the “
                  {entry.difficulty.profile.name}” evaluation.
                </p>
              </div>
            </div>
          )
        })()
      )}

      <div>
        <span className="dam-section-label">Your side</span>
        <div style={{ marginTop: 8 }}>
          <Segmented
            label="Your side"
            value={side}
            options={[
              { value: 'player1' as PlayerId, label: 'Red (moves first)' },
              { value: 'player2' as PlayerId, label: 'Blue' },
            ]}
            onChange={onSideChange}
          />
        </div>
      </div>
    </Panel>
  )
}
