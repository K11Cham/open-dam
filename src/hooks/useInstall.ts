import { useState } from 'react'
import { isAppleMobile, promptInstall } from '../pwa/pwa'
import { usePwa } from './usePwa'

/**
 * Installing the app, wherever it is offered (the top bar, Home, Settings).
 * Chrome, Edge and Android open their own install dialog; it must follow a
 * tap, so nothing can open it on its own. iPhones and iPads have no dialog,
 * so `install` opens the Add to Home Screen steps instead.
 */
export function useInstall() {
  const { canInstall, installed } = usePwa()
  const apple = isAppleMobile()
  const [helpOpen, setHelpOpen] = useState(false)
  return {
    /** Whether installing can be offered here: the browser offered it, or Safari's steps apply. */
    available: !installed && (canInstall || apple),
    install: async (): Promise<boolean> => {
      if (canInstall) return promptInstall()
      setHelpOpen(true)
      return false
    },
    helpOpen,
    closeHelp: () => setHelpOpen(false),
  }
}
