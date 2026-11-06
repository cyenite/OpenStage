import { itemKinds, type OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'

interface ServiceOrderProps {
  snapshot: OperatorSnapshot
  onOpenSongs: () => void
}

export function ServiceOrder({ snapshot, onOpenSongs }: ServiceOrderProps) {
  const { state, service, decks } = snapshot
  return (
    <nav className="sidebar service-order" aria-label="Service order">
      <div className="sidebar-head">
        <h2 className="panel-title">Service order</h2>
        <button className="icon-button" aria-label="Add a song to the service" title="Add a song" onClick={onOpenSongs}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
      <ol>
        {service.items.map((item) => {
          const deck = decks.find((d) => d.itemId === item.id)
          const isLive = state.live.slide?.itemId === item.id
          const isNext = !isLive && state.preview?.itemId === item.id
          const isSelected = state.selectedItemId === item.id
          return (
            <li key={item.id} className="order-row">
              <button
                className={`order-item${isSelected ? ' is-selected' : ''}${isLive ? ' is-live' : ''}${deck?.isPlaceholder ? ' is-placeholder' : ''}`}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => dispatch({ type: 'item.select', itemId: item.id })}
              >
                <span className="order-kind">{itemKinds.find((k) => k.key === deck?.kind)?.badge}</span>
                <span className="order-text">
                  <span className="order-name">{deck?.title}</span>
                  <span className="order-meta">{item.type === 'slot' ? 'To choose' : deck?.isPlaceholder ? `${deck.minutes} min` : `${deck?.slides.length} slides`}</span>
                </span>
                {isLive && <span className="order-tag is-live">LIVE</span>}
                {isNext && <span className="order-tag is-next">NEXT</span>}
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
            </li>
          )
        })}
      </ol>
      <div className="sidebar-foot">
        <h2 className="panel-title">Library</h2>
        <button className="library-link" onClick={onOpenSongs}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
          Songs
        </button>
      </div>
    </nav>
  )
}
