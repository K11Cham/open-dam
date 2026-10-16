import { Lock } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import Panel from '../components/ui/Panel'
import Chapter1 from './tutorial/Chapter1'
import { CHAPTERS } from './tutorial/chapters'

/**
 * Tutorial shell and chapter navigation. Chapter 1 is written; chapters 2-8 are
 * titled placeholders, deliberately marked as such rather than stubbed with
 * filler text.
 */
export default function TutorialPage() {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('chapter') ?? '1')
  const active = CHAPTERS.find((chapter) => chapter.id === requested) ?? CHAPTERS[0]

  return (
    <AppShell showNewGame={false}>
      <div className="dam-page">
        <div className="dam-section-head">
          <h1 className="dam-section-title">Learn</h1>
          <span style={{ fontSize: 12, color: 'var(--dam-ink-muted)' }}>
            Chapter 1 is written. The rest are placeholders.
          </span>
        </div>

        <div className="dam-tutorial-layout">
          <nav className="dam-chapter-list" aria-label="Chapters">
            {CHAPTERS.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                disabled={!chapter.available}
                className={[
                  'dam-chapter',
                  chapter.id === active.id && chapter.available && 'is-active',
                  !chapter.available && 'is-placeholder',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setParams({ chapter: String(chapter.id) })}
              >
                <span style={{ fontFamily: 'var(--dam-font-mono)', fontSize: 11 }}>
                  {String(chapter.id).padStart(2, '0')}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{chapter.title}</span>
                  <span style={{ display: 'block', fontSize: 11, opacity: 0.75 }}>
                    {chapter.summary}
                  </span>
                </span>
                {!chapter.available && <Lock size={13} />}
              </button>
            ))}
          </nav>

          <Panel style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
            {active.available ? (
              <>
                <h2 className="dam-section-title" style={{ marginBottom: 12 }}>
                  {active.title}
                </h2>
                <Chapter1 />
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--dam-ink-muted)' }}>
                Not written yet.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  )
}
