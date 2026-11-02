import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PrivateUser } from '../net/account'
import * as api from '../net/accountApi'
import { accountSync } from '../net/accountSync'
import { STORAGE_KEYS, storage } from '../services/storage'
import { AccountContext } from './accountContextObject'
import type { AccountContextValue, AccountStatus } from './accountContextObject'

/** The account as last heard from the server. */
const remembered = (): PrivateUser | null => storage.get<PrivateUser>(STORAGE_KEYS.account)

/**
 * Who is signed in, for the whole app. On load it asks the server (the
 * session cookie says, and only the server can read it); signing in or up
 * starts keeping settings and history in step (src/net/accountSync.ts), and
 * signing out stops it.
 *
 * Without a network the app still opens signed in, as the account it last
 * heard about, with `offline` set; when the connection comes back it asks
 * again and catches the account up with anything changed meanwhile.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const available = api.accountsAvailable()
  const [status, setStatus] = useState<AccountStatus>(available ? 'loading' : 'unavailable')
  const [user, setUser] = useState<PrivateUser | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (!available) return
    let live = true
    const check = () =>
      api
        .fetchMe()
        .then((me) => {
          if (!live) return
          setOffline(false)
          setUser(me)
          setStatus(me ? 'signed-in' : 'signed-out')
          if (me) {
            storage.set(STORAGE_KEYS.account, me)
            void accountSync.start()
          } else if (remembered()) {
            // Signed out from another device, or the session ran out while away.
            accountSync.stop()
            storage.remove(STORAGE_KEYS.account)
          }
        })
        .catch(() => {
          if (!live) return
          setOffline(true)
          const last = remembered()
          setUser(last)
          setStatus(last ? 'signed-in' : 'signed-out')
        })
    void check()
    window.addEventListener('online', check)
    return () => {
      live = false
      window.removeEventListener('online', check)
    }
  }, [available])

  const value = useMemo<AccountContextValue>(() => {
    const enter = (next: PrivateUser) => {
      setUser(next)
      storage.set(STORAGE_KEYS.account, next)
      setStatus('signed-in')
      setOffline(false)
      void accountSync.start()
    }
    const leave = () => {
      accountSync.stop()
      storage.remove(STORAGE_KEYS.account)
      setUser(null)
      setStatus('signed-out')
    }
    return {
      status,
      user,
      offline,
      signIn: async (username, password) => enter(await api.signIn(username, password)),
      signUp: async (username, password, displayName) => {
        const result = await api.signUp(username, password, displayName)
        enter(result.user)
        return result.recoveryCode
      },
      recover: async (username, recoveryCode, password) => {
        const result = await api.recover(username, recoveryCode, password)
        enter(result.user)
        return result.recoveryCode
      },
      signOut: async () => {
        await accountSync.drain()
        try {
          await api.signOut()
        } finally {
          leave()
        }
      },
      replaceUser: (next) => {
        setUser(next)
        storage.set(STORAGE_KEYS.account, next)
      },
      forget: leave,
    }
  }, [status, user, offline])

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
