import { coordToNotation } from '../../game/notation'
import type { GameController } from '../../hooks/useGameLogic'

interface CallPickerProps {
  controller: GameController
}

/**
 * Only needed under `call.scope: 'choose-one'` with more than one offender —
 * the caller picks which piece to remove. With a single offender, or under
 * `'all'`, the call resolves without asking.
 */
export default function CallPicker({ controller }: CallPickerProps) {
  const { state, callPickerOpen } = controller
  if (!callPickerOpen || state.offenders.length === 0) return null
  const size = state.settings.boardSize

  return (
    <div className="dam-inline-prompt">
      <span>Call which piece?</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {state.offenders.map((offender) => (
          <button
            key={offender.pieceId}
            type="button"
            className="dam-button is-small"
            onClick={() => controller.call(offender.pieceId)}
          >
            {coordToNotation(offender.at.row, offender.at.col, size)}
            {offender.fromAbandonedChain ? ' (chain)' : ''}
          </button>
        ))}
        <button type="button" className="dam-button is-small" onClick={controller.closeCallPicker}>
          Cancel
        </button>
      </div>
    </div>
  )
}
