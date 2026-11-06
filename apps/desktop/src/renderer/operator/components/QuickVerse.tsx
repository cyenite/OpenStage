import { useState } from 'react'
import { formatReference, newId, parseReference } from '@openstage/shared'
import { dispatch } from '../engine'

/** Type `ps 23 1` and Enter: the passage goes into the service after the current item, ready in Preview. */
export function QuickVerse() {
  const [text, setText] = useState('')
  const parsed = text.trim() ? parseReference(text) : null
  return (
    <div className={`quick-verse${parsed && !parsed.ok ? ' is-invalid' : ''}`}>
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19V5" /></svg>
      <input
        type="text"
        value={text}
        aria-label="Quick verse"
        placeholder="Quick verse: ps 23 1, then Enter to preview"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setText('')
          if (e.key !== 'Enter' || !parsed?.ok) return
          dispatch({ type: 'scripture.quick', text, itemId: newId(text), passageId: newId(text) })
          setText('')
        }}
      />
      {parsed && <span className="quick-verse-hint">{parsed.ok ? formatReference(parsed.ref) : parsed.error}</span>}
    </div>
  )
}
