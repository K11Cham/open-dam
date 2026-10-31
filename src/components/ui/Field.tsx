import { useId } from 'react'
import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  help?: ReactNode
  error?: string | null
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode
}

/** A labelled input with its help text and its error, both announced with the input. */
export default function Field({ label, help, error, children }: FieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy })}
      {help && (
        <p id={helpId} className="field__help">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
