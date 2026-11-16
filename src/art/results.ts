import draw from './results/draw.svg?raw'
import loss from './results/loss.svg?raw'
import win from './results/win.svg?raw'

/** The end-of-game summary's picture, by the result as the viewer sees it. */
export const RESULT_ART: Record<'win' | 'loss' | 'draw', string> = { win, loss, draw }
