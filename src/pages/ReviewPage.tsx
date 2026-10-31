import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MatchScreen from '../components/game/MatchScreen'
import AppShell from '../components/layout/AppShell'
import { ButtonLink } from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import { useToast } from '../components/ui/Toasts'
import { useSideNames, useTheme } from '../context/useTheme'
import type { PlayerId } from '../game/types'
import { useMatchController } from '../hooks/useMatchController'
import { usePageTitle } from '../lib/usePageTitle'
import { useAccount } from '../context/useAccount'
import { MatchHost } from '../match/session'
import { findArchived, parseRecord } from '../match/storage'
import type { MatchRecord } from '../match/types'
import { poolLabel } from '../net/account'
import type { GameSummary } from '../net/account'
import { ApiError, fetchGame } from '../net/accountApi'

function Review({ record, perspective }: { record: MatchRecord; perspective?: PlayerId | null }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { theme } = useTheme()
  const sideNames = useSideNames()
  // A finished game replayed into a host nobody can act on: read-only by construction.
  const [host] = useState(() => new MatchHost(record))
  const controller = useMatchController({
    session: host,
    localSeats: [],
    authoritative: false,
    sideNames,
    captureDurationMs: theme.motion.captureDurationMs,
    notify: toast.show,
  })
  const humans = (['player1', 'player2'] as PlayerId[]).filter((p) => record.config.seats[p].kind === 'human')
  return (
    <MatchScreen
      controller={controller}
      localSeats={[]}
      perspective={perspective !== undefined ? perspective : humans.length === 1 ? humans[0] : null}
      thinkingSeat={null}
      onNewGame={() => navigate('/play')}
    />
  )
}

/**
 * `/review/:id` — step through a finished game saved on this device. Keyed by
 * the id so going from one review to another reads the right game.
 */
export default function ReviewPage() {
  const { id = '' } = useParams()
  return <ArchivedGame key={id} id={id} />
}

function ArchivedGame({ id }: { id: string }) {
  usePageTitle('Review')
  const [archived] = useState(() => findArchived(id))

  if (!archived) {
    return (
      <AppShell>
        <div className="page page--narrow">
          <Panel>
            <h1 className="panel__title">Game not found</h1>
            <p className="panel__text">
              The last fifty finished games are kept in this browser, and every device you sign in on shares them.
            </p>
            <div className="panel__actions">
              <ButtonLink to="/" variant="primary">
                Home
              </ButtonLink>
            </div>
          </Panel>
        </div>
      </AppShell>
    )
  }
  return (
    <AppShell wide>
      <Review record={archived.record} />
    </AppShell>
  )
}

type Loaded =
  { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; record: MatchRecord; summary: GameSummary }

/** The record with each seat named after the account that played it, so the board and the move list say who. */
const withNames = (record: MatchRecord, summary: GameSummary): MatchRecord => ({
  ...record,
  config: {
    ...record.config,
    seats: {
      player1: { ...record.config.seats.player1, name: summary.players.player1?.displayName || record.config.seats.player1.name },
      player2: { ...record.config.seats.player2, name: summary.players.player2?.displayName || record.config.seats.player2.name },
    },
  },
})

function OnlineGame({ id }: { id: string }) {
  const { user } = useAccount()
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  usePageTitle(loaded.state === 'ready' ? `Review · ${poolLabel(loaded.summary.pool)}` : 'Review')

  useEffect(() => {
    let live = true
    fetchGame(id)
      .then(({ summary, record }) => {
        if (!live) return
        const parsed = parseRecord(record)
        if (!parsed) setLoaded({ state: 'failed', message: 'The record of this game could not be read.' })
        else setLoaded({ state: 'ready', record: withNames(parsed.record, summary), summary })
      })
      .catch((error: unknown) => {
        if (!live) return
        const missing = error instanceof ApiError && error.status === 404
        const message = missing
          ? 'There is no finished online game with this link.'
          : error instanceof Error
            ? error.message
            : 'Could not load the game.'
        setLoaded({ state: 'failed', message })
      })
    return () => {
      live = false
    }
  }, [id])

  if (loaded.state === 'ready') {
    const seat = (['player1', 'player2'] as PlayerId[]).find((p) => loaded.summary.players[p]?.id === user?.id) ?? null
    return (
      <AppShell wide>
        <Review record={loaded.record} perspective={seat} />
      </AppShell>
    )
  }
  return (
    <AppShell>
      <div className="page page--narrow">
        {loaded.state === 'loading' ? (
          <p className="page-loading" role="status">
            Loading…
          </p>
        ) : (
          <Panel>
            <h1 className="panel__title">Game not found</h1>
            <p className="panel__text">{loaded.message}</p>
            <div className="panel__actions">
              <ButtonLink to="/" variant="primary">
                Home
              </ButtonLink>
            </div>
          </Panel>
        )}
      </div>
    </AppShell>
  )
}

/** `/game/:id` — a finished online game, from the server, which anyone with the link can step through. */
export function OnlineGamePage() {
  const { id = '' } = useParams()
  return <OnlineGame key={id} id={id} />
}
