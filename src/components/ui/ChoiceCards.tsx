import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface Choice<T extends string> {
  value: T
  title: ReactNode
  /** A quiet word beside the title, e.g. what a name means. */
  note?: ReactNode
  description?: ReactNode
  /** Small text in the corner, e.g. a rating. */
  badge?: ReactNode
  icon?: ReactNode
}

interface ChoiceCardsProps<T extends string> {
  label: string
  choices: Choice<T>[]
  value: T
  onChange: (value: T) => void
  /** 'list' stacks the cards in one column, for a ranked set such as the computer opponents. */
  layout?: 'grid' | 'list'
  /** Keep the label for screen readers only, when a heading right above already says it. */
  hideLabel?: boolean
}

/**
 * A radio group drawn as cards, for choices that need a sentence each (the
 * mode and opponent pickers). Keyboard behaviour matches native radios.
 */
export default function ChoiceCards<T extends string>({
  label,
  choices,
  value,
  onChange,
  layout = 'grid',
  hideLabel = false,
}: ChoiceCardsProps<T>) {
  const labelId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const active = Math.max(
    0,
    choices.findIndex((c) => c.value === value),
  )

  const move = (index: number) => {
    const next = (index + choices.length) % choices.length
    onChange(choices[next].value)
    refs.current[next]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(index - 1)
    }
  }

  return (
    <div className="field">
      <span id={labelId} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={`choices choices--${layout}`}>
        {choices.map((choice, index) => {
          const checked = index === active
          return (
            <button
              key={choice.value}
              ref={(el) => {
                refs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className={`choice ${checked ? 'is-active' : ''}`}
              onClick={() => onChange(choice.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="choice__head">
                {choice.icon && <span className="choice__icon">{choice.icon}</span>}
                <span className="choice__title">{choice.title}</span>
                {choice.note && <span className="choice__note">{choice.note}</span>}
                {choice.badge && <span className="choice__badge">{choice.badge}</span>}
              </span>
              {choice.description && <span className="choice__description">{choice.description}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
