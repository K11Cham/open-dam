import { Cloud, CloudOff, Download, LogOut, Monitor, Trash2 } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { soundPlayer, soundSettings } from '../audio/player'
import Avatar from '../components/account/Avatar'
import AppShell from '../components/layout/AppShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import Field from '../components/ui/Field'
import Panel from '../components/ui/Panel'
import Segmented from '../components/ui/Segmented'
import Switch from '../components/ui/Switch'
import { useToast } from '../components/ui/Toasts'
import { useAccount } from '../context/useAccount'
import { useSideNames, useTheme } from '../context/useTheme'
import { relativeTime } from '../lib/describe'
import { usePageTitle } from '../lib/usePageTitle'
import { clearArchiveHere } from '../match/storage'
import { AVATAR_COLOURS, BIO_MAX, DISPLAY_NAME_MAX, USERNAME_MAX, checkPassword, checkUsername } from '../net/account'
import type { AvatarColour, PrivateUser, SessionInfo } from '../net/account'
import * as api from '../net/accountApi'
import { accountSync } from '../net/accountSync'
import { preferences, usePreferences } from '../services/preferences'
import type { ThemeKey } from '../themes/types'
import { RecoveryCode } from './AuthPage'

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

function Section({ id, title, lede, children }: { id: string; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <Panel as="section" aria-labelledby={`${id}-h`} className="settings__section" id={id}>
      <header className="settings__head">
        <h2 id={`${id}-h`} className="panel__title">
          {title}
        </h2>
        {lede && <p className="panel__text">{lede}</p>}
      </header>
      {children}
    </Panel>
  )
}

/** A password box for confirming who you are before a change that matters. */
function PasswordField({
  label = 'Current password',
  value,
  onChange,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      {({ id, describedBy }) => (
        <input
          id={id}
          className="input"
          type="password"
          autoComplete="current-password"
          value={value}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  )
}

// -- Preferences: for everyone, signed in or not ---------------------------------------

function PreferencesSection({ signedIn }: { signedIn: boolean }) {
  const { themeKey, setTheme, availableThemes } = useTheme()
  const sound = useSyncExternalStore(soundSettings.subscribe, soundSettings.get, soundSettings.get)
  const prefs = usePreferences()
  const { theme } = useTheme()

  return (
    <Section
      id="preferences"
      title="Preferences"
      lede={
        signedIn
          ? 'Saved to your account, so every device you sign in on looks and plays the same.'
          : 'Saved on this device. Sign in to keep them on every device.'
      }
    >
      <div className="form-stack">
        <Segmented<ThemeKey>
          label="Theme"
          wrap
          value={themeKey}
          options={availableThemes.map((entry) => ({ value: entry.key, label: entry.name, hint: entry.blurb }))}
          onChange={setTheme}
        />
        <Switch
          checked={sound.enabled}
          onChange={(enabled) => {
            soundSettings.set({ ...sound, enabled })
            if (enabled) void soundPlayer.play(theme.sounds.move, sound.volume)
          }}
          label="Sound effects"
          description="Each theme has its own sounds for moves, captures and the end of a game."
        />
        <Field label={`Volume: ${Math.round(sound.volume * 100)}%`}>
          {({ id, describedBy }) => (
            <input
              id={id}
              className="range"
              type="range"
              min={0}
              max={100}
              step={5}
              disabled={!sound.enabled}
              value={Math.round(sound.volume * 100)}
              aria-describedby={describedBy}
              onChange={(event) => soundSettings.set({ ...sound, volume: Number(event.target.value) / 100 })}
              onPointerUp={() => void soundPlayer.play(theme.sounds.move, sound.volume)}
            />
          )}
        </Field>
        <Segmented<'system' | 'reduce'>
          label="Motion"
          value={prefs.motion}
          options={[
            { value: 'system', label: 'Follow this device', hint: 'Use the reduce-motion setting of your system' },
            { value: 'reduce', label: 'Reduce motion', hint: 'Keep animation to a minimum everywhere' },
          ]}
          onChange={(motion) => preferences.set({ motion })}
        />
        <Switch
          checked={prefs.moveHints}
          onChange={(moveHints) => preferences.set({ moveHints })}
          label="Show where a piece can go"
          description="Marks the squares a selected piece can move or capture to."
        />
        <Switch
          checked={prefs.premoves}
          onChange={(premoves) => preferences.set({ premoves })}
          label="Premoves"
          description="Against the computer or online, choose your next move while the other side thinks. It plays when your turn comes, if it is still legal."
        />
        <Switch
          checked={prefs.resultSplash}
          onChange={(resultSplash) => preferences.set({ resultSplash })}
          label="Result banner"
          description="Play the win, loss or draw banner when a game ends, before the summary."
        />
        <p className="field__help">
          The board size, clock and house rules you last chose are remembered on the <Link to="/play">New game</Link> page.
        </p>
      </div>
    </Section>
  )
}

// -- Profile -----------------------------------------------------------------------------

function ProfileSection({ user }: { user: PrivateUser }) {
  const account = useAccount()
  const toast = useToast()
  const sideNames = useSideNames()
  const [displayName, setDisplayName] = useState(user.displayName)
  const [bio, setBio] = useState(user.bio)
  const [avatar, setAvatar] = useState<AvatarColour>(user.avatar)
  const [showGames, setShowGames] = useState(user.showGames)
  const [busy, setBusy] = useState(false)
  const changed = displayName !== user.displayName || bio !== user.bio || avatar !== user.avatar || showGames !== user.showGames

  const colourName: Record<AvatarColour, string> = {
    p1: `${sideNames.player1} piece`,
    p2: `${sideNames.player2} piece`,
    accent: 'Accent',
    highlight: 'Highlight',
    ink: 'Ink',
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      account.replaceUser(await api.updateProfile({ displayName, bio, avatar, showGames }))
      toast.show('Profile saved.', 'success')
    } catch (error) {
      toast.show(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      id="profile"
      title="Profile"
      lede={
        <>
          What other players see on <Link to={`/u/${user.username}`}>your profile</Link> and beside the board.
        </>
      }
    >
      <form className="form-stack" onSubmit={(event) => void save(event)}>
        <div className="settings__identity">
          <Avatar name={displayName || user.username} colour={avatar} size="lg" />
          <div>
            <p className="settings__name">{displayName || user.username}</p>
            <p className="field__help settings__handle">@{user.username}</p>
          </div>
        </div>
        <Field label="Display name" help={`Up to ${DISPLAY_NAME_MAX} characters.`}>
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              maxLength={DISPLAY_NAME_MAX}
              value={displayName}
              aria-describedby={describedBy}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}
        </Field>
        <Field label="About you" help={`${bio.length} of ${BIO_MAX} characters.`}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              className="input settings__bio"
              rows={3}
              maxLength={BIO_MAX}
              value={bio}
              aria-describedby={describedBy}
              onChange={(event) => setBio(event.target.value)}
            />
          )}
        </Field>
        <Segmented<AvatarColour>
          label="Colour"
          wrap
          value={avatar}
          options={AVATAR_COLOURS.map((colour) => ({
            value: colour,
            label: (
              <span className="settings__swatch">
                <span className={`avatar avatar--${colour} avatar--dot`} aria-hidden />
                {colourName[colour]}
              </span>
            ),
          }))}
          onChange={setAvatar}
        />
        <Switch
          checked={showGames}
          onChange={setShowGames}
          label="Show my games on my profile"
          description="Your ratings are always public; this decides whether others can see the list of games behind them."
        />
        <div className="panel__actions">
          <Button type="submit" variant="primary" disabled={!changed || busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </Section>
  )
}

// -- Sign-in details ------------------------------------------------------------------------

function SecuritySection({ user }: { user: PrivateUser }) {
  const account = useAccount()
  const toast = useToast()
  const [form, setForm] = useState<'password' | 'username' | 'code' | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [newName, setNewName] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = (which: typeof form) => {
    setForm(which)
    setCurrent('')
    setNext('')
    setRepeat('')
    setNewName('')
    setError(null)
  }

  /** Submit one of the forms below: the page stays, and a refusal is shown in the form. */
  const run = (event: FormEvent, task: () => Promise<void>) => {
    event.preventDefault()
    void attempt(task)
  }
  const attempt = async (task: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await task()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async () => {
    const problem = checkPassword(next) ?? (next !== repeat ? 'The new passwords do not match.' : null)
    if (problem) throw new Error(problem)
    await api.changePassword(user.username, current, next)
    toast.show('Password changed. Other devices are signed out.', 'success')
    setForm(null)
  }

  return (
    <Section id="security" title="Sign-in" lede="Your username, password and recovery code.">
      <dl className="settings__facts">
        <div>
          <dt>Username</dt>
          <dd>@{user.username}</dd>
        </div>
        <div>
          <dt>Member since</dt>
          <dd>{new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</dd>
        </div>
      </dl>
      <div className="panel__actions">
        <Button size="sm" onClick={() => open('password')}>
          Change password
        </Button>
        <Button size="sm" onClick={() => open('username')}>
          Change username
        </Button>
        <Button size="sm" onClick={() => open('code')}>
          New recovery code
        </Button>
      </div>

      <Dialog
        open={form === 'password'}
        onClose={() => setForm(null)}
        title="Change your password"
        description="Every other device is signed out afterwards."
      >
        <form className="form-stack" onSubmit={(event) => run(event, changePassword)}>
          <PasswordField value={current} onChange={setCurrent} />
          <Field label="New password" help="At least 8 characters.">
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input"
                type="password"
                autoComplete="new-password"
                value={next}
                aria-describedby={describedBy}
                onChange={(e) => setNext(e.target.value)}
              />
            )}
          </Field>
          <Field label="Repeat the new password">
            {({ id }) => (
              <input
                id={id}
                className="input"
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            )}
          </Field>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <div className="panel__actions">
            <Button type="submit" variant="primary" disabled={busy || !current || !next}>
              {busy ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={form === 'username'}
        onClose={() => setForm(null)}
        title="Change your username"
        description="Your profile link changes with it. Your ratings and games stay yours."
      >
        <form
          className="form-stack"
          onSubmit={(event) =>
            run(event, async () => {
              const problem = checkUsername(newName)
              if (problem) throw new Error(problem)
              account.replaceUser(await api.changeUsername(user.username, current, newName.trim()))
              toast.show('Username changed.', 'success')
              setForm(null)
            })
          }
        >
          <Field label="New username" help={`3 to ${USERNAME_MAX} letters, digits, - or _.`}>
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input"
                autoCapitalize="none"
                spellCheck={false}
                value={newName}
                aria-describedby={describedBy}
                onChange={(e) => setNewName(e.target.value)}
              />
            )}
          </Field>
          <PasswordField value={current} onChange={setCurrent} />
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <div className="panel__actions">
            <Button type="submit" variant="primary" disabled={busy || !current || !newName}>
              {busy ? 'Changing…' : 'Change username'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={form === 'code'}
        onClose={() => {
          setForm(null)
          setCode(null)
        }}
        title={code ? 'Your new recovery code' : 'Make a new recovery code'}
        description={code ? undefined : 'Your old code stops working.'}
      >
        {code ? (
          <RecoveryCode
            code={code}
            doneLabel="Done"
            onDone={() => {
              setForm(null)
              setCode(null)
            }}
          />
        ) : (
          <form
            className="form-stack"
            onSubmit={(event) =>
              run(event, async () => {
                setCode(await api.newRecoveryCode(user.username, current))
              })
            }
          >
            <PasswordField value={current} onChange={setCurrent} />
            {error && (
              <p className="field__error" role="alert">
                {error}
              </p>
            )}
            <div className="panel__actions">
              <Button type="submit" variant="primary" disabled={busy || !current}>
                {busy ? 'Making…' : 'Make a new code'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </Section>
  )
}

// -- Devices ---------------------------------------------------------------------------------

function DevicesSection() {
  const toast = useToast()
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    api
      .fetchSessions()
      .then((list) => live && setSessions(list))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  const revoke = async (id: string) => {
    try {
      await api.revokeSession(id)
      setSessions((list) => list?.filter((s) => s.id !== id) ?? null)
      toast.show('That device is signed out.', 'success')
    } catch (error) {
      toast.show(errorText(error), 'error')
    }
  }

  const revokeOthers = async () => {
    try {
      await api.revokeOtherSessions()
      setSessions((list) => list?.filter((s) => s.current) ?? null)
      toast.show('Every other device is signed out.', 'success')
    } catch (error) {
      toast.show(errorText(error), 'error')
    }
  }

  return (
    <Section id="devices" title="Devices" lede="Where you are signed in. A device you do not recognise can be signed out here.">
      {failed && <p className="panel__text">The list of devices could not be loaded.</p>}
      {sessions === null && !failed && <p className="panel__text">Loading…</p>}
      {sessions && (
        <ul className="devices" role="list">
          {sessions.map((session) => (
            <li key={session.id} className="devices__item">
              <Monitor size={18} aria-hidden />
              <span className="devices__text">
                <span className="devices__name">
                  {session.device}
                  {session.current && <span className="tag tag--turn">This device</span>}
                </span>
                <span className="field__help">
                  Signed in {relativeTime(session.createdAt)} · last used {relativeTime(session.lastSeenAt)}
                </span>
              </span>
              {!session.current && (
                <Button size="sm" variant="ghost" icon={<LogOut size={15} />} onClick={() => void revoke(session.id)}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sessions && sessions.length > 1 && (
        <div className="panel__actions">
          <Button size="sm" onClick={() => void revokeOthers()}>
            Sign out every other device
          </Button>
        </div>
      )}
    </Section>
  )
}

// -- Data ----------------------------------------------------------------------------------------

function DataSection({ user }: { user: PrivateUser }) {
  const account = useAccount()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirmClear, setConfirmClear] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    try {
      const text = await api.exportData()
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `open-dam-${user.username}.json`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      toast.show(errorText(failure), 'error')
    }
  }

  const clearHistory = async () => {
    setConfirmClear(false)
    try {
      await api.clearArchive()
      clearArchiveHere()
      toast.show('Your game history is cleared.', 'success')
    } catch (failure) {
      toast.show(errorText(failure), 'error')
    }
  }

  const remove = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.deleteAccount(user.username, password)
      account.forget()
      toast.show('Your account is deleted.', 'success')
      navigate('/')
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }

  return (
    <Section
      id="data"
      title="Your data"
      lede="What the server keeps for you: your profile, ratings, settings, games and signed-in devices."
    >
      <div className="panel__actions">
        <Button size="sm" icon={<Download size={15} />} onClick={() => void download()}>
          Download my data
        </Button>
        <Button size="sm" icon={<Trash2 size={15} />} onClick={() => setConfirmClear(true)}>
          Clear game history
        </Button>
      </div>
      <div className="settings__danger">
        <p className="panel__text">
          Deleting your account removes your profile, ratings, settings and history for good. Your opponents keep their record of
          games against you, shown as a deleted player.
        </p>
        <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
          Delete my account
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear your game history?"
        description="Finished games against the computer and on this device are removed here and from your account. Online games stay in your profile, since your opponents played them too."
        confirmLabel="Clear history"
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => void clearHistory()}
      />

      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete your account?"
        description="This cannot be undone. Enter your password to confirm."
      >
        <form className="form-stack" onSubmit={(event) => void remove(event)}>
          <PasswordField label="Password" value={password} onChange={setPassword} />
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <div className="panel__actions">
            <Button type="submit" variant="danger" disabled={busy || !password}>
              {busy ? 'Deleting…' : 'Delete my account'}
            </Button>
          </div>
        </form>
      </Dialog>
    </Section>
  )
}

function SyncBadge() {
  const status = useSyncExternalStore(accountSync.subscribe, accountSync.getStatus, accountSync.getStatus)
  if (status.state === 'error') {
    return (
      <span className="tag settings__sync">
        <CloudOff size={13} aria-hidden /> Not in step: will retry
      </span>
    )
  }
  return (
    <span className="tag tag--live settings__sync">
      <Cloud size={13} aria-hidden /> {status.state === 'syncing' ? 'Saving to your account…' : 'In step with your account'}
    </span>
  )
}

/**
 * `/settings`: preferences for everyone; profile, sign-in details, devices and
 * data for a signed-in player.
 */
export default function SettingsPage() {
  usePageTitle('Settings')
  const account = useAccount()
  const { user } = account
  const sections = user
    ? [
        ['profile', 'Profile'],
        ['preferences', 'Preferences'],
        ['security', 'Sign-in'],
        ['devices', 'Devices'],
        ['data', 'Your data'],
      ]
    : [['preferences', 'Preferences']]

  return (
    <AppShell>
      <div className="page settings">
        <header className="page-head">
          <p className="eyebrow">{user ? `@${user.username}` : 'This device'}</p>
          <h1 className="page-title">Settings</h1>
          {user && <SyncBadge />}
        </header>

        {sections.length > 1 && (
          <nav className="settings__nav" aria-label="Settings sections">
            {sections.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="settings__navlink">
                {label}
              </a>
            ))}
          </nav>
        )}

        {account.status === 'signed-out' && (
          <Panel as="section" aria-labelledby="signin-h" className="settings__signin">
            <h2 id="signin-h" className="panel__title">
              Keep your settings everywhere
            </h2>
            <p className="panel__text">
              With an account, your preferences, solved puzzles and finished games follow you to every device, and online games
              count toward a rating.
            </p>
            <div className="panel__actions">
              <ButtonLink to="/signup?next=%2Fsettings" variant="primary">
                Create an account
              </ButtonLink>
              <ButtonLink to="/signin?next=%2Fsettings">Sign in</ButtonLink>
            </div>
          </Panel>
        )}

        {user && <ProfileSection key={`${user.id}-${user.displayName}-${user.avatar}`} user={user} />}
        <PreferencesSection signedIn={!!user} />
        {user && <SecuritySection user={user} />}
        {user && <DevicesSection />}
        {user && <DataSection user={user} />}
      </div>
    </AppShell>
  )
}
