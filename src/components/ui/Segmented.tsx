import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: ReactNode
  /** Extra text for screen readers and the tooltip. */
  hint?: string
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Visible group label. */
  label: string
  hideLabel?: boolean
  /** Lay options out as wrapping chips instead of a single joined bar. */
  wrap?: boolean
}

/**
 * A radio group drawn as a row of segments. Behaves like native radios: one
 * Tab stop, arrow keys move and select, Home/End jump to the ends.
 */
export function Segmented<T extends string | number>({ options, value, onChange, label, hideLabel, wrap }: SegmentedProps<T>) {
  const labelId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  const select = (index: number) => {
    const option = options[(index + options.length) % options.length]
    onChange(option.value)
    refs.current[(index + options.length) % options.length]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    if (event.key in keys) {
      event.preventDefault()
      select(index + keys[event.key])
    } else if (event.key === 'Home') {
      event.preventDefault()
      select(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      select(options.length - 1)
    }
  }

  return (
    <div className="field">
      <span id={labelId} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={`seg ${wrap ? 'seg--wrap' : ''}`}>
        {options.map((option, index) => {
          const checked = index === activeIndex
          return (
            <button
              key={String(option.value)}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              title={option.hint}
              className={`seg__option ${checked ? 'is-active' : ''}`}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Segmented
