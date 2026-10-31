import { Lock, Settings, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Avatar from '../components/account/Avatar'
import GameList from '../components/account/GameList'
import AppShell from '../components/layout/AppShell'
import { Button, ButtonLink } from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import { useAccount } from '../context/useAccount'
import { usePageTitle } from '../lib/usePageTitle'
import { PROVISIONAL_GAMES } from '../match/rating'
import { poolLabel } from '../net/account'
import type { GameSummary } from '../net/account'
import { ApiError, fetchGamesOf, fetchProfile } from '../net/accountApi'
import type { Profile } from '../net/accountApi'

type Loaded =
  { state: 'loading' } | { state: 'missing' } | { state: 'failed'; message: string } | { state: 'ready'; profile: Profile }

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="profile__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function ProfileView({ profile }: { profile: Profile }) {
  const { user: me } = useAccount()
  const { user, ratings, totals } = profile
  const mine = me?.id === user.id
  const [games, setGames] = useState<GameSummary[] | null>(profile.recent)
  const [more, setMore] = useState((profile.recent?.length ?? 0) >= 10)
  const [loadingMore, setLoadingMore] = useState(false)
  const best = ratings.reduce<(typeof ratings)[number] | null>((top, r) => (!top || r.rating > top.rating ? r : top), null)
  const winRate = totals.games > 0 ? `${Math.round(((totals.wins + totals.draws / 2) / totals.games) * 100)}%` : '–'

  const loadMore = async () => {
    if (!games?.length) return
    setLoadingMore(true)
    try {
      const next = await fetchGamesOf(user.username, games[games.length - 1].finishedAt)
      setGames([...games, ...next])
      setMore(next.length >= 20)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="page profile">
      <Panel as="section" aria-labelledby="profile-h" className="profile__head">
        <Avatar name={user.displayName} colour={user.avatar} size="lg" />
        <div className="profile__id">
          <h1 id="profile-h" className="page-title profile__name">
            {user.displayName}
          </h1>
          <p className="profile__handle">
            @{user.username} · joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
          {user.bio && <p className="profile__bio">{user.bio}</p>}
        </div>
        {mine && (
          <ButtonLink to="/settings#profile" size="sm" icon={<Settings size={15} />} className="profile__edit">
            Edit profile
          </ButtonLink>
        )}
        <dl className="profile__stats">
          <Stat label="Online games" value={totals.games} />
          <Stat label="Won" value={totals.wins} />
          <Stat label="Drawn" value={totals.draws} />
          <Stat label="Lost" value={totals.losses} />
          <Stat label="Score" value={winRate} />
          <Stat label="Best rating" value={best ? best.rating : '–'} />
        </dl>
      </Panel>

      <section className="section" aria-labelledby="ratings-h">
        <div className="section__head">
          <h2 id="ratings-h" className="section__title">
            Ratings
          </h2>
          <p className="section__lede">
            One rating for each board size and clock. Each starts at 1500; until {PROVISIONAL_GAMES} games it is provisional (?)
            and moves faster.
          </p>
        </div>
        {ratings.length === 0 ? (
          <Panel>
            <p className="panel__text">
              {mine ? 'You have' : `${user.displayName} has`} no rated games yet.{' '}
              {mine && (
                <>
                  <Link to="/play?online=find">Find a rated game</Link> to get a rating.
                </>
              )}
            </p>
          </Panel>
        ) : (
          <Panel className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Ratings of {user.displayName}</caption>
              <thead>
                <tr>
                  <th scope="col">Pool</th>
                  <th scope="col" className="is-numeric">
                    Rating
                  </th>
                  <th scope="col" className="is-numeric">
                    Games
                  </th>
                  <th scope="col" className="is-numeric is-optional">
                    W / D / L
                  </th>
                  <th scope="col" className="is-numeric is-optional">
                    Peak
                  </th>
                </tr>
              </thead>
              <tbody>
                {ratings.map((r) => (
                  <tr key={r.pool}>
                    <th scope="row">
                      <Link to={`/leaderboards?pool=${encodeURIComponent(r.pool)}`}>{poolLabel(r.pool)}</Link>
                    </th>
                    <td className="is-numeric">
                      {r.rating}
                      {r.games < PROVISIONAL_GAMES && <abbr title="Provisional: fewer than 20 rated games">?</abbr>}
                    </td>
                    <td className="is-numeric">{r.games}</td>
                    <td className="is-numeric is-optional">
                      {r.wins} / {r.draws} / {r.losses}
                    </td>
                    <td className="is-numeric is-optional">{r.peak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </section>

      <section className="section" aria-labelledby="games-h">
        <div className="section__head">
          <h2 id="games-h" className="section__title">
            Online games
          </h2>
        </div>
        {games === null ? (
          <Panel>
            <p className="panel__text profile__private">
              <Lock size={16} aria-hidden /> {user.displayName} keeps their games private.
            </p>
          </Panel>
        ) : games.length === 0 ? (
          <Panel>
            <p className="panel__text">No finished online games yet.</p>
          </Panel>
        ) : (
          <>
            <Panel dense>
              <GameList games={games} viewerId={user.id} />
            </Panel>
            {more && (
              <div>
                <Button onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Show older games'}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {mine && (
        <p className="field__help profile__note">
          <Trophy size={14} aria-hidden />
          <span>
            Only you see this: games against the computer and pass-and-play games are under <Link to="/">Recent games</Link> on
            the home page, the same on every device you sign in on.
          </span>
        </p>
      )}
    </div>
  )
}

/** `/u/:username`: a player's public profile, ratings and games. Keyed by the name, so each profile loads afresh. */
export default function ProfilePage() {
  const { username = '' } = useParams()
  return <ProfileLoader key={username} username={username} />
}

function ProfileLoader({ username }: { username: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  usePageTitle(loaded.state === 'ready' ? loaded.profile.user.displayName : 'Player')

  useEffect(() => {
    let live = true
    fetchProfile(username)
      .then((profile) => live && setLoaded({ state: 'ready', profile }))
      .catch((error) => {
        if (!live) return
        if (error instanceof ApiError && error.status === 404) setLoaded({ state: 'missing' })
        else setLoaded({ state: 'failed', message: error instanceof Error ? error.message : 'Could not load this profile.' })
      })
    return () => {
      live = false
    }
  }, [username])

  return (
    <AppShell>
      {loaded.state === 'ready' ? (
        <ProfileView key={loaded.profile.user.id} profile={loaded.profile} />
      ) : (
        <div className="page page--narrow">
          {loaded.state === 'loading' ? (
            <p className="page-loading" role="status">
              Loading…
            </p>
          ) : (
            <Panel as="section" aria-labelledby="missing-h">
              <h1 id="missing-h" className="panel__title">
                {loaded.state === 'missing' ? 'No such player' : 'This profile could not be loaded'}
              </h1>
              <p className="panel__text">
                {loaded.state === 'missing'
                  ? `Nobody is called ${username}. The name may have changed, or the account may be deleted.`
                  : loaded.message}
              </p>
              <div className="panel__actions">
                <ButtonLink to="/leaderboards">Leaderboards</ButtonLink>
              </div>
            </Panel>
          )}
        </div>
      )}
    </AppShell>
  )
}
