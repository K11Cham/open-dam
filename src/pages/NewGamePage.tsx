import { Play } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DifficultyId } from '../ai/difficulty'
import AppShell from '../components/layout/AppShell'
import OpponentPicker from '../components/settings/OpponentPicker'
import RuleSettingsPanel from '../components/settings/RuleSettingsPanel'
import Button from '../components/ui/Button'
import Panel from '../components/ui/Panel'
import { DEFAULT_SETTINGS, filterCompatibleSeeks } from '../game/settings'
import type { PlayerId, RuleSettings } from '../game/types'
import { RANKED_POOLS } from '../data/ranked'
import { storage, STORAGE_KEYS } from '../services/storage'
import { settingsToParams } from './matchParams'

/**
 * Pre-game screen. Alongside the rule toggles it shows how many of the mock
 * ranked pools these settings could actually be paired with — that list comes
 * from the engine's `filterCompatibleSeeks`, which is the real compatibility
 * rule rather than a display approximation.
 */
export default function NewGamePage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<RuleSettings>(
    () => storage.get<RuleSettings>(STORAGE_KEYS.lastSettings) ?? DEFAULT_SETTINGS,
  )
  const [opponent, setOpponent] = useState<DifficultyId | 'human'>('human')
  const [side, setSide] = useState<PlayerId>('player1')

  const compatible = filterCompatibleSeeks(
    settings,
    RANKED_POOLS.map((pool) => ({ id: pool.id, settings: pool.settings, payload: pool })),
  )

  const start = () => {
    storage.set(STORAGE_KEYS.lastSettings, settings)
    storage.remove(STORAGE_KEYS.resumeMatch)
    const params = settingsToParams(settings)
    if (opponent !== 'human') params.set('ai', opponent)
    params.set('side', side)
    navigate(`/match?${params.toString()}`)
  }

  return (
    <AppShell showNewGame={false}>
      <div className="dam-page">
        <div className="dam-section-head">
          <h1 className="dam-section-title">New game</h1>
          <Button variant="primary" onClick={start}>
            <Play size={15} />
            Start
          </Button>
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr' }}>
          <OpponentPicker
            opponent={opponent}
            onOpponentChange={setOpponent}
            side={side}
            onSideChange={setSide}
          />

          <RuleSettingsPanel settings={settings} onChange={setSettings} />

          <Panel style={{ padding: 18 }}>
            <span className="dam-section-label">Matchmaking preview</span>
            <p style={{ fontSize: 13, margin: '10px 0 0' }}>
              {compatible.length === 0
                ? 'No open pool matches these settings. Online play would queue you separately.'
                : `${compatible.length} of ${RANKED_POOLS.length} pools would accept these settings.`}
            </p>
            {compatible.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--dam-ink-muted)' }}>
                {compatible.map((seek) => (
                  <li key={seek.id}>{seek.id}</li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 12, color: 'var(--dam-ink-muted)', margin: '10px 0 0' }}>
              Data model only — there is no queue behind this yet.
            </p>
          </Panel>
        </div>

        <div style={{ marginTop: 20 }}>
          <Button variant="primary" onClick={start}>
            <Play size={15} />
            Start game
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
