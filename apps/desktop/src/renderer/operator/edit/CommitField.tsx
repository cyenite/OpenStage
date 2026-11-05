import { useEffect, useState, type KeyboardEvent } from 'react'

interface CommitFieldProps {
  id?: string
  lang?: string
  rows?: number
  value: string
  label: string
  className?: string
  placeholder?: string
  isMultiline?: boolean
  onCommit: (value: string) => void
}

/**
 * Edits locally and sends one command when the field is left (or Enter, Ctrl/⌘+Enter in a text area),
 * so typing makes one undo step and one save instead of one per key. Escape puts the value back.
 */
export function CommitField({ id, lang, rows, value, label, className, placeholder, isMultiline = false, onCommit }: CommitFieldProps) {
  const [draft, setDraft] = useState(value)
  const [isEditing, setEditing] = useState(false)

  useEffect(() => {
    if (!isEditing) setDraft(value)
  }, [value, isEditing])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const isSubmit = event.key === 'Enter' && (!isMultiline || event.ctrlKey || event.metaKey)
    if (isSubmit) {
      event.preventDefault()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      setDraft(value)
      setEditing(false)
      requestAnimationFrame(() => (event.target as HTMLElement).blur())
    }
  }

  const shared = {
    id,
    lang,
    className,
    placeholder,
    value: draft,
    'aria-label': label,
    spellCheck: isMultiline,
    onFocus: () => setEditing(true),
    onBlur: commit,
    onKeyDown,
  }
  return isMultiline ? (
    <textarea {...shared} rows={rows ?? Math.max(3, draft.split('\n').length + 1)} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input {...shared} type="text" onChange={(e) => setDraft(e.target.value)} />
  )
}
