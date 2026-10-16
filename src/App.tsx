import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import AnalysisPage from './pages/AnalysisPage'
import HomePage from './pages/HomePage'
import LeaderboardsPage from './pages/LeaderboardsPage'
import MatchPage from './pages/MatchPage'
import NewGamePage from './pages/NewGamePage'
import TutorialPage from './pages/TutorialPage'

/**
 * Routes. Every navigation target in the UI resolves to one of these — the
 * previous navbar had six links all pointing at `#`.
 *
 * Match settings ride in the query string (`/match?size=7&tc=5%2B0&...`) so a
 * refresh keeps the same rule set. There is no longer a `/game/:size/...` route
 * shape, because rules are now richer than three path segments could carry.
 */
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<NewGamePage />} />
          <Route path="/match" element={<MatchPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/leaderboards" element={<LeaderboardsPage />} />
          <Route path="/learn" element={<TutorialPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
