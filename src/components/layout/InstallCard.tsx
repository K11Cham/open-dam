import { useState } from 'react'
import { usePwa } from '../../hooks/usePwa'
import { useInstall } from '../../hooks/useInstall'
import { STORAGE_KEYS, storage } from '../../services/storage'
import { Button } from '../ui/Button'
import InstallHelp from './InstallHelp'

/** "Not now" keeps the card away this long; the top bar's button stays. */
const SNOOZE_MS = 3 * 24 * 60 * 60_000

const snoozed = () => Date.now() - (storage.get<number>(STORAGE_KEYS.installSnoozed) ?? 0) < SNOOZE_MS

/**
 * Offers to install the app as soon as Home opens, wherever installing is
 * possible. Browsers open their install dialog only after a tap, so this is
 * the one tap. Kept out of the way of the update card.
 */
export default function InstallCard() {
  const { updateReady } = usePwa()
  const { available, install, helpOpen, closeHelp } = useInstall()
  const [hidden, setHidden] = useState(snoozed)

  const notNow = () => {
    storage.set(STORAGE_KEYS.installSnoozed, Date.now())
    setHidden(true)
  }

  return (
    <>
      {available && !hidden && !updateReady && (
        <div className="corner-card install-card" role="region" aria-label="Install the app">
          <img className="install-card__icon" src="/icons/icon-192.png" alt="" width={44} height={44} />
          <p className="corner-card__text">
            <strong>Install Open Dam</strong> Play from your home screen in a window of its own, with or without a connection.
          </p>
          <div className="corner-card__actions">
            <Button size="sm" variant="primary" onClick={() => void install()}>
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={notNow}>
              Not now
            </Button>
          </div>
        </div>
      )}
      <InstallHelp open={helpOpen} onClose={closeHelp} />
    </>
  )
}
