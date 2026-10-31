import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PrivateUser } from '../net/account'
import * as api from '../net/accountApi'
import { accountSync } from '../net/accountSync'
import { AccountContext } from './accountContextObject'
import type { AccountContextValue, AccountStatus } from './accountContextObject'

/**
 * Who is signed in, for the whole app. On load it asks the server (the
 * session cookie says, and only the server can read it); signing in or up
 * starts keeping settings and history in step (src/net/accountSync.ts), and
 * signing out stops it.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const available = api.accountsAvailable()
  const [status, setStatus] = useState<AccountStatus>(available ? 'loading' : 'unavailable')
  const [user, setUser] = useState<PrivateUser | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (!available) return
    let live = true
    api
      .fetchMe()
      .then((me) => {
        if (!live) return
        setUser(me)
        setStatus(me ? 'signed-in' : 'signed-out')
        if (me) void accountSync.start()
      })
      .catch(() => {
        if (!live) return
        setOffline(true)
        setStatus('signed-out')
      })
    return () => {
      live = false
    }
  }, [available])

  const value = useMemo<AccountContextValue>(() => {
    const enter = (next: PrivateUser) => {
      setUser(next)
      setStatus('signed-in')
      setOffline(false)
      void accountSync.start()
    }
    const leave = () => {
      accountSync.stop()
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
      replaceUser: setUser,
      forget: leave,
    }
  }, [status, user, offline])

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
