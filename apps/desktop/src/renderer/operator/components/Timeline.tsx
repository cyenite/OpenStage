import { useEffect, useState, type CSSProperties } from 'react'
import { forecast, itemMinutes, serviceStart, type OperatorSnapshot } from '@openstage/shared'
import { clockTime, dayKey } from '../plan/dates'

/** The footer rail from the design: the service's items by planned length, and whether it will end on time. */
export function Timeline({ snapshot }: { snapshot: OperatorSnapshot }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])
  const { service, state } = snapshot
  const { itemId, itemStartedAt } = state.timing
  const plan = forecast(service, itemId, itemStartedAt, now)
  const start = serviceStart(service)
  const liveIndex = service.items.findIndex((i) => i.id === itemId)
  const isServiceDay = service.date === dayKey(new Date(now))
  const drift = isServiceDay && plan.projectedEnd !== null && plan.plannedEnd !== null ? Math.round((plan.projectedEnd - plan.plannedEnd) / 60_000) : null
  const toGo = plan.projectedEnd === null ? 0 : Math.round((plan.projectedEnd - now) / 60_000)
  const status =
    plan.projectedEnd === null
      ? `${plan.plannedMinutes} min planned${plan.plannedEnd !== null ? `, ends ${clockTime(plan.plannedEnd)}` : ''}`
      : drift === null
        ? `${isServiceDay ? '' : 'Rehearsal · '}${toGo} min to go · projected end ${clockTime(plan.projectedEnd)}`
        : `${Math.abs(drift) <= 2 ? 'On track' : drift > 0 ? `${drift} min behind` : `${-drift} min ahead`} · projected end ${clockTime(plan.projectedEnd)}`
  return (
    <footer className="timeline" aria-label="Service timeline">
      <div className="timeline-head">
        <span>{start !== null ? `${clockTime(start)} start` : 'No start time'}</span>
        <span className={`timeline-status${drift !== null && drift > 2 ? ' is-late' : ''}`}>{status}</span>
        <span>{plan.plannedEnd !== null ? `${clockTime(plan.plannedEnd)} planned end` : ''}</span>
      </div>
      <div className="timeline-rail">
        {service.items.map((item, index) => {
          const state = liveIndex < 0 ? 'upcoming' : index < liveIndex ? 'done' : index === liveIndex ? 'live' : 'upcoming'
          const deck = snapshot.decks.find((d) => d.itemId === item.id)
          return (
            <span key={item.id} className={`timeline-item is-${state}`} style={{ '--minutes': itemMinutes(item) } as CSSProperties} title={`${deck?.title}: ${itemMinutes(item)} min`}>
              {deck?.title}
            </span>
          )
        })}
      </div>
    </footer>
  )
}
