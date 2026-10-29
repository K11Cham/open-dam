import type { PlayerId } from '../game/types'
import type { MatchHost } from '../match/session'
import { HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, PROTOCOL_VERSION } from './protocol'
import type { GuestMessage, HostMessage } from './protocol'
import type { Transport } from './transport'

export interface HostLinkOptions {
  /** The seat the host's own player sits in, or null when the host is a server that plays neither side. */
  hostSeat: PlayerId | null
  /** The host tab's client id. */
  clientId: string
  now?: () => number
}

interface Claim {
  clientId: string
  lastSeen: number
}

type HostBody = HostMessage extends infer M ? (M extends HostMessage ? Omit<M, 'v' | 'matchId' | 'from'> : never) : never

/**
 * Connects an authoritative `MatchHost` to a transport. This is the part a
 * server would replace: it binds clients to seats, forwards their intents to
 * the host (so the reducer judges them), and broadcasts every accepted action.
 *
 * Returns a function that detaches the link and tells guests the host left.
 */
export function linkHost(host: MatchHost, transport: Transport, options: HostLinkOptions): () => void {
  const now = options.now ?? Date.now
  const matchId = host.getSnapshot().record.config.id
  const claims = new Map<PlayerId, Claim>()

  const send = (body: HostBody) => {
    transport.send({ v: PROTOCOL_VERSION, matchId, from: options.clientId, ...body } as HostMessage)
  }

  const remoteSeats = (): PlayerId[] =>
    (['player1', 'player2'] as PlayerId[]).filter((seat) => host.getSnapshot().record.config.seats[seat].kind === 'remote')

  const onlineMap = (): Record<PlayerId, boolean> => {
    const t = now()
    const online: Record<PlayerId, boolean> = { player1: false, player2: false }
    if (options.hostSeat) online[options.hostSeat] = true
    for (const [seat, claim] of claims) online[seat] = t - claim.lastSeen < PRESENCE_TIMEOUT_MS
    return online
  }

  const refreshPresence = () => {
    const online = onlineMap()
    const everyoneHere = remoteSeats().every((seat) => online[seat])
    host.setPresence(online, everyoneHere ? 'connected' : 'waiting-for-opponent')
    send({ type: 'presence', online })
  }

  const handle = (message: GuestMessage) => {
    const { seat } = message
    if (!remoteSeats().includes(seat)) {
      if (message.type === 'join') send({ type: 'seat-taken', to: message.from, seat })
      return
    }
    const claim = claims.get(seat)
    const t = now()
    const ownedBySender = claim?.clientId === message.from
    const claimIsStale = !claim || t - claim.lastSeen >= PRESENCE_TIMEOUT_MS

    const seatSender = () => {
      claims.set(seat, { clientId: message.from, lastSeen: t })
      send({ type: 'welcome', to: message.from, seat, record: host.getSnapshot().record })
      refreshPresence()
    }

    switch (message.type) {
      case 'join':
        if (!ownedBySender && !claimIsStale) {
          send({ type: 'seat-taken', to: message.from, seat })
          return
        }
        seatSender()
        return
      case 'ping':
        if (ownedBySender) claim.lastSeen = t
        // A guest that still thinks it is seated, but whose claim this host
        // lost (a restarted server, or a long silence), gets the seat back if
        // nobody else took it. Otherwise it would wait for a host that keeps
        // ignoring it.
        else if (claimIsStale) seatSender()
        return
      case 'leave':
        if (ownedBySender) {
          claims.delete(seat)
          refreshPresence()
        }
        return
      case 'intent': {
        if (!ownedBySender) {
          send({ type: 'rejected', to: message.from, nonce: message.nonce, reason: 'You are not seated in this game.' })
          return
        }
        claim.lastSeen = t
        const error = host.submit(seat, message.intent)
        if (error) send({ type: 'rejected', to: message.from, nonce: message.nonce, reason: error })
        return
      }
    }
  }

  const stopListening = transport.onMessage((message) => {
    if (message.matchId !== matchId || message.from === options.clientId) return
    if (message.type === 'join' || message.type === 'intent' || message.type === 'ping' || message.type === 'leave') {
      handle(message)
    }
  })

  // Every accepted action — local or remote — goes out to everyone.
  const stopForwarding = host.subscribe((update) => {
    if (update.step) send({ type: 'action', action: update.step.action })
  })

  const heartbeat = setInterval(refreshPresence, HEARTBEAT_MS)
  refreshPresence()
  // A guest that was already waiting gets the game straight away.
  send({ type: 'snapshot', record: host.getSnapshot().record })

  return () => {
    clearInterval(heartbeat)
    stopListening()
    stopForwarding()
    send({ type: 'closed' })
  }
}
