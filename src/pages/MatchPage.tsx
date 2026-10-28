import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import MatchScreen from '../components/game/MatchScreen'
import AppShell from '../components/layout/AppShell'
import { ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import Panel from '../components/ui/Panel'
import { useToast } from '../components/ui/Toasts'
import { useSideNames, useTheme } from '../context/useTheme'
import type { PlayerId } from '../game/types'
import { useAIPlayer } from '../hooks/useAIPlayer'
import { useMatchController } from '../hooks/useMatchController'
import { useMatchPersistence } from '../hooks/useMatchPersistence'
import { usePageTitle } from '../lib/usePageTitle'
import { MatchHost, createRecord } from '../match/session'
import { recordFromSetup, setupFromParams } from '../match/setup'
import { clearActiveMatch, findArchived, loadActiveMatch, resumeAfterGap, saveActiveMatch } from '../match/storage'
import type { MatchRecord } from '../match/types'

const SIDES: PlayerId[] = ['player1', 'player2']

/** A local game (pass and play, or against the computer) hosted on this device. */
function LocalMatch({ record }: { record: MatchRecord }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { theme } = useTheme()
  const sideNames = useSideNames()
  const [host] = useState(() => new MatchHost(record))
  useMatchPersistence(host)

  const seats = record.config.seats
  const localSeats = SIDES.filter((side) => seats[side].kind === 'human')
  const aiSeat = SIDES.find((side) => seats[side].kind === 'ai') ?? null
  const perspective = localSeats.length === 1 ? localSeats[0] : null

  const controller = useMatchController({
    session: host,
    localSeats,
    authoritative: true,
    sideNames,
    captureDurationMs: theme.motion.captureDurationMs,
    notify: toast.show,
  })
  const thinking = useAIPlayer(host, aiSeat, aiSeat ? seats[aiSeat].difficulty : undefined)
  usePageTitle(controller.over ? 'Game over' : perspective && controller.myTurn ? 'Your move' : 'Game')

  const rematch = () => {
    const next = createRecord({ mode: 'local', settings: record.config.settings, seats })
    saveActiveMatch(next)
    navigate(`/match/${next.config.id}`)
  }

  return (
    <MatchScreen
      controller={controller}
      localSeats={localSeats}
      perspective={perspective}
      thinkingSeat={thinking ? aiSeat : null}
      onRematch={rematch}
      onNewGame={() => navigate('/play')}
    />
  )
}

/**
 * `/match/:id` — open the saved game with this id. Keyed by the id: moving
 * from one match to another (a rematch) keeps this route mounted, and the
 * saved game is read once per mount, so without the key a rematch kept
 * showing the finished game.
 */
export default function MatchPage() {
  const { id = '' } = useParams()
  return <SavedMatch key={id} id={id} />
}

function SavedMatch({ id }: { id: string }) {
  const [loaded] = useState(() => {
    const active = loadActiveMatch()
    if (!active || active.record.config.id !== id || active.record.config.mode !== 'local') return null
    return resumeAfterGap(active.record, active.state, active.savedAt)
  })

  if (!loaded) {
    if (findArchived(id)) return <Navigate to={`/review/${id}`} replace />
    return (
      <AppShell>
        <div className="page page--narrow">
          <Panel>
            <h1 className="panel__title">This game is not on this device</h1>
            <p className="panel__text">
              Games are saved in this browser only. It may have finished, been replaced by a newer game, or been started somewhere
              else.
            </p>
            <div className="panel__actions">
              <ButtonLink to="/play" variant="primary">
                Start a new game
              </ButtonLink>
              <ButtonLink to="/">Home</ButtonLink>
            </div>
          </Panel>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell wide>
      <LocalMatch key={loaded.config.id} record={loaded} />
    </AppShell>
  )
}

/**
 * `/match/new?vs=club&size=7&...` — start a game straight from a link (the
 * home page's quick-play cards, bookmarks, older `/match?ai=...` URLs). Asks
 * before replacing an unfinished game.
 */
export function NewMatchFromLink() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [pending] = useState(() => {
    const active = loadActiveMatch()
    return active && active.state.position.status.kind === 'playing' && active.record.actions.length > 0 ? active : null
  })

  const start = () => {
    const setup = setupFromParams(params)
    const record = recordFromSetup(setup)
    clearActiveMatch()
    saveActiveMatch(record)
    navigate(record.config.mode === 'online' ? `/online/${record.config.id}` : `/match/${record.config.id}`, { replace: true })
  }

  useEffect(() => {
    if (!pending) start()
    // Runs once on arrival; `start` reads the URL as it was when the link was followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppShell>
      <ConfirmDialog
        open={!!pending}
        title="Start a new game?"
        description="You have an unfinished game saved on this device. Starting a new one will discard it."
        confirmLabel="Discard and start"
        cancelLabel="Back to my game"
        tone="danger"
        onConfirm={start}
        onCancel={() => navigate(pending ? `/match/${pending.record.config.id}` : '/', { replace: true })}
      />
    </AppShell>
  )
}
