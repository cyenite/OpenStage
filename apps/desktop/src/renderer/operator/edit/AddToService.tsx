import { newId, type Id, type Service, type ServiceEdit } from '@openstage/shared'
import { dispatch } from '../engine'

interface AddToServiceProps {
  kind: 'song' | 'scripture'
  service: Service
  isInService: boolean
  onAdd: (itemId: Id) => ServiceEdit
  onFill: (itemId: Id) => ServiceEdit
}

/** Fills the service's first open placeholder of this kind if there is one, else adds to the end. */
export function AddToService({ kind, service, isInService, onAdd, onFill }: AddToServiceProps) {
  const slot = service.items.find((i) => i.type === 'slot' && i.kind === kind)
  const edit = slot ? onFill(slot.id) : onAdd(newId(kind))
  const label = slot && slot.type === 'slot' ? `Fill “${slot.title}”` : isInService ? 'Add again to service' : 'Add to service'
  return (
    <button className="button-primary" disabled={!service.id} onClick={() => dispatch({ type: 'service.edit', serviceId: service.id, edit })}>
      {label}
    </button>
  )
}
