import { Bot, Globe, Link2, Loader2, Play, Swords, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DIFFICULTIES, DIFFICULTY_IDS } from '../ai/difficulty'
import type { DifficultyId } from '../ai/difficulty'
import AppShell from '../components/layout/AppShell'
import RulesForm from '../components/settings/RulesForm'
import { Button } from '../components/ui/Button'
import ChoiceCards from '../components/ui/ChoiceCards'
import type { Choice } from '../components/ui/ChoiceCards'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { useToast } from '../components/ui/Toasts'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import { useAccount } from '../context/useAccount'
import { useSideNames } from '../context/useTheme'
import { formatClock } from '../game/clock'
import type { PlayerId } from '../game/types'
import { useMatchmaking } from '../hooks/useMatchmaking'
import { useNow } from '../hooks/useNow'
import { usePageTitle } from '../lib/usePageTitle'
import { timeControlLabel } from '../lib/describe'
import { loadLastSetup, opponentLabel, recordFromSetup, saveLastSetup } from '../match/setup'
import type { GameSetup, OpponentChoice } from '../match/setup'
import { clearActiveMatch, loadActiveMatch, saveActiveMatch } from '../match/storage'
import { poolLabel } from '../net/account'
import { accountsAvailable } from '../net/accountApi'
import { createOnlineMatch } from '../net/api'

type Mode = 'computer' | 'hotseat' | 'online'
/** Online: a rated game against a stranger of similar strength, or a link for someone you know. */
type OnlineKind = 'find' | 'invite'

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
  const toast = useToast()
  const sideNames = useSideNames()
  const account = useAccount()
  const [params] = useSearchParams()
  // `?online=find` or `?online=invite` (from the leaderboards and profiles) opens the online choice directly.
  const asked = params.get('online')
  const [setup, setSetup] = useState<GameSetup>(() => {
    const last = loadLastSetup()
    return asked === 'find' || asked === 'invite' ? { ...last, opponent: 'online' } : last
  })
  const [onlineKind, setOnlineKind] = useState<OnlineKind>(asked === 'invite' || !accountsAvailable() ? 'invite' : 'find')
  const matchmaking = useMatchmaking()
  const searching = matchmaking.status.state === 'connecting' || matchmaking.status.state === 'seeking'
  const now = useNow(searching, 1000)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [creating, setCreating] = useState(false)
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
      icon: <Globe size={18} aria-hidden />,
      description: 'A rated game against someone near your strength, or a friend you send a link to.',
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

  // Paired: the game is waiting on the server, in the seat the lobby chose.
  const paired = matchmaking.status.state === 'paired' ? matchmaking.status : null
  useEffect(() => {
    if (paired) navigate(`/online/${paired.matchId}?seat=${paired.seat}`)
  }, [paired, navigate])

  const findGame = () => {
    if (!account.user) {
      navigate(`/signin?next=${encodeURIComponent('/play?online=find')}`)
      return
    }
    saveLastSetup(setup)
    matchmaking.seek(setup.settings)
  }

  // The server holds an online game, so starting one leaves any saved game on this device alone.
  const startOnline = async () => {
    saveLastSetup(setup)
    setCreating(true)
    try {
      const id = await createOnlineMatch(setup.settings)
      navigate(`/online/${id}?seat=${setup.side}`)
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not start the game.', 'error')
      setCreating(false)
    }
  }

  const start = () => {
    if (setup.opponent === 'online') {
      if (onlineKind === 'find') findGame()
      else void startOnline()
      return
    }
    const active = loadActiveMatch()
    if (active && active.state.position.status.kind === 'playing' && active.record.actions.length > 0) setConfirmReplace(true)
    else begin()
  }

  const { settings } = setup
  const summary = [
    `${settings.boardSize}×${settings.boardSize}`,
    timeControlLabel(settings),
    setup.opponent === 'online' && onlineKind === 'find'
      ? 'Rated, against someone near your rating'
      : opponentLabel(setup.opponent),
    setup.opponent === 'hotseat' || (setup.opponent === 'online' && onlineKind === 'find')
      ? null
      : `you play ${sideNames[setup.side]}`,
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
              {mode === 'hotseat' ? 'Players' : 'Opponent'}
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
            {mode === 'online' && accountsAvailable() && (
              <ChoiceCards<OnlineKind>
                label="Who do you want to play?"
                hideLabel
                value={onlineKind}
                onChange={setOnlineKind}
                layout="list"
                choices={[
                  {
                    value: 'find',
                    title: 'Find a rated game',
                    icon: <Swords size={18} aria-hidden />,
                    description: 'Play someone close to your rating who wants the same rules. The result moves both ratings.',
                  },
                  {
                    value: 'invite',
                    title: 'Invite a friend',
                    icon: <Link2 size={18} aria-hidden />,
                    description: 'Get a link to send. Whoever opens it takes the other side. Not rated.',
                  },
                ]}
              />
            )}
            {mode === 'online' && onlineKind === 'find' && account.status === 'signed-out' && (
              <p className="notice">
                Rated games need an account, so your rating has somewhere to live.{' '}
                <Link to={`/signin?next=${encodeURIComponent('/play?online=find')}`}>Sign in</Link> or{' '}
                <Link to={`/signup?next=${encodeURIComponent('/play?online=find')}`}>create one</Link>.
              </p>
            )}
            {mode === 'online' && onlineKind === 'find' && (
              <p className="panel__text">Sides are drawn at random. The board, clock and house rules are the ones below.</p>
            )}
            {mode === 'online' && onlineKind === 'invite' && (
              <p className="panel__text">Once the game starts you get a link to send. Whoever opens it takes the other side.</p>
            )}
            {mode !== 'hotseat' && !(mode === 'online' && onlineKind === 'find') && (
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
          <Button
            variant="primary"
            size="lg"
            icon={mode === 'online' && onlineKind === 'find' ? <Swords size={18} /> : <Play size={18} />}
            onClick={start}
            disabled={creating || searching}
          >
            {creating ? 'Starting…' : mode === 'online' && onlineKind === 'find' ? 'Find a game' : 'Start game'}
          </Button>
        </div>
        {matchmaking.status.state === 'ended' && (
          <p className="notice" role="status">
            {matchmaking.status.reason}
          </p>
        )}
      </div>

      <Dialog
        open={searching}
        onClose={matchmaking.cancel}
        title="Finding an opponent"
        description={
          matchmaking.status.state === 'seeking'
            ? `${poolLabel(matchmaking.status.pool)} · your rating ${matchmaking.status.rating}`
            : 'Connecting to the game server…'
        }
        footer={
          <Button onClick={matchmaking.cancel} data-autofocus>
            Cancel
          </Button>
        }
      >
        <p className="seek" role="status">
          <Loader2 size={18} className="spin" aria-hidden />
          {matchmaking.status.state === 'seeking'
            ? `Searching for ${formatClock(Math.max(0, now - matchmaking.status.since))}. The longer it takes, the wider the range of ratings it accepts.`
            : 'Connecting…'}
        </p>
      </Dialog>

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
