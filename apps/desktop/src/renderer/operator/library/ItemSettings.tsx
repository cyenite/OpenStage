import { useEffect, useRef } from 'react'
import { type ItemChanges, type OperatorSnapshot, type ServiceItem } from '@openstage/shared'
import { dispatch, useSongOutlines } from '../engine'
import { swatchCss } from './results'

interface ItemSettingsProps {
  snapshot: OperatorSnapshot
  item: ServiceItem
  onEdit: (item: ServiceItem) => void
  onClose: () => void
}

/** A service item's own look, in a popover from the slide grid: background, theme and arrangement. */
export function ItemSettings({ snapshot, item, onEdit, onClose }: ItemSettingsProps) {
  const { service, decks, library } = snapshot
  const panel = useRef<HTMLDivElement>(null)
  const outlines = useSongOutlines(item.type === 'song' ? [item.songId] : [], snapshot.libraryRevision)
  const deck = decks.find((d) => d.itemId === item.id)

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('button, select')?.focus()
    const onPointer = (event: PointerEvent) => {
      if (!panel.current?.parentElement?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [])

  if (!deck) return null
  const title = deck.title
  const outline = item.type === 'song' ? outlines.find((o) => o.id === item.songId) : undefined
  const update = (changes: ItemChanges) => dispatch({ type: 'service.edit', serviceId: service.id, edit: { type: 'service.updateItem', itemId: item.id, changes } })
  const canEdit = item.type === 'song' || item.type === 'scripture'

  return (
    <div
      ref={panel}
      className="popover item-settings"
      role="dialog"
      aria-label={`${title} settings`}
      onKeyDown={(event) => {
        // Escape closes the popover; it must not also reach Present's black-screen key.
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <span className="inspector-label">Background</span>
      <div className="background-picks" role="radiogroup" aria-label={`Background for ${title}`}>
        <button role="radio" aria-checked={!item.backgroundId} title="Use the theme’s own background" onClick={() => update({ backgroundId: null })}>
          <span className="background-pick-swatch is-theme" aria-hidden="true" />
          Theme
        </button>
        {library.backgrounds.map((b) => (
          <button key={b.id} role="radio" aria-checked={item.backgroundId === b.id} onClick={() => update({ backgroundId: b.id })}>
            <span className="background-pick-swatch" style={{ background: swatchCss(b.render) }} aria-hidden="true" />
            {b.name}
          </button>
        ))}
      </div>
      <label className="inspector-field">
        <span className="inspector-label">Theme</span>
        <select aria-label={`Theme for ${title}`} value={item.themeId ?? ''} onChange={(e) => update({ themeId: e.target.value || null })}>
          <option value="">Usual theme</option>
          {library.themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {item.type === 'song' && outline && outline.arrangements.length > 1 && (
        <label className="inspector-field">
          <span className="inspector-label">Arrangement</span>
          <select aria-label={`Arrangement of ${title}`} value={item.arrangementId} onChange={(e) => update({ arrangementId: e.target.value })}>
            {outline.arrangements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {canEdit && (
        <button className="button-quiet" onClick={() => (onClose(), onEdit(item))}>
          {item.type === 'song' ? 'Edit lyrics' : 'Change passage'}
        </button>
      )}
    </div>
  )
}
