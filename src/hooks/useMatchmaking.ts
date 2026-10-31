import { useEffect, useRef, useState } from 'react'
import type { PlayerId, RuleSettings } from '../game/types'
import { lobbySocketUrl } from '../net/accountApi'
import { PROTOCOL_VERSION, isLobbyMessage } from '../net/protocol'
import type { LobbyReply } from '../net/protocol'
import { getClientId } from '../net/transport'

export type SeekStatus =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'seeking'; pool: string; rating: number; since: number }
  | { state: 'paired'; matchId: string; seat: PlayerId; opponentRating: number }
  | { state: 'ended'; reason: string }

/**
 * Looking for a rated game: a socket to the lobby (worker/lobbyRoom.ts) for
 * as long as the search lasts. The server knows who is asking from the
 * session cookie, and pairs them with someone close in rating who wants the
 * same rules. The socket closes when the search ends, either way.
 */
export function useMatchmaking() {
  const [status, setStatus] = useState<SeekStatus>({ state: 'idle' })
  const socketRef = useRef<WebSocket | null>(null)

  const close = () => {
    const socket = socketRef.current
    socketRef.current = null
    if (socket) {
      socket.onclose = null
      socket.close()
    }
  }

  // Leaving the page ends the search.
  useEffect(() => close, [])

  const seek = (settings: RuleSettings) => {
    close()
    setStatus({ state: 'connecting' })
    let socket: WebSocket
    try {
      socket = new WebSocket(lobbySocketUrl())
    } catch {
      setStatus({ state: 'ended', reason: 'Could not reach the game server.' })
      return
    }
    socketRef.current = socket
    const from = getClientId()
    socket.onopen = () => socket.send(JSON.stringify({ v: PROTOCOL_VERSION, channel: 'lobby', from, type: 'seek', settings }))
    socket.onmessage = (event) => {
      let message: unknown
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (!isLobbyMessage(message)) return
      const reply = message as LobbyReply
      if (reply.type === 'seeking') setStatus({ state: 'seeking', pool: reply.pool, rating: reply.rating, since: Date.now() })
      else if (reply.type === 'paired') {
        setStatus({ state: 'paired', matchId: reply.matchId, seat: reply.seat, opponentRating: reply.opponentRating })
        close()
      } else if (reply.type === 'seek-ended') {
        setStatus({ state: 'ended', reason: reply.reason })
        close()
      }
    }
    socket.onclose = () => {
      socketRef.current = null
      setStatus((current) =>
        current.state === 'paired' ? current : { state: 'ended', reason: 'The connection to the game server closed. Try again.' },
      )
    }
  }

  const cancel = () => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, channel: 'lobby', from: getClientId(), type: 'cancel' }))
    }
    close()
    setStatus({ state: 'idle' })
  }

  return { status, seek, cancel }
}
