import { useSyncExternalStore } from 'react'
import { getPwaState, subscribePwa } from '../pwa/pwa'
import type { PwaState } from '../pwa/pwa'

/** The installed-app state (src/pwa/pwa.ts): offline-ready, update waiting, installable, installed, online. */
export const usePwa = (): PwaState => useSyncExternalStore(subscribePwa, getPwaState, getPwaState)
