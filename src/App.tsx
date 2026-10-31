import { MotionConfig } from 'framer-motion'
import { Suspense, lazy, useEffect } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/ui/Toasts'
import { AccountProvider } from './context/AccountContext'
import { ThemeProvider } from './context/ThemeContext'
import HomePage from './pages/HomePage'
import MatchPage, { NewMatchFromLink } from './pages/MatchPage'
import NewGamePage from './pages/NewGamePage'
import NotFoundPage from './pages/NotFoundPage'
import { usePreferences } from './services/preferences'

// Pages most visits never open are loaded on demand, in their own chunks.
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const LeaderboardsPage = lazy(() => import('./pages/LeaderboardsPage'))
const OnlinePage = lazy(() => import('./pages/OnlinePage'))
const OnlineGamePage = lazy(() => import('./pages/ReviewPage').then((page) => ({ default: page.OnlineGamePage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const TutorialPage = lazy(() => import('./pages/TutorialPage'))

/** Shown for the moment a lazily loaded page takes to arrive. */
function PageLoading() {
  return (
    <p className="page-loading" role="status">
      Loading…
    </p>
  )
}

/** Older links used `/match?ai=...`; send them to the link handler with the same query. */
function LegacyMatchLink() {
  const { search } = useLocation()
  return <Navigate to={`/match/new${search}`} replace />
}

/** On navigation, start at the top of the page. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/**
 * Routes, without a router, so tests can mount them in a MemoryRouter.
 *
 *   /                 home
 *   /play             new game form
 *   /match/new?...    start a game from a link (quick play)
 *   /match/:id        a local game saved on this device
 *   /online/:id       an online game (host or guest)
 *   /review/:id       a finished game saved on this device, read-only
 *   /game/:id         a finished online game, from the server
 *   /learn[/:id]      rules and tutorial chapters
 *   /analysis         free board
 *   /leaderboards     rated players, by board size and clock
 *   /u/:username      a player's profile
 *   /settings         preferences, and the account
 *   /signin, /signup, /recover   accounts
 */
export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<NewGamePage />} />
          <Route path="/match" element={<LegacyMatchLink />} />
          <Route path="/match/new" element={<NewMatchFromLink />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/online/:id" element={<OnlinePage />} />
          <Route path="/review/:id" element={<ReviewPage />} />
          <Route path="/game/:id" element={<OnlineGamePage />} />
          <Route path="/learn" element={<TutorialPage />} />
          <Route path="/learn/:chapterId" element={<TutorialPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/leaderboards" element={<LeaderboardsPage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/signin" element={<AuthPage mode="signin" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/recover" element={<AuthPage mode="recover" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  )
}

/**
 * Motion follows the device's reduce-motion setting, or is always reduced if
 * the player chose that in Settings. framer-motion reads MotionConfig; CSS
 * animations read `data-motion` on <html> (base.css).
 */
function Motion({ children }: { children: ReactNode }) {
  const { motion } = usePreferences()
  useEffect(() => {
    document.documentElement.setAttribute('data-motion', motion)
  }, [motion])
  return <MotionConfig reducedMotion={motion === 'reduce' ? 'always' : 'user'}>{children}</MotionConfig>
}

/** App-wide providers: theme tokens, the account, motion preferences, and toasts. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AccountProvider>
        <Motion>
          <ToastProvider>{children}</ToastProvider>
        </Motion>
      </AccountProvider>
    </ThemeProvider>
  )
}

// A static copy on a host that cannot answer every path with index.html (an
// artifact preview, a plain file server) keeps the route after a # instead.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter

export default function App() {
  return (
    <AppProviders>
      <Router>
        <AppRoutes />
      </Router>
    </AppProviders>
  )
}
