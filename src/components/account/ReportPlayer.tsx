import { Flag } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { reportPlayer } from '../../net/accountApi'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toasts'

const MAX_REASON = 500

/**
 * "Report" on someone else's profile: a short reason, sent to the owner's
 * list of reports (worker/admin.ts). Only signed-in players can report, and
 * a network may send ten an hour.
 */
export default function ReportPlayer({ username, displayName }: { username: string; displayName: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (reason.trim() === '') {
      setError('Say briefly what is wrong.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await reportPlayer(username, reason.trim())
      setOpen(false)
      setReason('')
      toast.show('Thank you. The report has been sent.', 'success')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not send the report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" icon={<Flag size={15} />} onClick={() => setOpen(true)} className="profile__report">
        Report
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Report ${displayName}`}
        description="For a name, bio or behaviour that breaks the terms. The site's owner reads every report."
      >
        <form className="form-stack" onSubmit={(event) => void submit(event)} noValidate>
          <label className="field">
            <span className="field__label">What is wrong?</span>
            <textarea
              className="input"
              rows={4}
              maxLength={MAX_REASON}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              data-autofocus
            />
          </label>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <div className="panel__actions">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
