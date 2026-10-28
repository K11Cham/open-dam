import { BookOpen, LineChart, Swords, Trophy } from 'lucide-react'

/** One source of truth for navigation, used by the top bar and the drawer. */
export const NAV_ITEMS = [
  { to: '/play', label: 'Play', icon: Swords },
  { to: '/learn', label: 'Learn', icon: BookOpen },
  { to: '/analysis', label: 'Analysis', icon: LineChart },
  { to: '/leaderboards', label: 'Leaderboards', icon: Trophy },
] as const
