import { MotionConfig } from 'framer-motion'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/ui/Toasts'
import { ThemeProvider } from './context/ThemeContext'
import AnalysisPage from './pages/AnalysisPage'
import HomePage from './pages/HomePage'
import LeaderboardsPage from './pages/LeaderboardsPage'
import MatchPage, { NewMatchFromLink } from './pages/MatchPage'
import NewGamePage from './pages/NewGamePage'
import NotFoundPage from './pages/NotFoundPage'
import OnlinePage from './pages/OnlinePage'
import ReviewPage from './pages/ReviewPage'
import TutorialPage from './pages/TutorialPage'

/** Older links used `/match?ai=...`; send them to the link handler with the same query. */
function LegacyMatchLink() {
  const { search } = useLocation()
  return <Navigate to={`/match/new${search}`} replace />
}

/** On navigation, start at the top of the page and move focus to the content. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/**
 * Providers and routes.
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
export default function App() {
  return (
    <ThemeProvider>
      {/* "user": follow the operating system's reduce-motion setting for every animation. */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <BrowserRouter>
            <ScrollToTop />
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
          </BrowserRouter>
        </ToastProvider>
      </MotionConfig>
    </ThemeProvider>
  )
}
