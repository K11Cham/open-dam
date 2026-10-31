import { Swords } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Avatar from '../components/account/Avatar'
import AppShell from '../components/layout/AppShell'
import { Button, ButtonLink } from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import { useAccount } from '../context/useAccount'
import { TIME_CONTROLS } from '../game/settings'
import { usePageTitle } from '../lib/usePageTitle'
import { PROVISIONAL_GAMES } from '../match/rating'
import { isPool, poolLabel } from '../net/account'
import type { LeaderboardEntry } from '../net/account'
import { accountsAvailable, fetchLeaderboard, fetchPools } from '../net/accountApi'

const SIZES = [5, 6, 7, 8, 9]
const CLOCKS = [...TIME_CONTROLS.map((tc) => tc.label), 'untimed']
const DEFAULT_POOL = '5x5:untimed'

const splitPool = (pool: string): [number, string] => {
  const [size, clock] = pool.split(':')
  return [Number(size.split('x')[0]), clock]
}

type Board =
  { state: 'loading' } | { state: 'failed'; message: string } | { state: 'ready'; entries: LeaderboardEntry[]; total: number }

/** One pool's standings. Keyed by the pool, so switching pools starts from "Loading" rather than showing the old list. */
function Standings({ pool }: { pool: string }) {
  const { user } = useAccount()
  const [board, setBoard] = useState<Board>({ state: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let live = true
    fetchLeaderboard(pool)
      .then((result) => live && setBoard({ state: 'ready', entries: result.entries, total: result.total }))
      .catch(
        (error) => live && setBoard({ state: 'failed', message: error instanceof Error ? error.message : 'Could not load.' }),
      )
    return () => {
      live = false
    }
  }, [pool])

  const loadMore = async () => {
    if (board.state !== 'ready') return
    setLoadingMore(true)
    try {
      const result = await fetchLeaderboard(pool, board.entries.length)
      setBoard({ state: 'ready', entries: [...board.entries, ...result.entries], total: result.total })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <>
      {board.state === 'loading' && (
        <p className="page-loading" role="status">
          Loading…
        </p>
      )}
      {board.state === 'failed' && (
        <Panel>
          <p className="panel__text">{board.message}</p>
        </Panel>
      )}
      {board.state === 'ready' && board.entries.length === 0 && (
        <Panel as="section" aria-labelledby="empty-h" className="leaderboard__empty">
          <h2 id="empty-h" className="panel__title">
            Nobody is rated in {poolLabel(pool)} yet
          </h2>
          <p className="panel__text">The first rated game here puts both players on the board.</p>
          <div className="panel__actions">
            <ButtonLink to="/play?online=find" variant="primary" icon={<Swords size={16} />}>
              Find a rated game
            </ButtonLink>
          </div>
        </Panel>
      )}
      {board.state === 'ready' && board.entries.length > 0 && (
        <>
          <Panel className="table-wrap">
            <table className="table leaderboard">
              <caption className="visually-hidden">Standings, {poolLabel(pool)}</caption>
              <thead>
                <tr>
                  <th scope="col" className="is-numeric">
                    #
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col" className="is-numeric">
                    Rating
                  </th>
                  <th scope="col" className="is-numeric">
                    Games
                  </th>
                  <th scope="col" className="is-numeric is-optional">
                    W / D / L
                  </th>
                  <th scope="col" className="is-numeric">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {board.entries.map((entry) => (
                  <tr key={entry.player.id} className={entry.player.id === user?.id ? 'is-me' : undefined}>
                    <td className="is-numeric">{entry.rank}</td>
                    <th scope="row">
                      <Link className="leaderboard__player" to={`/u/${entry.player.username}`}>
                        <Avatar name={entry.player.displayName} colour={entry.player.avatar} size="sm" />
                        <span>{entry.player.displayName}</span>
                        {entry.player.id === user?.id && <span className="tag tag--turn">You</span>}
                      </Link>
                    </th>
                    <td className="is-numeric">
                      {entry.rating}
                      {entry.games < PROVISIONAL_GAMES && <abbr title="Provisional: fewer than 20 rated games">?</abbr>}
                    </td>
                    <td className="is-numeric">{entry.games}</td>
                    <td className="is-numeric is-optional">
                      {entry.wins} / {entry.draws} / {entry.losses}
                    </td>
                    <td className="is-numeric">{Math.round(((entry.wins + entry.draws / 2) / entry.games) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <p className="field__help">
            {board.total} rated {board.total === 1 ? 'player' : 'players'} in {poolLabel(pool)}. A ? marks a provisional rating,
            from fewer than {PROVISIONAL_GAMES} games.
          </p>
          {board.entries.length < board.total && (
            <div>
              <Button onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show more'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}

/**
 * `/leaderboards?pool=5x5:10+1`: the rated players of one pool (a board size
 * and a clock), best first. Ratings come only from rated online games, which
 * the server scores itself.
 */
export default function LeaderboardsPage() {
  usePageTitle('Leaderboards')
  const [params, setParams] = useSearchParams()
  const requested = params.get('pool')
  const pool = isPool(requested) ? requested : DEFAULT_POOL
  const [size, clock] = splitPool(pool)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const available = accountsAvailable()

  useEffect(() => {
    if (!available) return
    fetchPools()
      .then((pools) => setCounts(Object.fromEntries(pools.map((p) => [p.pool, p.players]))))
      .catch(() => setCounts({}))
  }, [available])

  const choose = (nextSize: number, nextClock: string) =>
    setParams({ pool: `${nextSize}x${nextSize}:${nextClock}` }, { replace: true })

  const playersIn = (s: number, c: string) => counts[`${s}x${s}:${c}`] ?? 0

  return (
    <AppShell>
      <div className="page">
        <header className="page-head">
          <p className="eyebrow">Community</p>
          <h1 className="page-title">Leaderboards</h1>
          <p className="page-lede">
            Every board size and clock has its own rating, earned in rated online games. Find one on the{' '}
            <Link to="/play?online=find">Play</Link> page.
          </p>
        </header>

        {!available ? (
          <Panel>
            <p className="panel__text">
              This copy of Open Dam has no game server, so it has no ratings. Open the game from its website.
            </p>
          </Panel>
        ) : (
          <>
            <div className="leaderboard__pickers">
              <Segmented<number>
                label="Board"
                value={size}
                options={SIZES.map((s) => ({
                  value: s,
                  label: `${s}×${s}`,
                  hint: `${CLOCKS.reduce((n, c) => n + playersIn(s, c), 0)} rated players`,
                }))}
                onChange={(s) => choose(s, clock)}
              />
              <Segmented<string>
                label="Clock"
                wrap
                value={clock}
                options={CLOCKS.map((c) => ({
                  value: c,
                  label: c === 'untimed' ? 'No clock' : c,
                  hint: `${playersIn(size, c)} rated players`,
                }))}
                onChange={(c) => choose(size, c)}
              />
            </div>

            <Standings key={pool} pool={pool} />
          </>
        )}
      </div>
    </AppShell>
  )
}
