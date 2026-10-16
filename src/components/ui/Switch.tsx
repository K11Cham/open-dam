interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
}

/** Accessible toggle for the subjective rule settings. */
export default function Switch({ checked, onChange, label, description }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="dam-switch"
      onClick={() => onChange(!checked)}
    >
      <span className={`dam-switch-track ${checked ? 'is-on' : ''}`}>
        <span className="dam-switch-thumb" />
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{label}</span>
        {description && (
          <span style={{ display: 'block', fontSize: 12, color: 'var(--dam-ink-muted)', marginTop: 2 }}>
            {description}
          </span>
        )}
      </span>
    </button>
  )
}
