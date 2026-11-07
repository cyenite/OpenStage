import { itemKind, itemKinds, type ItemChanges, type OperatorSnapshot, type ServiceItem } from '@openstage/shared'
import { dispatch, useSongOutlines } from '../engine'
import { swatchCss } from './results'

interface ItemInspectorProps {
  snapshot: OperatorSnapshot
  onEdit: (item: ServiceItem) => void
}

/** The selected item's own look, set where the operator already is: background, theme and arrangement. */
export function ItemInspector({ snapshot, onEdit }: ItemInspectorProps) {
  const { service, decks, state, library } = snapshot
  const item = service.items.find((i) => i.id === state.selectedItemId)
  const outlines = useSongOutlines(item?.type === 'song' ? [item.songId] : [], snapshot.libraryRevision)
  const deck = decks.find((d) => d.itemId === item?.id)
  if (!item || !deck) return null

  const title = deck.title
  const outline = item.type === 'song' ? outlines.find((o) => o.id === item.songId) : undefined
  const update = (changes: ItemChanges) => dispatch({ type: 'service.edit', serviceId: service.id, edit: { type: 'service.updateItem', itemId: item.id, changes } })
  const canEdit = item.type === 'song' || item.type === 'scripture'

  return (
    <div className="inspector-block item-inspector">
      <span className="panel-title">Selected item</span>
      <div className="item-inspector-head">
        <span className="order-kind">{itemKinds.find((k) => k.key === itemKind(item))?.badge}</span>
        <strong>{title}</strong>
      </div>
      {!deck.isPlaceholder && (
        <>
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
        </>
      )}
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
        <button className="button-quiet" onClick={() => onEdit(item)}>
          {item.type === 'song' ? 'Edit lyrics' : 'Change passage'}
        </button>
      )}
    </div>
  )
}
