import { ArrowLeft, ArrowRight, Play } from 'lucide-react'
import { Link, NavLink, Navigate, useParams } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import { ButtonLink } from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import { useSideNames } from '../context/useTheme'
import { RULES_AT_A_GLANCE } from '../game/settings'
import { usePageTitle } from '../lib/usePageTitle'
import ExampleBoard from './tutorial/ExampleBoard'
import { CHAPTERS, findChapter } from './tutorial/chapters'
import type { Chapter } from './tutorial/chapters'

const fill = (text: string, names: Record<'player1' | 'player2', string>) =>
  text.replaceAll('{p1}', names.player1).replaceAll('{p2}', names.player2)

function ChapterNav({ current }: { current?: string }) {
  return (
    <nav className="chapters" aria-label="Chapters">
      <NavLink to="/learn" end className={({ isActive }) => `chapters__link ${isActive ? 'is-active' : ''}`}>
        <span className="chapters__num">—</span>
        <span>Rules at a glance</span>
      </NavLink>
      <ol className="chapters__list">
        {CHAPTERS.map((chapter, index) => (
          <li key={chapter.id}>
            <NavLink
              to={`/learn/${chapter.id}`}
              className={`chapters__link ${current === chapter.id ? 'is-active' : ''}`}
              aria-current={current === chapter.id ? 'page' : undefined}
            >
              <span className="chapters__num">{index + 1}</span>
              <span>{chapter.title}</span>
            </NavLink>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Overview() {
  const names = useSideNames()
  return (
    <>
      <Panel as="section" aria-labelledby="glance-h">
        <h2 id="glance-h" className="panel__title">
          The rules at a glance
        </h2>
        <ol className="rules-list">
          {RULES_AT_A_GLANCE.map((rule) => (
            <li key={rule}>{fill(rule, names)}</li>
          ))}
        </ol>
      </Panel>
      <ul className="card-grid" role="list">
        {CHAPTERS.map((chapter, index) => (
          <li key={chapter.id}>
            <Link className="card card--link" to={`/learn/${chapter.id}`}>
              <span className="card__head">
                <span className="card__badge">Chapter {index + 1}</span>
              </span>
              <span className="card__title">{chapter.title}</span>
              <span className="card__text">{chapter.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function ChapterView({ chapter }: { chapter: Chapter }) {
  const names = useSideNames()
  const index = CHAPTERS.indexOf(chapter)
  const prev = CHAPTERS[index - 1]
  const next = CHAPTERS[index + 1]
  return (
    <article className="lesson" aria-labelledby="lesson-title">
      <p className="eyebrow">Chapter {index + 1}</p>
      <h2 id="lesson-title" className="lesson__title">
        {chapter.title}
      </h2>
      {chapter.sections.map((section) => (
        <section key={section.heading} className="lesson__section">
          <h3 className="lesson__heading">{section.heading}</h3>
          <div className="prose">
            {section.paragraphs.map((p) => (
              <p key={p}>{fill(p, names)}</p>
            ))}
          </div>
          {section.example && <ExampleBoard spec={section.example} label={`Example: ${section.heading}`} />}
        </section>
      ))}
      <nav className="lesson__pager" aria-label="Chapter navigation">
        {prev ? (
          <ButtonLink to={`/learn/${prev.id}`} variant="ghost" icon={<ArrowLeft size={16} />}>
            {prev.title}
          </ButtonLink>
        ) : (
          <span />
        )}
        {next ? (
          <ButtonLink to={`/learn/${next.id}`} variant="primary" icon={<ArrowRight size={16} />}>
            {next.title}
          </ButtonLink>
        ) : (
          <ButtonLink to="/play" variant="primary" icon={<Play size={16} />}>
            Play a game
          </ButtonLink>
        )}
      </nav>
    </article>
  )
}

/** `/learn` (overview) and `/learn/:chapterId`. */
export default function TutorialPage() {
  const { chapterId } = useParams()
  const chapter = chapterId ? findChapter(chapterId) : null
  usePageTitle(chapter ? chapter.title : 'Learn')
  if (chapterId && !chapter) return <Navigate to="/learn" replace />

  return (
    <AppShell>
      <div className="page page--wide">
        <header className="page-head">
          <p className="eyebrow">Learn</p>
          <h1 className="page-title">How to play Dam</h1>
          <p className="page-lede">Eight short chapters. Every example board plays real moves through the game engine.</p>
        </header>
        <div className="learn">
          <ChapterNav current={chapter?.id} />
          <div className="learn__content">{chapter ? <ChapterView key={chapter.id} chapter={chapter} /> : <Overview />}</div>
        </div>
      </div>
    </AppShell>
  )
}
