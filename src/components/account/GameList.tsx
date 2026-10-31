import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { countOf, relativeTime, resultHow, signedChange } from '../../lib/describe'
import { poolLabel } from '../../net/account'
import type { GameSummary } from '../../net/account'
import Avatar from './Avatar'

/** A finished online game as one line, from the point of view of `viewerId` (whose profile it is on). */
function GameRow({ game, viewerId }: { game: GameSummary; viewerId: string }) {
  const mySeat = game.players.player1?.id === viewerId ? 'player1' : 'player2'
  const theirSeat = mySeat === 'player1' ? 'player2' : 'player1'
  const opponent = game.players[theirSeat]
  const outcome = game.winner === null ? 'draw' : game.winner === mySeat ? 'win' : 'loss'
  const change = game.ratings[mySeat]
  const delta = change ? change.after - change.before : null
  return (
    <li className="games__row">
      <span className={`games__result is-${outcome}`}>{outcome === 'win' ? 'Won' : outcome === 'loss' ? 'Lost' : 'Drew'}</span>
      <span className="games__who">
        {opponent ? (
          <>
            <Avatar name={opponent.displayName} colour={opponent.avatar} size="sm" />
            <span>
              vs <Link to={`/u/${opponent.username}`}>{opponent.displayName}</Link>
            </span>
          </>
        ) : (
          // A seat without an account was a guest, or a player who has since deleted theirs.
          <span className="games__guest">vs a player without an account</span>
        )}
      </span>
      <span className="games__meta">
        {poolLabel(game.pool)} · {game.rated ? 'Rated' : 'Casual'} · {resultHow(game.reason)} · {countOf(game.plies, 'move')} ·{' '}
        {relativeTime(game.finishedAt)}
      </span>
      {delta !== null && (
        <span className={`games__delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}`}>
          <span className="visually-hidden">Rating </span>
          {signedChange(delta)}
        </span>
      )}
      <Link className="games__open" to={`/game/${game.id}`} aria-label={`Review the game ${relativeTime(game.finishedAt)}`}>
        Review <ArrowRight size={14} aria-hidden />
      </Link>
    </li>
  )
}

export default function GameList({ games, viewerId }: { games: GameSummary[]; viewerId: string }) {
  return (
    <ul className="games" role="list">
      {games.map((game) => (
        <GameRow key={game.id} game={game} viewerId={viewerId} />
      ))}
    </ul>
  )
}
