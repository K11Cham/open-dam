import { Download } from 'lucide-react'
import { useInstall } from '../../hooks/useInstall'
import { IconButton } from '../ui/Button'
import InstallHelp from './InstallHelp'

/** "Install the app" in the top bar, shown only where installing is possible and not done yet. */
export default function InstallButton() {
  const { available, install, helpOpen, closeHelp } = useInstall()
  if (!available && !helpOpen) return null
  return (
    <>
      <IconButton
        className="install-button"
        label="Install the app"
        icon={<Download size={18} />}
        onClick={() => void install()}
      />
      <InstallHelp open={helpOpen} onClose={closeHelp} />
    </>
  )
}
