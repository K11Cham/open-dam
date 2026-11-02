import { Share, SquarePlus } from 'lucide-react'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

/** Safari's way to install, which no button can do for the player. */
export default function InstallHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Install Open Dam"
      description="On an iPhone or iPad, Safari installs it in two taps."
      size="sm"
      footer={
        <Button variant="primary" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <ol className="install-steps">
        <li>
          <Share size={18} aria-hidden /> Tap <strong>Share</strong> in Safari's toolbar.
        </li>
        <li>
          <SquarePlus size={18} aria-hidden /> Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
        </li>
      </ol>
      <p className="field__help">It then opens from your home screen in a window of its own, and plays without a connection.</p>
    </Dialog>
  )
}
