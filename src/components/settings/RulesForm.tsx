import { ChevronDown } from 'lucide-react'
import {
  CALL_SCOPE_LABELS,
  PROMOTION_POLICY_BLURBS,
  PROMOTION_POLICY_LABELS,
  TIME_CONTROLS,
  boardTypeForSize,
} from '../../game/settings'
import type { BoardSize, CallScope, PromotionPolicy, RuleSettings } from '../../game/types'
import Segmented from '../ui/Segmented'
import Switch from '../ui/Switch'

const SIZES: BoardSize[] = [5, 6, 7, 8, 9]
const POLICIES: PromotionPolicy[] = ['promote-and-continue', 'promote-after-chain', 'end-turn-on-promotion']

interface RulesFormProps {
  settings: RuleSettings
  onChange: (next: RuleSettings) => void
  /** Hide the "match opponent" promotion option (it only means something online). */
  online?: boolean
}

/**
 * The rule settings for a new game. Board and clock are always visible; the
 * variant rules (crowning mid-chain, what a call takes, draw rules) sit under
 * "House rules", because most players will never change them.
 */
export default function RulesForm({ settings, onChange, online = false }: RulesFormProps) {
  const patch = (next: Partial<RuleSettings>) => onChange({ ...settings, ...next })
  const policies = online ? [...POLICIES, 'match-opponent' as const] : POLICIES

  return (
    <div className="form-stack">
      <Segmented
        label="Board size"
        value={settings.boardSize}
        options={SIZES.map((size) => ({
          value: size,
          label: `${size}×${size}`,
          hint: boardTypeForSize(size) === 'yinyang' ? 'Interlocking start, centre square empty' : 'Rows start, two empty rows between',
        }))}
        onChange={(size) => patch({ boardSize: size, boardType: boardTypeForSize(size) })}
      />
      <p className="field__help">
        {settings.boardType === 'yinyang'
          ? 'Odd boards start interlocked around an empty centre. 5×5 is the classic village game.'
          : 'Even boards start with the armies in rows and two empty rows between them.'}
      </p>

      <Segmented
        label="Clock"
        wrap
        value={settings.timeControl?.label ?? 'untimed'}
        options={[
          { value: 'untimed', label: 'Untimed' },
          ...TIME_CONTROLS.map((tc) => ({ value: tc.label, label: tc.label, hint: `${tc.initialMs / 60000} minutes each, plus ${tc.incrementMs / 1000}s per move` })),
        ]}
        onChange={(label) => patch({ timeControl: label === 'untimed' ? null : (TIME_CONTROLS.find((tc) => tc.label === label) ?? null) })}
      />
      <p className="field__help">Minutes each + seconds added per move.</p>

      <details className="disclosure">
        <summary className="disclosure__summary">
          <span>House rules</span>
          <ChevronDown size={16} aria-hidden className="disclosure__chevron" />
        </summary>
        <div className="disclosure__body form-stack">
          <Segmented
            label="Crowning in the middle of a chain"
            wrap
            value={online ? settings.promotionPolicy : settings.promotionPolicy === 'match-opponent' ? 'promote-and-continue' : settings.promotionPolicy}
            options={policies.map((policy) => ({ value: policy, label: PROMOTION_POLICY_LABELS[policy] }))}
            onChange={(policy) => patch({ promotionPolicy: policy })}
          />
          <p className="field__help">{PROMOTION_POLICY_BLURBS[settings.promotionPolicy]}</p>

          <Segmented
            label="What a call removes"
            wrap
            value={settings.call.scope}
            options={(['choose-one', 'all'] as CallScope[]).map((scope) => ({ value: scope, label: CALL_SCOPE_LABELS[scope] }))}
            onChange={(scope) => patch({ call: { ...settings.call, scope } })}
          />
          <Switch
            checked={settings.call.abandonedChainCallable}
            onChange={(value) => patch({ call: { ...settings.call, abandonedChainCallable: value } })}
            label="Stopping a chain early can be called"
            description="If you stop capturing while another capture is still available, your opponent may call that piece."
          />
          <Switch
            checked={settings.draw.threefoldRepetition}
            onChange={(value) => patch({ draw: { ...settings.draw, threefoldRepetition: value } })}
            label="Draw on threefold repetition"
            description="The same position with the same side to move, three times."
          />
          <Segmented
            label="Draw after moves without a capture"
            value={settings.draw.pliesWithoutCapture ?? 0}
            options={[
              { value: 0, label: 'Never' },
              { value: 50, label: '25 each' },
              { value: 100, label: '50 each' },
            ]}
            onChange={(plies) => patch({ draw: { ...settings.draw, pliesWithoutCapture: plies === 0 ? null : plies } })}
          />
          <p className="field__help">
            Captures are optional, so a player who is behind could otherwise avoid them forever. These rules make sure every game ends.
          </p>
        </div>
      </details>
    </div>
  )
}
