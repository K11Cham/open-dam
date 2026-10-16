/**
 * Tutorial table of contents.
 *
 * Only chapter 1 has content. The rest are titled placeholders on purpose —
 * writing the full curriculum is deferred, and a titled-but-empty entry is
 * more honest than a stub chapter that reads like it was finished.
 */
export interface ChapterMeta {
  id: number
  title: string
  summary: string
  available: boolean
}

export const CHAPTERS: ChapterMeta[] = [
  {
    id: 1,
    title: 'Moving and capturing',
    summary: 'How pieces travel, and how a capture works.',
    available: true,
  },
  { id: 2, title: 'Chain captures', summary: 'Taking more than one piece in a turn.', available: false },
  { id: 3, title: 'Kings', summary: 'Crowning, long-range movement, and choosing a landing square.', available: false },
  { id: 4, title: 'Calling', summary: 'Punishing a capture your opponent passed up.', available: false },
  { id: 5, title: 'The yin/yang opening', summary: 'The first move on odd boards.', available: false },
  { id: 6, title: 'Endgames', summary: 'Auto-kings, ties, and the shuffle rules.', available: false },
  { id: 7, title: 'Tempo and shape', summary: 'Why a wall of pieces is not always strong.', available: false },
  { id: 8, title: 'Sacrifices', summary: 'Giving material to force a chain.', available: false },
]
