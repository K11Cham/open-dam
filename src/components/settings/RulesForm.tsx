import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import {
  CALL_SCOPE_LABELS,
  DEFAULT_SETTINGS,
  PROMOTION_POLICY_BLURBS,
  PROMOTION_POLICY_LABELS,
  TIME_CONTROLS,
  boardTypeForSize,
} from '../../game/settings'
import type { BoardSize, CallScope, PromotionPolicy, RuleSettings } from '../../game/types'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
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

/** The house rules in force, one short line each, for the summary on the form. */
const houseRulesSummary = (settings: RuleSettings): string[] => {
  const { draw } = settings
  const draws = [
    draw.threefoldRepetition ? 'threefold repetition' : null,
    draw.pliesWithoutCapture ? `${draw.pliesWithoutCapture / 2} moves each without a capture` : null,
  ].filter(Boolean)
  return [
    `Crowning mid-chain: ${PROMOTION_POLICY_LABELS[settings.promotionPolicy].toLowerCase()}`,
    `A call removes: ${CALL_SCOPE_LABELS[settings.call.scope].toLowerCase()}`,
    settings.call.abandonedChainCallable ? 'Stopping a chain early can be called' : 'Stopping a chain early is safe',
    draws.length > 0 ? `Drawn on ${draws.join(' or ')}` : 'No automatic draws',
  ]
}

const isStandard = (settings: RuleSettings): boolean =>
  settings.promotionPolicy === DEFAULT_SETTINGS.promotionPolicy &&
  settings.call.scope === DEFAULT_SETTINGS.call.scope &&
  settings.call.abandonedChainCallable === DEFAULT_SETTINGS.call.abandonedChainCallable &&
  settings.draw.threefoldRepetition === DEFAULT_SETTINGS.draw.threefoldRepetition &&
  settings.draw.pliesWithoutCapture === DEFAULT_SETTINGS.draw.pliesWithoutCapture

/**
 * The rule settings for a new game. Board and clock are edited in place; the
 * variant rules (crowning mid-chain, what a call takes, draw rules) are shown
 * as a short summary and edited in a dialog, because most players never change
 * them and a long expanding section would push the rest of the page around.
 */
export default function RulesForm({ settings, onChange, online = false }: RulesFormProps) {
  const [editing, setEditing] = useState(false)
  const headingId = useId()
  const patch = (next: Partial<RuleSettings>) => onChange({ ...settings, ...next })
  const policies = online ? [...POLICIES, 'match-opponent' as const] : POLICIES
  const standard = isStandard(settings)
  const resetHouseRules = () =>
    patch({
      promotionPolicy: DEFAULT_SETTINGS.promotionPolicy,
      call: { ...DEFAULT_SETTINGS.call },
      draw: { ...DEFAULT_SETTINGS.draw },
    })

  return (
    <div className="form-stack">
      <Segmented
        label="Board size"
        value={settings.boardSize}
        options={SIZES.map((size) => ({
          value: size,
          label: `${size}×${size}`,
          hint:
            boardTypeForSize(size) === 'yinyang'
              ? 'Interlocking start, centre square empty'
              : 'Rows start, two empty rows between',
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
          ...TIME_CONTROLS.map((tc) => ({
            value: tc.label,
            label: tc.label,
            hint: `${tc.initialMs / 60000} minutes each, plus ${tc.incrementMs / 1000}s per move`,
          })),
        ]}
        onChange={(label) =>
          patch({ timeControl: label === 'untimed' ? null : (TIME_CONTROLS.find((tc) => tc.label === label) ?? null) })
        }
      />
      <p className="field__help">Minutes each + seconds added per move.</p>

      <div className="house-rules">
        <div className="house-rules__head">
          <h3 className="house-rules__title" id={headingId}>
            House rules
          </h3>
          {standard && <span className="tag">Standard</span>}
          <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={16} />} onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
        <ul className="house-rules__list" aria-labelledby={headingId}>
          {houseRulesSummary(settings).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title="House rules"
        description="Variants people play in different places. The standard rules suit most games."
        footer={
          <>
            <Button variant="ghost" icon={<RotateCcw size={16} />} disabled={standard} onClick={resetHouseRules}>
              Use standard rules
            </Button>
            <Button variant="primary" onClick={() => setEditing(false)} data-autofocus>
              Done
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <Segmented
            label="Crowning in the middle of a chain"
            wrap
            value={
              online
                ? settings.promotionPolicy
                : settings.promotionPolicy === 'match-opponent'
                  ? 'promote-and-continue'
                  : settings.promotionPolicy
            }
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
            Captures are optional, so a player who is behind could otherwise avoid them forever. These rules make sure every game
            ends.
          </p>
        </div>
      </Dialog>
    </div>
  )
}
