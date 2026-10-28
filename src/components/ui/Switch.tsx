import { useId } from 'react'

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
}

/** On/off toggle with a visible label and optional description, both announced. */
export default function Switch({ checked, onChange, label, description }: SwitchProps) {
  const descriptionId = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? descriptionId : undefined}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className={`switch__track ${checked ? 'is-on' : ''}`} aria-hidden>
        <span className="switch__thumb" />
      </span>
      <span className="switch__text">
        <span className="switch__label">{label}</span>
        {description && (
          <span id={descriptionId} className="switch__description">
            {description}
          </span>
        )}
      </span>
    </button>
  )
}
