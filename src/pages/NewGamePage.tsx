import { Bot, Globe, Play, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DIFFICULTIES, DIFFICULTY_IDS } from '../ai/difficulty'
import type { DifficultyId } from '../ai/difficulty'
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

type Mode = 'computer' | 'hotseat' | 'online'

const DEFAULT_SETUP_BOT: DifficultyId = 'ndo'

const isDifficulty = (value: OpponentChoice): value is DifficultyId => (DIFFICULTY_IDS as string[]).includes(value)

/** How strong an opponent is, as filled pips beside its rating. */
function Strength({ level, elo }: { level: number; elo: number }) {
  return (
    <span className="strength">
      <span className="strength__pips" aria-hidden>
        {DIFFICULTY_IDS.map((id, index) => (
          <span key={id} className={index < level ? 'strength__pip is-on' : 'strength__pip'} />
        ))}
      </span>
      <span aria-hidden>~{elo}</span>
      <span className="visually-hidden">
        , strength {level} of {DIFFICULTY_IDS.length}, rated about {elo}
      </span>
    </span>
  )
}

/**
 * New game: first how you play (the computer, pass and play, or online), then
 * who or which side, then the rules. Starting saves the setup
 * for next time, creates the match record, and opens it. If an unfinished game
 * is saved, it asks before replacing it.
 */
export default function NewGamePage() {
  usePageTitle('New game')
  const navigate = useNavigate()
  const sideNames = useSideNames()
  const [setup, setSetup] = useState<GameSetup>(loadLastSetup)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const mode: Mode = setup.opponent === 'hotseat' || setup.opponent === 'online' ? setup.opponent : 'computer'
  // The computer opponent last picked, so switching to another mode and back keeps it.
  const [bot, setBot] = useState<DifficultyId>(isDifficulty(setup.opponent) ? setup.opponent : DEFAULT_SETUP_BOT)

  const modes: Choice<Mode>[] = [
    {
      value: 'computer',
      title: 'Computer',
      icon: <Bot size={18} aria-hidden />,
      description: 'Five opponents, from a beginner who plays on impulse to a master.',
    },
    {
      value: 'hotseat',
      title: 'Pass and play',
      icon: <Users size={18} aria-hidden />,
      description: 'Two people on one device, taking turns. The other player answers offers to undo or draw.',
    },
    {
      value: 'online',
      title: 'Online',
      badge: 'Preview',
      icon: <Globe size={18} aria-hidden />,
      description: 'Invite someone with a link. For now this works between two tabs of one browser.',
    },
  ]

  const bots: Choice<DifficultyId>[] = DIFFICULTY_IDS.map((id, index) => ({
    value: id,
    title: DIFFICULTIES[id].name,
    note: DIFFICULTIES[id].meaning,
    badge: <Strength level={index + 1} elo={DIFFICULTIES[id].elo} />,
    description: DIFFICULTIES[id].blurb,
  }))

  const chooseMode = (next: Mode) => setSetup({ ...setup, opponent: next === 'computer' ? bot : next })
  const chooseBot = (next: DifficultyId) => {
    setBot(next)
    setSetup({ ...setup, opponent: next })
  }

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

        <Panel as="section" aria-labelledby="mode-h" className="setup__mode">
          <h2 id="mode-h" className="panel__title">
            How do you want to play?
          </h2>
          <ChoiceCards label="How do you want to play?" choices={modes} value={mode} onChange={chooseMode} hideLabel />
        </Panel>

        <div className="setup">
          <Panel as="section" aria-labelledby="opponent-h" className="setup__opponent">
            <h2 id="opponent-h" className="panel__title">
              {mode === 'computer' ? 'Opponent' : mode === 'hotseat' ? 'Players' : 'Your side'}
            </h2>
            {mode === 'computer' && (
              <ChoiceCards
                label="Choose who you play, weakest first"
                choices={bots}
                value={bot}
                onChange={chooseBot}
                layout="list"
              />
            )}
            {mode === 'hotseat' && (
              <p className="panel__text">
                {sideNames.player1} moves first. Hand the device over after each move; the board stays the same way up.
              </p>
            )}
            {mode === 'online' && (
              <p className="panel__text">Once the game starts you get a link to send. Whoever opens it takes the other side.</p>
            )}
            {mode !== 'hotseat' && (
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
