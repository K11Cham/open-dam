import { TIME_CONTROLS, makeSettings } from '../game/settings'
import type { BoardSize, RuleSettings } from '../game/types'

/**
 * MOCK DATA. No elo maths, no queue, no server — these are placeholder pools so
 * the home page can show the shape of ranked play. Every rating here is made up.
 */

export type GameMode = 'classic' | 'blitz' | 'chain'

export interface RankedPool {
  id: string
  mode: GameMode
  modeLabel: string
  boardSize: BoardSize
  timeControlLabel: string
  /** Made-up figures for layout purposes only. */
  playersOnline: number
  averageRating: number
  settings: RuleSettings
}

const pool = (
  id: string,
  mode: GameMode,
  modeLabel: string,
  boardSize: BoardSize,
  timeControlLabel: string,
  playersOnline: number,
  averageRating: number,
  overrides: Partial<RuleSettings> = {},
): RankedPool => ({
  id,
  mode,
  modeLabel,
  boardSize,
  timeControlLabel,
  playersOnline,
  averageRating,
  settings: makeSettings({
    boardSize,
    timeControl: TIME_CONTROLS.find((tc) => tc.label === timeControlLabel) ?? null,
    ...overrides,
  }),
})

export const RANKED_POOLS: RankedPool[] = [
  pool('classic-5-10', 'classic', 'Classic', 5, '10+1', 412, 1180),
  pool('classic-7-10', 'classic', 'Classic', 7, '10+1', 168, 1245),
  pool('classic-9-30', 'classic', 'Classic', 9, '30+10', 54, 1390),
  pool('blitz-5-3', 'blitz', 'Blitz', 5, '3+0', 733, 1102),
  pool('blitz-6-3', 'blitz', 'Blitz', 6, '3+0', 291, 1134),
  pool('blitz-5-1', 'blitz', 'Blitz', 5, '1+0', 198, 1061),
  pool('chain-7-5', 'chain', 'Chain rules', 7, '5+0', 87, 1218, {
    promotionPolicy: 'promote-after-chain',
    call: { scope: 'all', abandonedChainCallable: true },
  }),
  pool('chain-9-10', 'chain', 'Chain rules', 9, '10+1', 41, 1302, {
    promotionPolicy: 'promote-after-chain',
    call: { scope: 'all', abandonedChainCallable: true },
  }),
]

export const MODE_BLURBS: Record<GameMode, string> = {
  classic: 'Default rules: crown and continue, call one piece, abandoned chains callable.',
  blitz: 'Same rules, short clocks. Calls get missed a lot down here.',
  chain: 'Crown after the chain, and a call takes every piece that could have captured.',
}

export const groupPoolsByMode = (): Array<{ mode: GameMode; label: string; pools: RankedPool[] }> => {
  const modes: GameMode[] = ['classic', 'blitz', 'chain']
  return modes.map((mode) => ({
    mode,
    label: RANKED_POOLS.find((p) => p.mode === mode)?.modeLabel ?? mode,
    pools: RANKED_POOLS.filter((p) => p.mode === mode),
  }))
}
