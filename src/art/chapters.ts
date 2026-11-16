import calling from './chapters/calling.svg?raw'
import chains from './chapters/chains.svg?raw'
import endgame from './chapters/endgame.svg?raw'
import endings from './chapters/endings.svg?raw'
import kings from './chapters/kings.svg?raw'
import moving from './chapters/moving.svg?raw'
import opening from './chapters/opening.svg?raw'
import plans from './chapters/plans.svg?raw'
import sacrifices from './chapters/sacrifices.svg?raw'
import tempo from './chapters/tempo.svg?raw'
import traps from './chapters/traps.svg?raw'

/** One picture per tutorial chapter, by chapter id. Only the tutorial's chunk loads these. */
export const CHAPTER_ART: Record<string, string> = {
  moving,
  chains,
  kings,
  calling,
  opening,
  endings,
  tempo,
  sacrifices,
  traps,
  endgame,
  plans,
}
