import { useState } from 'react'
import { itemKinds, lookup, type Id, type OperatorSnapshot, type ServiceItem } from '@openstage/shared'
import { dispatch } from '../engine'
import { isMac } from '../chrome'
import { backgroundDragType, dropBackground, swatchCss } from '../library/results'

interface ServiceOrderProps {
  snapshot: OperatorSnapshot
  onAdd: () => void
  onEdit: (item: ServiceItem) => void
  onOpenSongs: () => void
}

export function ServiceOrder({ snapshot, onAdd, onEdit, onOpenSongs }: ServiceOrderProps) {
  const { state, service, decks, library } = snapshot
  const [dropItemId, setDropItemId] = useState<Id | null>(null)
  const backgrounds = Object.fromEntries(library.backgrounds.map((b) => [b.id, b]))
  const isBackgroundDrag = (event: React.DragEvent) => event.dataTransfer.types.includes(backgroundDragType)
  const lastLive = service.items.findIndex((i) => i.id === state.timing.itemId)
  return (
    <nav className="sidebar service-order" aria-label="Service order">
      <div className="sidebar-head">
        <h2 className="panel-title">Service order</h2>
        <button className="icon-button" aria-label="Add to the service" title={`Add after the selected item (${isMac ? '⌘K' : 'Ctrl K'})`} onClick={onAdd}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
      <ol>
        {service.items.map((item, index) => {
          const deck = decks.find((d) => d.itemId === item.id)
          const background = lookup(backgrounds, item.backgroundId)
          const isLive = state.live.slide?.itemId === item.id
          const isDone = !isLive && index < lastLive
          const isSelected = state.selectedItemId === item.id
          const isDropTarget = dropItemId === item.id
          const canEdit = item.type === 'song' || item.type === 'scripture' || item.type === 'presentation'
          return (
            <li
              key={item.id}
              className={`order-row${isDropTarget ? ' is-drop-target' : ''}`}
              onDragOver={(e) => {
                if (!isBackgroundDrag(e)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                setDropItemId(item.id)
              }}
              onDragLeave={() => setDropItemId((id) => (id === item.id ? null : id))}
              onDrop={(e) => {
                const backgroundId = e.dataTransfer.getData(backgroundDragType)
                setDropItemId(null)
                if (backgroundId) dropBackground(service, item, backgroundId, e)
              }}
            >
              <button
                className={`order-item${isSelected ? ' is-selected' : ''}${isLive ? ' is-live' : ''}${isDone ? ' is-done' : ''}${deck?.isPlaceholder ? ' is-placeholder' : ''}`}
                aria-current={isSelected ? 'true' : undefined}
                title={canEdit ? 'Double-click to edit' : undefined}
                onClick={() => dispatch({ type: 'item.select', itemId: item.id })}
                onDoubleClick={() => canEdit && onEdit(item)}
              >
                <span className="order-kind">{itemKinds.find((k) => k.key === deck?.kind)?.badge}</span>
                <span className="order-text">
                  <span className="order-name">{deck?.title}</span>
                  <span className="order-meta">
                    {isDropTarget ? 'Drop to use here · Alt: every item like it · Shift: whole service' : item.type === 'slot' ? 'To choose' : deck?.isPlaceholder ? `${deck.minutes} min` : `${deck?.slides.length} slides`}
                  </span>
                </span>
                {isLive && <span className="order-tag is-live">LIVE</span>}
                {background && <span className="order-swatch" style={{ background: swatchCss(background.render) }} role="img" aria-label={`${background.name} background`} />}
              </button>
              {!isLive && (
                <button
                  className="order-remove"
                  aria-label={`Remove ${deck?.title ?? 'item'} from the service`}
                  title="Remove from service"
                  onClick={() => dispatch({ type: 'service.edit', serviceId: service.id, edit: { type: 'service.removeItem', itemId: item.id } })}
                >
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
              {isSelected && (
                <span className="order-caret" aria-hidden="true">
                  {item.type === 'slot' ? 'The Library fills this' : 'New items land here'}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="sidebar-foot">
        <h2 className="panel-title">Library</h2>
        <button className="library-link" onClick={onOpenSongs}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
          Manage songs and themes
        </button>
      </div>
    </nav>
  )
}
