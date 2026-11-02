import { RefreshCw, WifiOff } from 'lucide-react'
import { usePwa } from '../../hooks/usePwa'
import { applyUpdate, dismissUpdate } from '../../pwa/pwa'
import { Button } from '../ui/Button'

/**
 * Notices about the app itself, under the top bar on every page: that the
 * device is offline (and what still works), and that a new version is ready.
 * The update waits for the player, so a game is never reloaded unasked.
 */
export default function AppNotices() {
  const { online, updateReady } = usePwa()
  return (
    <>
      {!online && (
        <p className="app-notice app-notice--offline" role="status">
          <WifiOff size={16} aria-hidden />
          <span>
            <strong>You are offline.</strong> Games against the computer or a friend on this device, lessons, puzzles and the
            analysis board all still work. Online games, accounts and leaderboards come back with the connection.
          </span>
        </p>
      )}
      {updateReady && (
        <div className="corner-card" role="status">
          <RefreshCw size={18} aria-hidden />
          <p className="corner-card__text">
            <strong>A new version of Open Dam is ready.</strong> Reloading takes a second; a game in progress is kept.
          </p>
          <div className="corner-card__actions">
            <Button size="sm" variant="primary" onClick={applyUpdate}>
              Update now
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissUpdate}>
              Later
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
