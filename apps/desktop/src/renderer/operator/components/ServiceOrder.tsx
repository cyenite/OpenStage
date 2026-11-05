import type { OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'

const kindBadges = { song: 'SG', scripture: 'BK' } as const

export function ServiceOrder({ snapshot }: { snapshot: OperatorSnapshot }) {
  const { state, service, decks } = snapshot
  return (
    <nav className="service-order" aria-label="Service order">
      <h2 className="panel-title">Service order</h2>
      <ol>
        {service.items.map((item) => {
          const deck = decks.find((d) => d.itemId === item.id)
          const isLive = state.live.slide?.itemId === item.id
          const isSelected = state.selectedItemId === item.id
          return (
            <li key={item.id}>
              <button
                className={`order-item${isSelected ? ' is-selected' : ''}${isLive ? ' is-live' : ''}`}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => dispatch({ type: 'item.select', itemId: item.id })}
              >
                <span className="order-kind">{kindBadges[item.type]}</span>
                <span className="order-text">
                  <span className="order-name">{deck?.title}</span>
                  <span className="order-meta">{deck?.slides.length} slides</span>
                </span>
                {isLive && <span className="order-tag">LIVE</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
