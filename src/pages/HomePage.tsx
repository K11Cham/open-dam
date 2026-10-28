import { ArrowRight, BookOpen, Bot, Globe, History, Play, Trash2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DIFFICULTIES, DIFFICULTY_IDS } from '../ai/difficulty'
import BoardView from '../components/board/BoardView'
import AppShell from '../components/layout/AppShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import Panel from '../components/ui/Panel'
import { useSideNames } from '../context/useTheme'
import { createInitialState } from '../game/engine'
import type { PlayerId } from '../game/types'
import { outcomeTitle, seatLabel, timeControlLabel } from '../lib/describe'
import { usePageTitle } from '../lib/usePageTitle'
import { DEFAULT_SETUP, setupToParams } from '../match/setup'
import type { OpponentChoice } from '../match/setup'
import { clearActiveMatch, loadActiveMatch, loadArchive } from '../match/storage'
import type { MatchRecord } from '../match/types'

const quickLink = (opponent: OpponentChoice) => `/match/new?${setupToParams({ ...DEFAULT_SETUP, opponent }).toString()}`

const humanSide = (record: MatchRecord): PlayerId | null => {
  const humans = (['player1', 'player2'] as PlayerId[]).filter((p) => record.config.seats[p].kind === 'human')
  return humans.length === 1 ? humans[0] : null
}

const opponentText = (record: MatchRecord, sideNames: Record<PlayerId, string>) => {
  const me = humanSide(record)
  if (!me) return 'Pass and play'
  const other: PlayerId = me === 'player1' ? 'player2' : 'player1'
  const seat = record.config.seats[other]
  return seat.kind === 'remote' ? 'Online game' : `vs ${seatLabel(seat, other, sideNames)}`
}

export default function HomePage() {
  usePageTitle(null)
  const sideNames = useSideNames()
  const [active, setActive] = useState(loadActiveMatch)
  const [archive] = useState(loadArchive)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const preview = useMemo(() => createInitialState({ boardSize: 5 }), [])

  const unfinished = active && active.state.position.status.kind === 'playing' ? active : null

  return (
    <AppShell>
      <div className="page">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <p className="eyebrow">A board game from The Gambia</p>
            <h1 id="hero-title" className="hero__title">
              Open Dam
            </h1>
            <p className="hero__lede">
              Dam is played across The Gambia, often on a grid drawn in the sand with sticks and stones for pieces. Pieces move
              straight, never diagonally. Captures are optional, but skip one and your opponent can call it.
            </p>
            <div className="hero__actions">
              <ButtonLink to="/play" variant="primary" size="lg" icon={<Play size={18} />}>
                Play
              </ButtonLink>
              <ButtonLink to="/learn" size="lg" icon={<BookOpen size={18} />}>
                Learn the rules
              </ButtonLink>
            </div>
          </div>
          <div className="hero__board">
            <BoardView
              position={preview}
              orientation="player1"
              selected={null}
              destinations={{ slides: [], captures: [] }}
              offenderIds={new Set()}
              animations={[]}
              promotedIds={[]}
              lastMove={null}
              interactive={false}
              canDragFrom={() => false}
              onSquare={() => {}}
              onDrop={() => {}}
              perspective={null}
              sideNames={sideNames}
              label="The starting position on a 5 by 5 board"
              showCoordinates={false}
              hideEndSequence
            />
          </div>
        </section>

        {unfinished && (
          <Panel as="section" className="continue" aria-labelledby="continue-h">
            <div className="continue__text">
              <h2 id="continue-h" className="panel__title">
                Your game is waiting
              </h2>
              <p className="panel__text">
                {opponentText(unfinished.record, sideNames)} · {unfinished.record.config.settings.boardSize}×
                {unfinished.record.config.settings.boardSize} · {timeControlLabel(unfinished.record.config.settings)} ·{' '}
                {unfinished.state.position.moves.length} moves played
              </p>
            </div>
            <div className="panel__actions">
              <ButtonLink
                to={
                  unfinished.record.config.mode === 'online'
                    ? `/online/${unfinished.record.config.id}`
                    : `/match/${unfinished.record.config.id}`
                }
                variant="primary"
                icon={<ArrowRight size={16} />}
              >
                Continue
              </ButtonLink>
              <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setConfirmDiscard(true)}>
                Discard
              </Button>
            </div>
          </Panel>
        )}

        <section className="section" aria-labelledby="quick-h">
          <div className="section__head">
            <h2 id="quick-h" className="section__title">
              Quick play
            </h2>
            <p className="section__lede">Classic 5×5 rules, no clock. Change anything on the New game page.</p>
          </div>
          <ul className="card-grid" role="list">
            {DIFFICULTY_IDS.map((id) => (
              <li key={id}>
                <Link className="card card--link" to={quickLink(id)}>
                  <span className="card__head">
                    <Bot size={18} aria-hidden />
                    <span className="card__title">{DIFFICULTIES[id].name}</span>
                    <span className="card__badge">~{DIFFICULTIES[id].elo}</span>
                  </span>
                  <span className="card__text">{DIFFICULTIES[id].blurb}</span>
                  <span className="card__cta">
                    Play the computer <ArrowRight size={15} aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link className="card card--link" to={quickLink('hotseat')}>
                <span className="card__head">
                  <Users size={18} aria-hidden />
                  <span className="card__title">Pass and play</span>
                </span>
                <span className="card__text">Two people, one screen. The way the game is usually played: face to face.</span>
                <span className="card__cta">
                  Start <ArrowRight size={15} aria-hidden />
                </span>
              </Link>
            </li>
            <li>
              <Link className="card card--link" to={quickLink('online')}>
                <span className="card__head">
                  <Globe size={18} aria-hidden />
                  <span className="card__title">Online</span>
                  <span className="card__badge">Preview</span>
                </span>
                <span className="card__text">Invite someone with a link. For now this works between tabs of one browser.</span>
                <span className="card__cta">
                  Create a game <ArrowRight size={15} aria-hidden />
                </span>
              </Link>
            </li>
          </ul>
        </section>

        {archive.length > 0 && (
          <section className="section" aria-labelledby="recent-h">
            <div className="section__head">
              <h2 id="recent-h" className="section__title">
                Recent games
              </h2>
            </div>
            <ul className="recent" role="list">
              {archive.slice(0, 6).map(({ record, finishedAt, status }) => {
                return (
                  <li key={record.config.id}>
                    <Link className="recent__row" to={`/review/${record.config.id}`}>
                      <History size={16} aria-hidden />
                      <span className="recent__result">{outcomeTitle(status, humanSide(record), sideNames)}</span>
                      <span className="recent__meta">
                        {opponentText(record, sideNames)} · {record.config.settings.boardSize}×{record.config.settings.boardSize}
                      </span>
                      <time className="recent__date" dateTime={new Date(finishedAt).toISOString()}>
                        {new Date(finishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </time>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section className="section about" aria-labelledby="about-h">
          <h2 id="about-h" className="section__title">
            About this project
          </h2>
          <p>
            Open Dam was made by someone who spent eight years in The Gambia and learned the game in Kerr Jarga Jobe, in the North
            Bank Region, where children and adults played the 5×5 version drawn in the sand. It is open source, so the rules and
            the code are there for anyone to read and improve.
          </p>
        </section>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this game?"
        description="The unfinished game will be deleted from this device."
        confirmLabel="Discard"
        tone="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          clearActiveMatch()
          setActive(null)
          setConfirmDiscard(false)
        }}
      />
    </AppShell>
  )
}
