import { WifiOff } from 'lucide-react'
import Panel from '../ui/Panel'

/**
 * What a page that needs the server shows while the device is offline,
 * instead of a failed request's error. The page reloads its data by itself
 * when the connection comes back, so this says so.
 */
export default function OfflinePanel({ what, level = 2 }: { what: string; level?: 1 | 2 }) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <Panel as="section" aria-labelledby="offline-h" className="offline-panel">
      <Heading id="offline-h" className="panel__title">
        <WifiOff size={18} aria-hidden /> You are offline
      </Heading>
      <p className="panel__text" role="status">
        {what} needs a connection. It comes back by itself as soon as you are online again. Games against the computer, pass and
        play, puzzles and the analysis board all work offline.
      </p>
    </Panel>
  )
}
