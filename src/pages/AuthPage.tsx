import { Check, Copy, KeyRound, LogIn, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import { Button } from '../components/ui/Button'
import Field from '../components/ui/Field'
import Panel from '../components/ui/Panel'
import { useToast } from '../components/ui/Toasts'
import { useAccount } from '../context/useAccount'
import { usePageTitle } from '../lib/usePageTitle'
import { DISPLAY_NAME_MAX, PASSWORD_MIN, USERNAME_MAX, checkPassword, checkUsername } from '../net/account'
import { usernameProblem } from '../net/accountApi'

export type AuthMode = 'signin' | 'signup' | 'recover'

/** Only paths inside the app are followed after signing in, so a link cannot send someone elsewhere. */
const safeNext = (next: string | null): string => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/')

/** The recovery code, shown once, with a way to copy it. Nothing continues until the person says it is kept. */
export function RecoveryCode({
  code,
  onDone,
  doneLabel = 'I have saved it',
}: {
  code: string
  onDone: () => void
  doneLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="recovery">
      <p className="panel__text">
        If you forget your password, this code lets you set a new one. It is shown only now. Keep it somewhere safe, such as a
        password manager. Each code works once, and you get a new one when you use it.
      </p>
      <output className="recovery__code" aria-label="Recovery code">
        {code}
      </output>
      <div className="panel__actions">
        <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        <Button variant="primary" onClick={onDone} data-autofocus>
          {doneLabel}
        </Button>
      </div>
    </div>
  )
}

function useUsernameCheck(name: string, enabled: boolean) {
  const [checked, setChecked] = useState<{ name: string; problem: string | null } | null>(null)
  useEffect(() => {
    if (!enabled || checkUsername(name) !== null) return
    // Ask once typing pauses, not for every letter.
    const handle = window.setTimeout(() => {
      usernameProblem(name.trim())
        .then((problem) => setChecked({ name, problem }))
        .catch(() => setChecked(null))
    }, 400)
    return () => window.clearTimeout(handle)
  }, [name, enabled])
  return checked && checked.name === name ? checked.problem : null
}

/**
 * `/signin`, `/signup` and `/recover`: one page with three forms, since they
 * share their fields. Signing in or up returns to `?next=`, the page the
 * person was on. A new account is shown its recovery code before moving on.
 */
export default function AuthPage({ mode }: { mode: AuthMode }) {
  const account = useAccount()
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const nextQuery = params.get('next') ? `?next=${encodeURIComponent(next)}` : ''
  usePageTitle(mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create an account' : 'Reset your password')

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)
  const taken = useUsernameCheck(username, mode === 'signup')

  if (account.status === 'unavailable') {
    return (
      <AppShell>
        <div className="page page--narrow">
          <Panel as="section" aria-labelledby="auth-h">
            <h1 id="auth-h" className="panel__title">
              Accounts are not available here
            </h1>
            <p className="panel__text">This copy of Open Dam has no account server. Open the game from its website to sign in.</p>
          </Panel>
        </div>
      </AppShell>
    )
  }

  // Already signed in (and not looking at a new recovery code): there is nothing to do here.
  if (account.user && !newCode) return <Navigate to={next} replace />

  const usernameError = mode === 'signin' ? null : ((touched || username.length >= 3 ? checkUsername(username) : null) ?? taken)
  const passwordError = mode === 'signin' ? null : touched && password ? checkPassword(password) : null
  const confirmError = mode !== 'signin' && touched && confirm && confirm !== password ? 'The passwords do not match.' : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    setError(null)
    if (mode !== 'signin') {
      const problem = (mode === 'signup' ? checkUsername(username) : null) ?? checkPassword(password)
      if (problem || confirm !== password) {
        setError(problem ?? 'The passwords do not match.')
        return
      }
    }
    if (!username.trim() || !password || (mode === 'recover' && !code.trim())) {
      setError(
        mode === 'recover' ? 'Enter your username, recovery code and a new password.' : 'Enter your username and password.',
      )
      return
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        await account.signIn(username.trim(), password)
        toast.show('Signed in.', 'success')
        navigate(next, { replace: true })
      } else if (mode === 'signup') {
        setNewCode(await account.signUp(username.trim(), password, displayName.trim()))
      } else {
        setNewCode(await account.recover(username.trim(), code, password))
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (newCode) {
    return (
      <AppShell>
        <div className="page page--narrow">
          <Panel as="section" aria-labelledby="code-h">
            <h1 id="code-h" className="panel__title">
              {mode === 'signup' ? `Welcome, ${account.user?.displayName ?? username}` : 'Your password is reset'}
            </h1>
            <RecoveryCode code={newCode} onDone={() => navigate(next, { replace: true })} />
          </Panel>
        </div>
      </AppShell>
    )
  }

  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create an account' : 'Reset your password'
  const lede =
    mode === 'signin'
      ? 'Your ratings, games and settings follow you to any device.'
      : mode === 'signup'
        ? 'An account keeps your rating, your games and your settings, on every device. Only a username and a password are needed.'
        : 'Use the recovery code you were given when you made your account.'

  return (
    <AppShell>
      <div className="page page--narrow">
        <Panel as="section" aria-labelledby="auth-h" className="auth">
          <header className="auth__head">
            <h1 id="auth-h" className="panel__title auth__title">
              {mode === 'signin' ? (
                <LogIn size={20} aria-hidden />
              ) : mode === 'signup' ? (
                <UserPlus size={20} aria-hidden />
              ) : (
                <KeyRound size={20} aria-hidden />
              )}
              {title}
            </h1>
            <p className="panel__text">{lede}</p>
          </header>

          {account.offline && (
            <p className="notice" role="status">
              The server cannot be reached right now, so signing in may fail. Games on this device still work.
            </p>
          )}

          <form className="form-stack" onSubmit={(event) => void submit(event)} noValidate>
            <Field
              label="Username"
              help={mode === 'signup' ? `3 to ${USERNAME_MAX} letters, digits, - or _. It is in your profile link.` : undefined}
              error={usernameError}
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  className="input"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={USERNAME_MAX + 8}
                  value={username}
                  aria-invalid={!!usernameError}
                  aria-describedby={describedBy}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              )}
            </Field>

            {mode === 'signup' && (
              <Field
                label="Display name (optional)"
                help="Shown beside the board and on leaderboards. You can change it any time."
              >
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    className="input"
                    name="nickname"
                    autoComplete="nickname"
                    maxLength={DISPLAY_NAME_MAX}
                    value={displayName}
                    placeholder={username || undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                )}
              </Field>
            )}

            {mode === 'recover' && (
              <Field label="Recovery code" help="Four groups of five letters and digits. Spaces and dashes do not matter.">
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    className="input input--code"
                    name="recovery-code"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={code}
                    aria-describedby={describedBy}
                    onChange={(event) => setCode(event.target.value)}
                    required
                  />
                )}
              </Field>
            )}

            <Field
              label={mode === 'recover' ? 'New password' : 'Password'}
              help={
                mode === 'signin' ? undefined : `At least ${PASSWORD_MIN} characters. A few unrelated words make a strong one.`
              }
              error={passwordError}
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  className="input"
                  type="password"
                  name="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  aria-invalid={!!passwordError}
                  aria-describedby={describedBy}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              )}
            </Field>

            {mode !== 'signin' && (
              <Field label="Repeat the password" error={confirmError}>
                {({ id, describedBy }) => (
                  <input
                    id={id}
                    className="input"
                    type="password"
                    name="password-again"
                    autoComplete="new-password"
                    value={confirm}
                    aria-invalid={!!confirmError}
                    aria-describedby={describedBy}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                  />
                )}
              </Field>
            )}

            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" block disabled={busy}>
              {busy
                ? mode === 'signin'
                  ? 'Signing in…'
                  : mode === 'signup'
                    ? 'Creating your account…'
                    : 'Resetting…'
                : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Set the new password'}
            </Button>
          </form>

          <nav className="auth__links" aria-label="Other ways in">
            {mode !== 'signin' && <Link to={`/signin${nextQuery}`}>I have an account: sign in</Link>}
            {mode !== 'signup' && <Link to={`/signup${nextQuery}`}>New here? Create an account</Link>}
            {mode === 'signin' && <Link to={`/recover${nextQuery}`}>Forgot your password?</Link>}
          </nav>
        </Panel>
      </div>
    </AppShell>
  )
}
