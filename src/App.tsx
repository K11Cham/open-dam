import { MotionConfig } from 'framer-motion'
import { Suspense, lazy, useEffect } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/ui/Toasts'
import { ThemeProvider } from './context/ThemeContext'
import HomePage from './pages/HomePage'
import MatchPage, { NewMatchFromLink } from './pages/MatchPage'
import NewGamePage from './pages/NewGamePage'
import NotFoundPage from './pages/NotFoundPage'

// Pages most visits never open are loaded on demand, in their own chunks.
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'))
const LeaderboardsPage = lazy(() => import('./pages/LeaderboardsPage'))
const OnlinePage = lazy(() => import('./pages/OnlinePage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
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
 *   /review/:id       a finished game, read-only
 *   /learn[/:id]      rules and tutorial chapters
 *   /analysis         free board
 *   /leaderboards     sample standings
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
          <Route path="/learn" element={<TutorialPage />} />
          <Route path="/learn/:chapterId" element={<TutorialPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/leaderboards" element={<LeaderboardsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  )
}

/** App-wide providers: theme tokens, motion preferences, and toasts. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {/* "user": follow the operating system's reduce-motion setting for every animation. */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </ThemeProvider>
  )
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  )
}
