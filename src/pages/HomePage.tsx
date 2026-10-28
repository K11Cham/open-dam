import { ArrowRight, BookOpen, Bot, Globe, Microscope, Play, Trash2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DIFFICULTIES, DIFFICULTY_IDS } from '../ai/difficulty'
import BoardThumbnail from '../components/board/BoardThumbnail'
import DemoBoard from '../components/board/DemoBoard'
import AppShell from '../components/layout/AppShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import Panel from '../components/ui/Panel'
import { useSideNames } from '../context/useTheme'
import { createInitialState } from '../game/engine'
import { positionFromAscii } from '../game/position'
import type { PlayerId } from '../game/types'
import { countOf, outcomeTitle, seatLabel, timeControlLabel } from '../lib/describe'
import { usePageTitle } from '../lib/usePageTitle'
import { replay } from '../match/reducer'
import { DEFAULT_SETUP, setupToParams } from '../match/setup'
import type { OpponentChoice } from '../match/setup'
import { clearActiveMatch, loadActiveMatch, loadArchive } from '../match/storage'
import type { MatchRecord } from '../match/types'

// Positions for the preview boards on the cards, built once at load.
const PREVIEWS = {
  computer: positionFromAscii(['b.bb.', '.b..b', 'a.b.a', '..a..', 'aa.A.'], 'player2').board,
  hotseat: createInitialState({ boardSize: 5 }).board,
  online: createInitialState({ boardSize: 7 }).board,
  learn: positionFromAscii(['.....', '..b..', '.....', '..b..', '..a..'], 'player1').board,
  analysis: positionFromAscii(['b.b.b..', '.......', '..b....', '...A...', '.a...b.', '.......', 'a..a..a'], 'player1').board,
}

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

interface TileProps {
  to: string
  board: (typeof PREVIEWS)[keyof typeof PREVIEWS]
  icon: ReactNode
  title: ReactNode
  text: string
}

/** A card with a small board preview, in the manner of a games site's front page. */
function Tile({ to, board, icon, title, text }: TileProps) {
  return (
    <li>
      <Link className="tile" to={to}>
        <BoardThumbnail board={board} className="tile__thumb" />
        <span className="tile__body">
          <span className="tile__title">
            {icon} {title}
          </span>
          <span className="tile__text">{text}</span>
        </span>
        <ArrowRight size={16} aria-hidden className="tile__go" />
      </Link>
    </li>
  )
}

export default function HomePage() {
  usePageTitle(null)
  const sideNames = useSideNames()
  const [active, setActive] = useState(loadActiveMatch)
  const [archive] = useState(loadArchive)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Final positions for the recent-games list, replayed from each saved log.
  const finals = useMemo(
    () =>
      archive.slice(0, 6).map(({ record }) => {
        try {
          return replay(record).position.board
        } catch {
          return null
        }
      }),
    [archive],
  )

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
                New game
              </ButtonLink>
              <ButtonLink to="/learn" size="lg" icon={<BookOpen size={18} />}>
                Learn the rules
              </ButtonLink>
            </div>
          </div>
          <div className="hero__board">
            <DemoBoard />
          </div>
        </section>

        {unfinished && (
          <Panel as="section" className="continue" aria-labelledby="continue-h">
            <BoardThumbnail
              board={unfinished.state.position.board}
              orientation={humanSide(unfinished.record) ?? 'player1'}
              label="The position in your unfinished game"
              className="continue__thumb"
            />
            <div className="continue__text">
              <h2 id="continue-h" className="panel__title">
                Your game is waiting
              </h2>
              <p className="panel__text">
                {opponentText(unfinished.record, sideNames)} · {unfinished.record.config.settings.boardSize}×
                {unfinished.record.config.settings.boardSize} · {timeControlLabel(unfinished.record.config.settings)} ·{' '}
                {countOf(unfinished.state.position.moves.length, 'move')} played
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
            <p className="section__lede">Classic 5×5 rules, no clock. Choose another board or a clock on the New game page.</p>
          </div>
          <div className="play-grid">
            <Panel as="article" className="bots" aria-labelledby="bots-h">
              <div className="bots__intro">
                <BoardThumbnail board={PREVIEWS.computer} className="bots__thumb" />
                <div className="bots__copy">
                  <h3 id="bots-h" className="tile__title">
                    <Bot size={18} aria-hidden /> Play the computer
                  </h3>
                  <p className="tile__text">
                    Five opponents with Wolof names, from Döff, who plays on impulse, to Seriñ, who plays to win from the first
                    move.
                  </p>
                </div>
              </div>
              <ul className="bots__list" role="list">
                {DIFFICULTY_IDS.map((id) => (
                  <li key={id}>
                    <Link className="bot-row" to={quickLink(id)}>
                      <span className="bot-row__name">{DIFFICULTIES[id].name}</span>
                      <span className="bot-row__meaning">{DIFFICULTIES[id].meaning}</span>
                      <span className="bot-row__elo">~{DIFFICULTIES[id].elo}</span>
                      <span className="bot-row__blurb">{DIFFICULTIES[id].blurb}</span>
                      <ArrowRight size={16} aria-hidden className="bot-row__go" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>

            <ul className="tiles" role="list">
              <Tile
                to={quickLink('hotseat')}
                board={PREVIEWS.hotseat}
                icon={<Users size={18} aria-hidden />}
                title="Pass and play"
                text="Two people, one screen: the way the game is usually played."
              />
              <Tile
                to={quickLink('online')}
                board={PREVIEWS.online}
                icon={<Globe size={18} aria-hidden />}
                title={
                  <>
                    Online <span className="tag">Preview</span>
                  </>
                }
                text="Invite someone with a link. For now it works between tabs of one browser."
              />
              <Tile
                to="/learn"
                board={PREVIEWS.learn}
                icon={<BookOpen size={18} aria-hidden />}
                title="Learn the rules"
                text="Eight short chapters, with boards that play the examples out."
              />
              <Tile
                to="/analysis"
                board={PREVIEWS.analysis}
                icon={<Microscope size={18} aria-hidden />}
                title="Analysis board"
                text="Set up any position and play it out from both sides."
              />
            </ul>
          </div>
        </section>

        {archive.length > 0 && (
          <section className="section" aria-labelledby="recent-h">
            <div className="section__head">
              <h2 id="recent-h" className="section__title">
                Recent games
              </h2>
            </div>
            <ul className="recent" role="list">
              {archive.slice(0, 6).map(({ record, finishedAt, status }, index) => {
                const final = finals[index]
                return (
                  <li key={record.config.id}>
                    <Link className="recent__row" to={`/review/${record.config.id}`}>
                      {final && (
                        <BoardThumbnail
                          board={final}
                          orientation={humanSide(record) ?? 'player1'}

                          className="recent__thumb"
                        />
                      )}
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
