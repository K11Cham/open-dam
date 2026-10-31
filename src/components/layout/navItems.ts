import { BookOpen, LineChart, Swords, Trophy } from 'lucide-react'

/** One source of truth for navigation, used by the top bar and the drawer. */
export const NAV_ITEMS = [
  { to: '/play', label: 'Play', icon: Swords },
  { to: '/learn', label: 'Learn', icon: BookOpen },
  { to: '/analysis', label: 'Analysis', icon: LineChart },
  { to: '/leaderboards', label: 'Leaderboards', icon: Trophy },
] as const

/** Where to come back to after signing in: the page the person was on, unless it was a sign-in page itself. */
export const nextAfterSignIn = (pathname: string, search: string) =>
  /^\/(signin|signup|recover)/.test(pathname) ? '/' : `${pathname}${search}`
