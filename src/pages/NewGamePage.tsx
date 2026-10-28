import { Bot, Globe, Play, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DIFFICULTIES, DIFFICULTY_IDS } from '../ai/difficulty'
import AppShell from '../components/layout/AppShell'
import RulesForm from '../components/settings/RulesForm'
import { Button } from '../components/ui/Button'
import ChoiceCards from '../components/ui/ChoiceCards'
import type { Choice } from '../components/ui/ChoiceCards'
import { ConfirmDialog } from '../components/ui/Dialog'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import { useSideNames } from '../context/useTheme'
import type { PlayerId } from '../game/types'
import { usePageTitle } from '../lib/usePageTitle'
import { timeControlLabel } from '../lib/describe'
import { loadLastSetup, opponentLabel, recordFromSetup, saveLastSetup } from '../match/setup'
import type { GameSetup, OpponentChoice } from '../match/setup'
import { clearActiveMatch, loadActiveMatch, saveActiveMatch } from '../match/storage'

/**
 * New game: who you play, which side, and the rules. Starting saves the setup
 * for next time, creates the match record, and opens it. If an unfinished game
 * is saved, it asks before replacing it.
 */
export default function NewGamePage() {
  usePageTitle('New game')
  const navigate = useNavigate()
  const sideNames = useSideNames()
  const [setup, setSetup] = useState<GameSetup>(loadLastSetup)
  const [confirmReplace, setConfirmReplace] = useState(false)

  const choices: Choice<OpponentChoice>[] = [
    ...DIFFICULTY_IDS.map((id) => ({
      value: id,
      title: DIFFICULTIES[id].name,
      note: DIFFICULTIES[id].meaning,
      badge: `~${DIFFICULTIES[id].elo}`,
      icon: <Bot size={18} aria-hidden />,
      description: DIFFICULTIES[id].blurb,
    })),
    {
      value: 'hotseat',
      title: 'Pass and play',
      icon: <Users size={18} aria-hidden />,
      description: 'Two people on one device, taking turns. Offers to undo or draw are answered by the other player.',
    },
    {
      value: 'online',
      title: 'Online',
      badge: 'Preview',
      icon: <Globe size={18} aria-hidden />,
      description:
        'Play from two browser tabs. This uses the real online protocol; playing across devices needs the game server, which is not live yet.',
    },
  ]

  const begin = () => {
    saveLastSetup(setup)
    clearActiveMatch()
    const record = recordFromSetup(setup)
    saveActiveMatch(record)
    navigate(record.config.mode === 'online' ? `/online/${record.config.id}` : `/match/${record.config.id}`)
  }

  const start = () => {
    const active = loadActiveMatch()
    if (active && active.state.position.status.kind === 'playing' && active.record.actions.length > 0) setConfirmReplace(true)
    else begin()
  }

  const { settings } = setup
  const summary = [
    `${settings.boardSize}×${settings.boardSize}`,
    timeControlLabel(settings),
    opponentLabel(setup.opponent),
    setup.opponent === 'hotseat' ? null : `you play ${sideNames[setup.side]}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <AppShell>
      <div className="page">
        <header className="page-head">
          <p className="eyebrow">Play</p>
          <h1 className="page-title">New game</h1>
        </header>

        <div className="setup">
          <Panel as="section" aria-labelledby="opponent-h" className="setup__opponent">
            <h2 id="opponent-h" className="panel__title">
              Opponent
            </h2>
            <ChoiceCards
              label="Who do you want to play?"
              choices={choices}
              value={setup.opponent}
              onChange={(opponent) => setSetup({ ...setup, opponent })}
            />
            {setup.opponent !== 'hotseat' && (
              <Segmented
                label="Your side"
                value={setup.side}
                options={(['player1', 'player2'] as PlayerId[]).map((side) => ({
                  value: side,
                  label: side === 'player1' ? `${sideNames.player1} (moves first)` : sideNames.player2,
                }))}
                onChange={(side) => setSetup({ ...setup, side })}
              />
            )}
          </Panel>

          <Panel as="section" aria-labelledby="rules-h" className="setup__rules">
            <h2 id="rules-h" className="panel__title">
              Rules
            </h2>
            <RulesForm
              settings={settings}
              online={setup.opponent === 'online'}
              onChange={(next) => setSetup({ ...setup, settings: next })}
            />
          </Panel>
        </div>

        <div className="start-bar">
          <p className="start-bar__summary">{summary}</p>
          <Button variant="primary" size="lg" icon={<Play size={18} />} onClick={start}>
            Start game
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title="Start a new game?"
        description="You have an unfinished game saved on this device. Starting a new one will discard it."
        confirmLabel="Discard and start"
        cancelLabel="Keep it"
        tone="danger"
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => {
          setConfirmReplace(false)
          begin()
        }}
      />
    </AppShell>
  )
}
