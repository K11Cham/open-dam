import { createContext } from 'react'
import type { PrivateUser } from '../net/account'

/**
 * - `unavailable`: this copy of the app has no account server (a static copy).
 * - `loading`: asking the server who is signed in.
 * - `signed-out` / `signed-in`: as it says. `offline` is set when the server
 *   could not be reached, so pages can say so rather than offer a sign-in that
 *   would fail.
 */
export type AccountStatus = 'unavailable' | 'loading' | 'signed-out' | 'signed-in'

export interface AccountContextValue {
  status: AccountStatus
  user: PrivateUser | null
  offline: boolean
  signIn(username: string, password: string): Promise<void>
  /** Returns the recovery code, which is shown once. */
  signUp(username: string, password: string, displayName: string): Promise<string>
  /** Sets a new password with the recovery code; returns the replacement code. */
  recover(username: string, recoveryCode: string, password: string): Promise<string>
  signOut(): Promise<void>
  /** The server sent a changed account (a new name, a new profile). */
  replaceUser(user: PrivateUser): void
  /** The account is gone (deleted): forget it here as signing out would. */
  forget(): void
}

export const AccountContext = createContext<AccountContextValue | null>(null)
