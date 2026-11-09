import { useState } from 'react'
import { newId, type LowerThird, type OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'

/** Text in square brackets is a placeholder the church has not filled in yet, like the starter "[Pastor name]". */
const placeholder = /\[[^\]]*\]/

export const hasPlaceholder = (lowerThird: Pick<LowerThird, 'title' | 'subtitle'>) => placeholder.test(lowerThird.title) || placeholder.test(lowerThird.subtitle)

/** Saved lower thirds, each with one button that puts it on or takes it off; editing happens in place. */
export function LowerThirdsPanel({ snapshot }: { snapshot: OperatorSnapshot }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const { lowerThirds } = snapshot.library
  const onAir = snapshot.state.live.lowerThird
  const isNew = editingId === 'new'
  return (
    <div className="lower-thirds">
      <ul className="lower-third-list" aria-label="Lower thirds">
        {lowerThirds.map((lt) =>
          editingId === lt.id ? (
            <li key={lt.id}>
              <LowerThirdForm lowerThird={lt} isOnAir={onAir === lt.id} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={lt.id}>
              <LowerThirdRow lowerThird={lt} isOnAir={onAir === lt.id} onEdit={() => setEditingId(lt.id)} />
            </li>
          ),
        )}
        {lowerThirds.length === 0 && !isNew && <li className="library-empty muted">No lower thirds yet. Make one for the preacher, a guest or an announcement.</li>}
      </ul>
      {isNew ? (
        <LowerThirdForm lowerThird={null} isOnAir={false} onDone={() => setEditingId(null)} />
      ) : (
        <button className="button-quiet button-small" onClick={() => setEditingId('new')}>
          + New lower third
        </button>
      )}
    </div>
  )
}

interface LowerThirdRowProps {
  lowerThird: LowerThird
  isOnAir: boolean
  onEdit: () => void
}

function LowerThirdRow({ lowerThird, isOnAir, onEdit }: LowerThirdRowProps) {
  const isUnfinished = hasPlaceholder(lowerThird)
  const toggle = () => dispatch(isOnAir ? { type: 'layer.clear', layer: 'lowerThird' } : { type: 'lowerThird.set', lowerThirdId: lowerThird.id })
  return (
    <div className={`lower-third-row${isOnAir ? ' is-on-air' : ''}`}>
      <span className="lower-third-text">
        <strong>{lowerThird.title}</strong>
        <span className="muted">{isUnfinished ? 'Fill in the text in [brackets] before showing it' : lowerThird.subtitle || 'No second line'}</span>
      </span>
      {isOnAir && <span className="tag-live">ON AIR</span>}
      <button className="button-quiet button-small" aria-label={`Edit ${lowerThird.title}`} onClick={onEdit}>
        Edit
      </button>
      <button
        className={`button-small ${isOnAir ? 'button-danger' : 'button-accent'}`}
        aria-pressed={isOnAir}
        aria-label={isOnAir ? `Take ${lowerThird.title} off the screen` : `Show ${lowerThird.title} on the screen`}
        disabled={!isOnAir && isUnfinished}
        onClick={toggle}
      >
        {isOnAir ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

interface LowerThirdFormProps {
  lowerThird: LowerThird | null
  isOnAir: boolean
  onDone: () => void
}

function LowerThirdForm({ lowerThird, isOnAir, onDone }: LowerThirdFormProps) {
  const [title, setTitle] = useState(lowerThird?.title ?? '')
  const [subtitle, setSubtitle] = useState(lowerThird?.subtitle ?? '')
  const draft = { title: title.trim(), subtitle: subtitle.trim() }
  const canSave = !!draft.title
  const save = (andShow: boolean) => {
    if (!canSave) return
    const id = lowerThird?.id ?? newId(draft.title)
    dispatch({ type: 'lowerThird.save', lowerThird: { id, ...draft } })
    if (andShow) dispatch({ type: 'lowerThird.set', lowerThirdId: id })
    onDone()
  }
  return (
    <form
      className="lower-third-form"
      aria-label={lowerThird ? `Edit ${lowerThird.title}` : 'New lower third'}
      onSubmit={(e) => (e.preventDefault(), save(false))}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onDone()
      }}
    >
      <label>
        <span className="inspector-label">Name or heading</span>
        <input autoFocus value={title} placeholder="e.g. Rev. Grace Achieng" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        <span className="inspector-label">Second line</span>
        <input value={subtitle} placeholder="e.g. Guest speaker" onChange={(e) => setSubtitle(e.target.value)} />
      </label>
      {hasPlaceholder(draft) && <span className="inspector-note">Replace the text in [brackets] with the real words.</span>}
      {isOnAir && <span className="inspector-note">On air now: saving updates the screen straight away.</span>}
      <div className="lower-third-actions">
        {lowerThird && (
          <button type="button" className="button-quiet button-small is-destructive" onClick={() => (dispatch({ type: 'lowerThird.delete', lowerThirdId: lowerThird.id }), onDone())}>
            Delete
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="button-quiet button-small" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="button-quiet button-small" disabled={!canSave}>
          Save
        </button>
        {!isOnAir && (
          <button type="button" className="button-small button-accent" disabled={!canSave || hasPlaceholder(draft)} onClick={() => save(true)}>
            Save and show
          </button>
        )}
      </div>
    </form>
  )
}
