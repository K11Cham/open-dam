import { Check, Copy, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import MatchScreen from '../components/game/MatchScreen'
import AppShell from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toasts'
import { useSideNames, useTheme } from '../context/useTheme'
import { opponentOf } from '../game/board'
import type { PlayerId } from '../game/types'
import { useMatchController } from '../hooks/useMatchController'
import { useMatchPersistence } from '../hooks/useMatchPersistence'
import { useMatchSession } from '../hooks/useMatchSession'
import { usePageTitle } from '../lib/usePageTitle'
import { MatchHost } from '../match/session'
import type { MatchSession } from '../match/session'
import { loadActiveMatch } from '../match/storage'
import type { MatchRecord } from '../match/types'
import { MatchGuest } from '../net/guest'
import { linkHost } from '../net/hostLink'
import { BroadcastChannelTransport, getClientId } from '../net/transport'

/** Invite and connection status, shown beside the board. */
function OnlinePanel({ session, seat, inviteUrl }: { session: MatchSession; seat: PlayerId; inviteUrl: string | null }) {
  const snapshot = useMatchSession(session)
  const sideNames = useSideNames()
  const [copied, setCopied] = useState(false)
  const opponentHere = snapshot.online[opponentOf(seat)]

  const copy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const status =
    snapshot.connection === 'connecting'
      ? 'Connecting to the game…'
      : snapshot.connection === 'disconnected'
        ? 'Connection lost. Trying to reconnect…'
        : opponentHere
          ? 'Opponent connected'
          : 'Waiting for your opponent'

  return (
    <section className="online-panel" aria-label="Online game">
      <p className={`online-panel__status ${opponentHere && snapshot.connection !== 'disconnected' ? 'is-ok' : ''}`} role="status">
        {snapshot.connection === 'disconnected' ? <WifiOff size={16} aria-hidden /> : <Wifi size={16} aria-hidden />}
        {status}
      </p>
      <p className="online-panel__text">You are playing {sideNames[seat]}.</p>
      {inviteUrl && (
        <>
          <label className="field__label" htmlFor="invite-link">
            Invite link
          </label>
          <div className="copy-field">
            <input id="invite-link" className="input" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
            <Button size="sm" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="field__help">
            Open this link in another tab of this browser. Playing across devices needs the game server, which is planned next.
          </p>
        </>
      )}
    </section>
  )
}

function OnlineMatch({ session, seat, inviteUrl, authoritative }: { session: MatchSession; seat: PlayerId; inviteUrl: string | null; authoritative: boolean }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { theme } = useTheme()
  const sideNames = useSideNames()
  const controller = useMatchController({
    session,
    localSeats: [seat],
    authoritative,
    sideNames,
    captureDurationMs: theme.motion.captureDurationMs,
    notify: toast.show,
  })
  usePageTitle(controller.over ? 'Game over' : controller.myTurn ? 'Your move' : 'Online game')

  return (
    <MatchScreen
      controller={controller}
      localSeats={[seat]}
      perspective={seat}
      thinkingSeat={null}
      onNewGame={() => navigate('/play')}
      aside={<OnlinePanel session={session} seat={seat} inviteUrl={inviteUrl} />}
    />
  )
}

/** This tab created the game: it hosts it and is the authority. */
function HostedOnline({ record }: { record: MatchRecord }) {
  const [host] = useState(() => new MatchHost(record, { connection: 'waiting-for-opponent' }))
  useMatchPersistence(host)
  const seats = record.config.seats
  const seat: PlayerId = seats.player1.kind === 'remote' ? 'player2' : 'player1'
  const remoteSeat = opponentOf(seat)

  useEffect(() => {
    const transport = new BroadcastChannelTransport()
    const unlink = linkHost(host, transport, { hostSeat: seat, clientId: getClientId() })
    return () => {
      unlink()
      transport.close()
    }
  }, [host, seat])

  const inviteUrl = `${window.location.origin}/online/${record.config.id}?seat=${remoteSeat}`
  return <OnlineMatch session={host} seat={seat} inviteUrl={inviteUrl} authoritative />
}

/** This tab joined someone else's game. */
function JoinedOnline({ matchId, seat }: { matchId: string; seat: PlayerId }) {
  const [guest] = useState(() => new MatchGuest({ matchId, seat, clientId: getClientId() }))
  useEffect(() => {
    const transport = new BroadcastChannelTransport()
    guest.connect(transport)
    return () => {
      guest.disconnect()
      transport.close()
    }
  }, [guest])
  return <OnlineMatch session={guest} seat={seat} inviteUrl={null} authoritative={false} />
}

/** `/online/:id` — host the game if this browser created it, otherwise join it. */
export default function OnlinePage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const [hosted] = useState(() => {
    const active = loadActiveMatch()
    return active && active.record.config.id === id && active.record.config.mode === 'online' && !params.has('seat') ? active.record : null
  })
  const seat: PlayerId = params.get('seat') === 'player1' ? 'player1' : 'player2'

  return (
    <AppShell wide>
      {hosted ? <HostedOnline key={id} record={hosted} /> : <JoinedOnline key={`${id}-${seat}`} matchId={id} seat={seat} />}
    </AppShell>
  )
}
