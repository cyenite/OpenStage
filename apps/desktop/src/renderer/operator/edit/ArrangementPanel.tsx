import { useState, type CSSProperties, type DragEvent } from 'react'
import { newId, sectionKinds, type Arrangement, type Song, type SongEdit } from '@openstage/shared'

interface ArrangementPanelProps {
  song: Song
  arrangement: Arrangement
  onEdit: (edit: SongEdit) => void
  onSelect: (arrangementId: string) => void
}

/** Arrangements order the shared sections; one section can appear any number of times. */
export function ArrangementPanel({ song, arrangement, onEdit, onSelect }: ArrangementPanelProps) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [newName, setNewName] = useState<string | null>(null)
  const order = arrangement.sectionIds

  const save = (sectionIds: string[]) => onEdit({ type: 'song.setArrangement', arrangementId: arrangement.id, name: arrangement.name, sectionIds })
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    save(next)
  }
  const createArrangement = () => {
    const name = newName?.trim()
    setNewName(null)
    if (!name) return
    const arrangementId = newId(name)
    onEdit({ type: 'song.setArrangement', arrangementId, name, sectionIds: order })
    onSelect(arrangementId)
  }

  return (
    <section className="arrangement" aria-label="Arrangement">
      <div className="arrangement-head">
        <span className="panel-title">Arrangement</span>
        <div className="segmented" role="tablist" aria-label="Arrangements">
          {song.arrangements.map((a) => (
            <button key={a.id} role="tab" aria-selected={a.id === arrangement.id} onClick={() => onSelect(a.id)}>
              {a.name}
            </button>
          ))}
          {newName === null ? (
            <button aria-label="New arrangement" title="New arrangement, starting from this one" onClick={() => setNewName('')}>
              +
            </button>
          ) : (
            <input
              autoFocus
              className="arrangement-name"
              aria-label="New arrangement name"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={createArrangement}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setNewName(null)
              }}
            />
          )}
        </div>
        {song.arrangements.length > 1 && (
          <button className="button-quiet button-small" onClick={() => onEdit({ type: 'song.removeArrangement', arrangementId: arrangement.id })}>
            Remove “{arrangement.name}”
          </button>
        )}
        <span className="arrangement-hint">Drag sections to reorder, or Alt+←/→. Lyrics are shared by every arrangement.</span>
      </div>
      <ol className="arrangement-chips">
        {order.map((sectionId, index) => {
          const section = song.sections[sectionId]
          if (!section) return null
          const color = sectionKinds.find((k) => k.key === section.kind)?.color
          const isRepeat = order.indexOf(sectionId) !== index
          return (
            <li
              key={`${sectionId}-${index}`}
              className={`chip-section${dragFrom === index ? ' is-dragging' : ''}`}
              style={{ '--tint': color } as CSSProperties}
              draggable
              tabIndex={0}
              aria-label={`${section.label}, position ${index + 1} of ${order.length}`}
              onDragStart={() => setDragFrom(index)}
              onDragEnd={() => setDragFrom(null)}
              onDragOver={(e: DragEvent) => e.preventDefault()}
              onDrop={() => dragFrom !== null && move(dragFrom, index)}
              onKeyDown={(e) => {
                if (e.altKey && e.key === 'ArrowLeft') move(index, index - 1)
                if (e.altKey && e.key === 'ArrowRight') move(index, index + 1)
              }}
            >
              <span className="grip" aria-hidden="true">⋮⋮</span>
              {section.label}
              {isRepeat && <span className="muted"> again</span>}
              <button className="chip-remove" aria-label={`Take ${section.label} out of ${arrangement.name}`} onClick={() => save(order.filter((_, i) => i !== index))}>
                ×
              </button>
            </li>
          )
        })}
        <li>
          <select
            className="chip-add"
            aria-label="Add a section to this arrangement"
            value=""
            onChange={(e) => e.target.value && save([...order, e.target.value])}
          >
            <option value="">+ Section</option>
            {Object.values(song.sections).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </li>
      </ol>
    </section>
  )
}
