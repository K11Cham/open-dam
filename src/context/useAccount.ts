import { useContext } from 'react'
import { AccountContext } from './accountContextObject'
import type { AccountContextValue } from './accountContextObject'

/** The signed-in account and the ways to sign in and out. */
export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext)
  if (!value) throw new Error('useAccount needs an <AccountProvider> above it.')
  return value
}
