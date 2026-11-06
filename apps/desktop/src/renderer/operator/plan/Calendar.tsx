import type { CSSProperties } from 'react'
import type { Id, ServiceSummary, ServiceTemplate } from '@openstage/shared'
import { dayKey, monthGrid, parseDay, weekdays } from './dates'

interface CalendarProps {
  day: string
  today: string
  services: ServiceSummary[]
  templates: ServiceTemplate[]
  onDay: (day: string) => void
  onService: (serviceId: Id, day: string) => void
}

export function Calendar({ day, today, services, templates, onDay, onService }: CalendarProps) {
  const month = parseDay(day).getMonth()
  const byDay = new Map<string, ServiceSummary[]>()
  for (const service of services) if (service.date) byDay.set(service.date, [...(byDay.get(service.date) ?? []), service])
  const color = (service: ServiceSummary) => templates.find((t) => t.id === service.templateId)?.color ?? '#8A8A92'
  return (
    <div className="calendar" role="grid" aria-label="Services by day">
      {weekdays.map((w) => (
        <span key={w} className="calendar-weekday" role="columnheader">
          {w}
        </span>
      ))}
      {monthGrid(day).map((date) => {
        const key = dayKey(date)
        const events = byDay.get(key) ?? []
        const classes = ['calendar-day', date.getMonth() === month ? '' : 'is-outside', key === day ? 'is-selected' : '', key === today ? 'is-today' : '']
        return (
          <div key={key} className={classes.filter(Boolean).join(' ')} role="gridcell" aria-selected={key === day} onClick={() => onDay(key)}>
            <button className="calendar-date" aria-label={`${date.toDateString()}, ${events.length} services`} onClick={() => onDay(key)}>
              {date.getDate()}
            </button>
            {events.map((service) => (
              <button
                key={service.id}
                className="calendar-event"
                style={{ '--event': color(service) } as CSSProperties}
                title={`${service.name}: ${service.readiness.detail}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onService(service.id, key)
                }}
              >
                <span className={`readiness-dot is-${service.readiness.state}`} aria-hidden="true" />
                <span className="calendar-event-text">
                  <strong>{service.time}</strong> {service.name}
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}
