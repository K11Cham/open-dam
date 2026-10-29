import { Volume2, VolumeX } from 'lucide-react'
import { useSound } from '../../context/useSound'
import { IconButton } from '../ui/Button'

/**
 * Sound effects on or off. A toggle button keeps one name ("Sound effects")
 * and reports its state with aria-pressed, so a screen reader says "Sound
 * effects, pressed" rather than a label that flips meaning.
 */
export default function SoundToggle() {
  const { enabled, setEnabled } = useSound()
  return (
    <IconButton
      label="Sound effects"
      aria-pressed={enabled}
      icon={enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      onClick={() => setEnabled(!enabled)}
    />
  )
}
