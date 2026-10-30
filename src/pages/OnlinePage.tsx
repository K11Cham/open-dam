import { Check, Copy, Share2, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import MatchScreen from '../components/game/MatchScreen'
import AppShell from '../components/layout/AppShell'
import { Button, ButtonLink } from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import { useToast } from '../components/ui/Toasts'
import { useSound } from '../context/useSound'
import { useSideNames, useTheme } from '../context/useTheme'
import { opponentOf } from '../game/board'
import type { PlayerId } from '../game/types'
import { useMatchController } from '../hooks/useMatchController'
import { useMatchSession } from '../hooks/useMatchSession'
import { usePageTitle } from '../lib/usePageTitle'
import type { MatchSession } from '../match/session'
import { matchSocketUrl, onlineAvailable } from '../net/api'
import { MatchGuest } from '../net/guest'
import { getClientId } from '../net/transport'
import { WebSocketTransport } from '../net/websocket'

/** The link that opens this game in the other seat. A hash-routed copy keeps the route after the #. */
const inviteLinkFor = (matchId: string, seat: PlayerId) => {
  const route = `/online/${matchId}?seat=${opponentOf(seat)}`
  const { origin, pathname } = window.location
  return import.meta.env.VITE_ROUTER === 'hash' ? `${origin}${pathname}#${route}` : `${origin}${route}`
}

/**
 * The link to send, above the board while the opponent is not here. It sits
 * on top rather than beside the board because on a phone "beside" is below
 * the whole board, and sending the link is the first thing to do.
 */
function InviteBar({ seat, matchId }: { seat: PlayerId; matchId: string }) {
  const sideNames = useSideNames()
  const [copied, setCopied] = useState(false)
  const inviteUrl = inviteLinkFor(matchId, seat)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const share = async () => {
    try {
      await navigator.share({ title: 'Play Dam with me', url: inviteUrl })
    } catch {
      // Closing the share sheet is not an error worth showing.
    }
  }

  return (
    <section className="invite-bar" aria-labelledby="invite-h">
      <div className="invite-bar__text">
        <h2 id="invite-h" className="invite-bar__title">
          Invite your opponent
        </h2>
        <p className="field__help">Whoever opens this link plays {sideNames[opponentOf(seat)]}, on any device.</p>
      </div>
      <div className="copy-field">
        <input
          className="input"
          readOnly
          aria-label="Invite link"
          value={inviteUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button size="sm" variant="primary" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {canShare && (
          <Button size="sm" icon={<Share2 size={15} />} onClick={share}>
            Share
          </Button>
        )}
      </div>
    </section>
  )
}

/** Connection status, shown beside the board. */
function OnlinePanel({ session, seat }: { session: MatchSession; seat: PlayerId }) {
  const snapshot = useMatchSession(session)
  const sideNames = useSideNames()
  const opponentHere = snapshot.online[opponentOf(seat)]

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
      <p
        className={`online-panel__status ${opponentHere && snapshot.connection !== 'disconnected' ? 'is-ok' : ''}`}
        role="status"
      >
        {snapshot.connection === 'disconnected' ? <WifiOff size={16} aria-hidden /> : <Wifi size={16} aria-hidden />}
        {status}
      </p>
      <p className="online-panel__text">You are playing {sideNames[seat]}.</p>
    </section>
  )
}

function OnlineMatch({ session, seat, matchId }: { session: MatchSession; seat: PlayerId; matchId: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { theme } = useTheme()
  const sideNames = useSideNames()
  const sound = useSound()
  const controller = useMatchController({
    session,
    localSeats: [seat],
    authoritative: false,
    sideNames,
    captureDurationMs: theme.motion.captureDurationMs,
    notify: toast.show,
    onCue: sound.play,
  })
  usePageTitle(controller.over ? 'Game over' : controller.myTurn ? 'Your move' : 'Online game')
  const { connection, online } = controller.snapshot
  // The link comes back if the opponent leaves, so it can be sent again.
  const inviting = !controller.over && connection !== 'connecting' && !online[opponentOf(seat)]

  return (
    <>
      {inviting && <InviteBar seat={seat} matchId={matchId} />}
      <MatchScreen
        controller={controller}
        localSeats={[seat]}
        perspective={seat}
        thinkingSeat={null}
        onNewGame={() => navigate('/play')}
        aside={<OnlinePanel session={session} seat={seat} />}
      />
    </>
  )
}

/** Shown instead of a board when there is no game to join. */
function NoGame({ title, text }: { title: string; text: string }) {
  usePageTitle(title)
  return (
    <div className="page">
      <Panel as="section" aria-labelledby="no-game-h">
        <h1 id="no-game-h" className="panel__title">
          {title}
        </h1>
        <p className="panel__text">{text}</p>
        <div className="panel__actions">
          <ButtonLink to="/match/new?vs=online" variant="primary">
            Start an online game
          </ButtonLink>
          <ButtonLink to="/">Home</ButtonLink>
        </div>
      </Panel>
    </div>
  )
}

/**
 * Both players are guests of the match server (worker/), which holds the game
 * and judges every move. The seat comes from the link: the creator opens their
 * own side, and the invite link names the other.
 */
function JoinedOnline({ matchId, seat }: { matchId: string; seat: PlayerId }) {
  const [guest] = useState(() => new MatchGuest({ matchId, seat, clientId: getClientId() }))
  const snapshot = useMatchSession(guest)
  useEffect(() => {
    const transport = new WebSocketTransport(matchSocketUrl(matchId))
    guest.connect(transport)
    return () => {
      guest.disconnect()
      transport.close()
    }
  }, [guest, matchId])

  if (snapshot.connection === 'missing') {
    return (
      <NoGame title="Game not found" text="This game does not exist, or nobody has opened it for a month and it was cleared." />
    )
  }
  return <OnlineMatch session={guest} seat={seat} matchId={matchId} />
}

/**
 * `/online/:id?seat=player1|player2`. Keyed by the URL, so opening another
 * game or the other seat starts a fresh connection.
 */
export default function OnlinePage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const seat: PlayerId = params.get('seat') === 'player1' ? 'player1' : 'player2'
  return (
    <AppShell wide>
      {onlineAvailable() ? (
        <JoinedOnline key={`${id}-${seat}`} matchId={id} seat={seat} />
      ) : (
        <NoGame
          title="Online play is not available here"
          text="This copy of Open Dam has no game server. Open the game from its website to play online."
        />
      )}
    </AppShell>
  )
}
