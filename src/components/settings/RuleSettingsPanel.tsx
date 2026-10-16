import {
  CALL_SCOPE_LABELS,
  PROMOTION_POLICY_BLURBS,
  PROMOTION_POLICY_LABELS,
  RULES_SUMMARY,
  TIME_CONTROLS,
  boardTypeForSize,
} from '../../game/settings'
import type { BoardSize, CallScope, PromotionPolicy, RuleSettings } from '../../game/types'
import Panel from '../ui/Panel'
import Segmented from '../ui/Segmented'
import Switch from '../ui/Switch'

interface RuleSettingsPanelProps {
  settings: RuleSettings
  onChange: (next: RuleSettings) => void
}

const SIZES: BoardSize[] = [5, 6, 7, 8, 9]

const POLICIES: PromotionPolicy[] = [
  'promote-and-continue',
  'promote-after-chain',
  'end-turn-on-promotion',
  'match-opponent',
]

/**
 * Pre-game rule settings. The three subjective rules — promotion during a
 * chain, what a call takes, and whether an abandoned chain is callable — are
 * toggles here rather than hardcoded behaviours, and they are stored per match.
 */
export default function RuleSettingsPanel({ settings, onChange }: RuleSettingsPanelProps) {
  const patch = (next: Partial<RuleSettings>) => onChange({ ...settings, ...next })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <span className="dam-section-label">Board size</span>
          <div style={{ marginTop: 8 }}>
            <Segmented
              label="Board size"
              value={settings.boardSize}
              options={SIZES.map((size) => ({
                value: size,
                label: `${size}×${size}`,
                hint: boardTypeForSize(size) === 'yinyang' ? 'Yin/yang start' : 'Row start',
              }))}
              onChange={(size) =>
                patch({ boardSize: size, boardType: boardTypeForSize(size) })
              }
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--dam-ink-muted)', margin: '8px 0 0' }}>
            {settings.boardType === 'yinyang'
              ? 'Odd sizes open yin/yang: player one may send any piece to the centre on move one, as long as player two still has a reply.'
              : 'Even sizes open with plain rows and a two-row gap.'}
          </p>
        </div>

        <div>
          <span className="dam-section-label">Time control</span>
          <div style={{ marginTop: 8 }}>
            <Segmented
              label="Time control"
              value={settings.timeControl?.label ?? 'untimed'}
              options={[
                { value: 'untimed', label: 'Untimed' },
                ...TIME_CONTROLS.map((tc) => ({ value: tc.label, label: tc.label })),
              ]}
              onChange={(label) =>
                patch({
                  timeControl:
                    label === 'untimed'
                      ? null
                      : (TIME_CONTROLS.find((tc) => tc.label === label) ?? null),
                })
              }
            />
          </div>
        </div>
      </Panel>

      <Panel style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <span className="dam-section-label">Promotion during a chain capture</span>
          <div style={{ marginTop: 8 }}>
            <Segmented
              label="Promotion policy"
              value={settings.promotionPolicy}
              options={POLICIES.map((policy) => ({
                value: policy,
                label: PROMOTION_POLICY_LABELS[policy],
              }))}
              onChange={(policy) => patch({ promotionPolicy: policy })}
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--dam-ink-muted)', margin: '8px 0 0' }}>
            {PROMOTION_POLICY_BLURBS[settings.promotionPolicy]}
          </p>
          <p style={{ fontSize: 12, color: 'var(--dam-ink-muted)', margin: '6px 0 0' }}>
            Stored per match. Matchmaking only pairs players whose settings agree, except that
            “match opponent” pairs with anything.
          </p>
        </div>

        <div>
          <span className="dam-section-label">Calling</span>
          <div style={{ marginTop: 8 }}>
            <Segmented
              label="What a call takes"
              value={settings.call.scope}
              options={(['choose-one', 'all'] as CallScope[]).map((scope) => ({
                value: scope,
                label: CALL_SCOPE_LABELS[scope],
              }))}
              onChange={(scope) => patch({ call: { ...settings.call, scope } })}
            />
          </div>
          <Switch
            checked={settings.call.abandonedChainCallable}
            onChange={(value) => patch({ call: { ...settings.call, abandonedChainCallable: value } })}
            label="Abandoned chains are callable"
            description="Stopping a chain partway through exposes the captures you left behind."
          />
        </div>
      </Panel>

      <Panel style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="dam-section-label">Draw rules</span>
        <Switch
          checked={settings.draw.threefoldRepetition}
          onChange={(value) => patch({ draw: { ...settings.draw, threefoldRepetition: value } })}
          label="Threefold repetition"
          description="The same position with the same side to move, three times over."
        />
        <div>
          <Segmented
            label="Moves without a capture"
            value={settings.draw.pliesWithoutCapture ?? 0}
            options={[
              { value: 0, label: 'Off' },
              { value: 50, label: '25 moves each' },
              { value: 100, label: '50 moves each' },
            ]}
            onChange={(plies) =>
              patch({ draw: { ...settings.draw, pliesWithoutCapture: plies === 0 ? null : plies } })
            }
          />
          <p style={{ fontSize: 12, color: 'var(--dam-ink-muted)', margin: '8px 0 0' }}>
            Both of these sit alongside the one-piece-each tie rule. Because captures are optional,
            a player who is behind can decline forever, so without them some endgames never finish.
          </p>
        </div>
      </Panel>

      <Panel style={{ padding: 18 }}>
        <span className="dam-section-label">Rules summary</span>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6 }}>
          {RULES_SUMMARY.split('\n').map((line) => (
            <li key={line} style={{ marginBottom: 4 }}>
              {line}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
