import { useState } from 'react'
import { bookById, formatReference, parseReference, type PassageRef } from '@openstage/shared'

interface ReferenceInputProps {
  label: string
  placeholder: string
  initial?: string
  className?: string
  onSubmit: (ref: PassageRef, text: string) => void
}

/** Parses as the operator types and shows what it understood, or why not, before Enter commits it. */
export function ReferenceInput({ label, placeholder, initial = '', className, onSubmit }: ReferenceInputProps) {
  const [text, setText] = useState(initial)
  const parsed = text.trim() ? parseReference(text) : null
  const hint = !parsed ? '' : parsed.ok ? formatReference(parsed.ref) : parsed.error
  const suggestions = parsed && !parsed.ok ? parsed.suggestions.map((id) => bookById(id)!.en) : []
  return (
    <div className={`reference-input ${className ?? ''}`}>
      <input
        type="text"
        value={text}
        aria-label={label}
        placeholder={placeholder}
        aria-invalid={parsed ? !parsed.ok : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && parsed?.ok) {
            onSubmit(parsed.ref, text)
            setText('')
          }
          if (e.key === 'Escape') setText('')
        }}
      />
      {hint && (
        <span className={`reference-hint${parsed?.ok ? ' is-ok' : ''}`} aria-live="polite">
          {parsed?.ok ? `${hint} · Enter` : hint}
          {suggestions.length > 0 && ` Try ${suggestions.join(', ')}.`}
        </span>
      )}
    </div>
  )
}
