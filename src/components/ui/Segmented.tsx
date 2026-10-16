export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  hint?: string
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  label?: string
}

/** Small option row used throughout the settings and lobby screens. */
export default function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="dam-segmented">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            title={option.hint}
            className={`dam-segment ${option.value === value ? 'is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
