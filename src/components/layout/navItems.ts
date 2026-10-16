import { BookOpen, Crown, LineChart, Swords, Trophy } from 'lucide-react'

/**
 * One source of truth for navigation, used by both the top bar and the
 * slide-out. Every entry points at a real route — the old navbar had six items
 * all pointing at `#`.
 */
export const NAV_ITEMS = [
  { to: '/play', label: 'Play', icon: Swords },
  { to: '/analysis', label: 'Analysis', icon: LineChart },
  { to: '/learn', label: 'Learn', icon: BookOpen },
  { to: '/leaderboards', label: 'Leaderboards', icon: Trophy },
] as const

export const BRAND_ICON = Crown
