import { TIME_CONTROLS, boardTypeForSize, makeSettings } from '../game/settings'
import type { BoardSize, PromotionPolicy, RuleSettings } from '../game/types'

/**
 * Rule settings <-> query string.
 *
 * Settings ride in the URL rather than router state so a refresh, a bookmark,
 * or a shared link all land on the same rule set. The match itself is resumed
 * separately from storage.
 */
export const settingsToParams = (settings: RuleSettings): URLSearchParams => {
  const params = new URLSearchParams()
  params.set('size', String(settings.boardSize))
  params.set('promo', settings.promotionPolicy)
  params.set('scope', settings.call.scope)
  params.set('chain', settings.call.abandonedChainCallable ? '1' : '0')
  params.set('three', settings.draw.threefoldRepetition ? '1' : '0')
  params.set('nocap', String(settings.draw.pliesWithoutCapture ?? 0))
  params.set('tc', settings.timeControl?.label ?? '')
  return params
}

const POLICIES: PromotionPolicy[] = [
  'promote-and-continue',
  'promote-after-chain',
  'end-turn-on-promotion',
  'match-opponent',
]

export const paramsToSettings = (params: URLSearchParams): RuleSettings => {
  const rawSize = Number(params.get('size'))
  const boardSize = ([5, 6, 7, 8, 9] as number[]).includes(rawSize)
    ? (rawSize as BoardSize)
    : 5

  const rawPolicy = params.get('promo')
  const promotionPolicy = POLICIES.includes(rawPolicy as PromotionPolicy)
    ? (rawPolicy as PromotionPolicy)
    : 'promote-and-continue'

  const noCap = Number(params.get('nocap'))
  const tcLabel = params.get('tc')

  return makeSettings({
    boardSize,
    boardType: boardTypeForSize(boardSize),
    promotionPolicy,
    call: {
      scope: params.get('scope') === 'all' ? 'all' : 'choose-one',
      abandonedChainCallable: params.get('chain') !== '0',
    },
    draw: {
      threefoldRepetition: params.get('three') !== '0',
      pliesWithoutCapture: Number.isFinite(noCap) && noCap > 0 ? noCap : null,
    },
    timeControl: tcLabel ? (TIME_CONTROLS.find((tc) => tc.label === tcLabel) ?? null) : null,
  })
}
