import { useState } from 'react'
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
import { MatchHost } from '../match/session'
import { findArchived } from '../match/storage'
import type { MatchRecord } from '../match/types'

function Review({ record }: { record: MatchRecord }) {
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
      perspective={humans.length === 1 ? humans[0] : null}
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
            <p className="panel__text">Only the last twenty finished games are kept, in this browser.</p>
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
