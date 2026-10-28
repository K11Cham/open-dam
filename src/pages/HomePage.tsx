import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { BookOpen, Cpu, LineChart, Play, Trophy, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import Button from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import Card from '../components/ui/Card'
import { AI_OPPONENTS } from '../data/aiOpponents'
import { DEFAULT_SETTINGS } from '../game/settings'
import { MODE_BLURBS, groupPoolsByMode } from '../data/ranked'
import { settingsToParams } from './matchParams'

/**
 * Home, reworked toward a lobby layout: a hero with one obvious Play button,
 * then ranked sections broken out by game mode, board size and time control.
 *
 * SCAFFOLD: the ranked cards are backed by mock pools. There is no elo maths
 * and no queue — clicking one starts a local match under that pool's rules.
 */
export default function HomePage() {
  const navigate = useNavigate()
  const groups = groupPoolsByMode()

  return (
    <AppShell showNewGame={false}>
      <div className="dam-page">
        <Panel className="dam-hero">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <span className="dam-tag">Checkers, but orthogonal</span>
            <h1 className="dam-hero-title">Open Dam</h1>
            <p className="dam-hero-sub">
              A traditional Gambian board game, modernized.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => navigate('/play')}>
                <Play size={16} />
                Play
              </Button>
              <Button onClick={() => navigate('/learn')}>
                <BookOpen size={15} />
                Learn the rules
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <QuickLink
              icon={<LineChart size={16} />}
              title="Analysis board"
              body="Place any position and play it out under the real rules."
              onClick={() => navigate('/analysis')}
            />
            <QuickLink
              icon={<Trophy size={16} />}
              title="Leaderboards"
              body="Sample standings across modes, sizes and clocks."
              onClick={() => navigate('/leaderboards')}
            />
          </motion.div>
        </Panel>

        <section className="dam-section">
          <div className="dam-section-head">
            <h2 className="dam-section-title">Quick play</h2>
            <span style={{ fontSize: 12, color: 'var(--dam-ink-muted)', maxWidth: '48ch' }}>
              Get straight into a game, versus AI or a real person(doesnt exist yet tho.)
            </span>
          </div>

          <div className="dam-grid">
            {/* {AI_OPPONENTS.map((entry) => {
              const params = settingsToParams(DEFAULT_SETTINGS)
              params.set('ai', entry.difficulty.id)
              params.set('side', 'player1')
              return (
                <button
                  key={entry.difficulty.id}
                  type="button"
                  className="dam-tier-card"
                  onClick={() => navigate(`/match?${params.toString()}`)}
                >
                  <span className="dam-tier-head">
                    <span className="dam-card-title">
                      <Cpu size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                      {entry.difficulty.name}
                    </span>
                    <span className="dam-tier-elo">{entry.difficulty.elo}</span>
                  </span>
                  <span className="dam-card-meta">{entry.difficulty.blurb}</span>
                  <span className="dam-card-meta" style={{ marginTop: 'auto', opacity: 0.8 }}>
                    {entry.bandLabel}
                  </span>
                </button>
              )
            })} */}

            <Card>
              <div className="dam-card-title">
                <h2 className="dam-card-header">Recommended game:</h2>
                <span className='dam-tag'>5x5 - Vs Club</span>
                <span className='dam-tag'>Chain rules</span>

                
              </div>
              <div>
                <img src="/board.png" alt="" width="1024" />
              </div>
              <div className="dam-card-cta">
                <Button variant="primary">Challenge</Button>
              </div>
            </Card>
            <Card>
              <div className="dam-card-title">
                <h2 className="dam-card-header">Recommended game:</h2>
                <span className='dam-tag'>5x5 - Vs Club</span>
                <span className='dam-tag'>Chain rules</span>

                
              </div>
              <div>
                <img src="/board.png" alt="" width="1024" />
              </div>
              <div className="dam-card-cta">
                <Button variant="primary">Challenge</Button>
              </div>
            </Card>
            
          </div>
        </section>

       

        <p style={{ fontSize: 12, color: 'var(--dam-ink-muted)', marginTop: 28 }}>
          Player counts and ratings on this page are placeholder data. Ranked matchmaking and elo
          are not implemented yet — these cards start a local match under the pool’s rule set.
        </p>
      </div>
    </AppShell>
  )
}

function QuickLink({
  icon,
  title,
  body,
  onClick,
}: {
  icon: ReactNode
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button type="button" className="dam-card" onClick={onClick} style={{ width: '100%' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <span className="dam-card-title">{title}</span>
      </span>
      <span className="dam-card-meta">{body}</span>
    </button>
  )
}
