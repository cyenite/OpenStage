import { useState } from 'react'
import { readinessStates, type Id, type OperatorSnapshot, type ServiceSummary } from '@openstage/shared'
import { dispatch } from '../engine'
import { CommitField } from '../edit/CommitField'
import { Calendar } from './Calendar'
import { addMonths, dayKey, longDay, monthTitle } from './dates'
import { NewServiceDialog } from './NewServiceDialog'
import type { AddTarget } from '../library/results'
import { ServicePlan } from './ServicePlan'
import { TemplatePanel } from './TemplatePanel'

export const planViews = [
  { key: 'month', label: 'Month' },
  { key: 'list', label: 'List' },
] as const

export type PlanView = (typeof planViews)[number]['key']

export interface PlanSelection {
  day: string
  view: PlanView
  serviceId: Id | null
  templateId: Id | null
}

export function initialPlanSelection(): PlanSelection {
  return { day: dayKey(new Date()), view: 'month', serviceId: null, templateId: 'sunday' }
}

interface PlanWorkspaceProps {
  snapshot: OperatorSnapshot
  selection: PlanSelection
  onSelection: (selection: PlanSelection) => void
  onQuickAdd: (target: AddTarget) => void
  onPresent: () => void
}

export function PlanWorkspace({ snapshot, selection, onSelection, onQuickAdd, onPresent }: PlanWorkspaceProps) {
  const [newServiceDay, setNewServiceDay] = useState<string | null>(null)
  const select = (change: Partial<PlanSelection>) => onSelection({ ...selection, ...change })
  const present = (serviceId: Id) => {
    dispatch({ type: 'service.open', serviceId })
    onPresent()
  }
  const dayServices = snapshot.services.filter((s) => s.date === selection.day)
  const today = dayKey(new Date())

  return (
    <>
      <main className="main plan-main">
        {selection.serviceId ? (
          <ServicePlan
            key={selection.serviceId}
            serviceId={selection.serviceId}
            snapshot={snapshot}
            onBack={() => select({ serviceId: null })}
            onQuickAdd={onQuickAdd}
            onPresent={() => present(selection.serviceId!)}
          />
        ) : (
          <>
            <div className="plan-head">
              <h1>{monthTitle(selection.day)}</h1>
              <div className="plan-nav">
                <button className="icon-button" aria-label="Previous month" onClick={() => select({ day: addMonths(selection.day, -1) })}>
                  ‹
                </button>
                <button className="button-quiet button-small" onClick={() => select({ day: today })}>
                  Today
                </button>
                <button className="icon-button" aria-label="Next month" onClick={() => select({ day: addMonths(selection.day, 1) })}>
                  ›
                </button>
              </div>
              <ul className="legend">
                {readinessStates.map((r) => (
                  <li key={r.key}>
                    <span className={`readiness-dot is-${r.key}`} aria-hidden="true" />
                    {r.label}
                  </li>
                ))}
              </ul>
              <div className="segmented" role="tablist" aria-label="Calendar view">
                {planViews.map((v) => (
                  <button key={v.key} role="tab" aria-selected={selection.view === v.key} onClick={() => select({ view: v.key })}>
                    {v.label}
                  </button>
                ))}
              </div>
              <button className="button-primary" onClick={() => setNewServiceDay(selection.day)}>
                New service
              </button>
            </div>
            {selection.view === 'month' ? (
              <Calendar
                day={selection.day}
                today={today}
                services={snapshot.services}
                templates={snapshot.library.templates}
                onDay={(day) => select({ day })}
                onService={(serviceId, day) => {
                  select({ day })
                  scrollToService(serviceId)
                }}
              />
            ) : (
              <ServiceList services={snapshot.services} openId={snapshot.service.id} onPick={(s) => select({ day: s.date ?? selection.day, serviceId: s.id })} />
            )}
            <section className="day-services" aria-label={`Services on ${longDay(selection.day)}`}>
              <h2 className="panel-title">{longDay(selection.day)}</h2>
              {dayServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  isOpen={service.id === snapshot.service.id}
                  templateName={snapshot.library.templates.find((t) => t.id === service.templateId)?.name}
                  onPlan={() => select({ serviceId: service.id })}
                  onPresent={() => present(service.id)}
                  onRehearse={() => {
                    dispatch({ type: 'rehearsal.start' })
                    present(service.id)
                  }}
                />
              ))}
              {dayServices.length === 0 && (
                <button className="day-empty" onClick={() => setNewServiceDay(selection.day)}>
                  Nothing planned. Add a service on this day.
                </button>
              )}
            </section>
          </>
        )}
      </main>
      <TemplatePanel
        templates={snapshot.library.templates}
        selectedId={selection.templateId}
        onSelect={(templateId) => select({ templateId })}
        onNewService={() => setNewServiceDay(selection.day)}
      />
      {newServiceDay && (
        <NewServiceDialog
          day={newServiceDay}
          templates={snapshot.library.templates}
          templateId={selection.templateId}
          onClose={() => setNewServiceDay(null)}
          onCreated={(serviceId, day) => {
            setNewServiceDay(null)
            select({ day, serviceId })
          }}
        />
      )}
    </>
  )
}

function scrollToService(serviceId: Id): void {
  requestAnimationFrame(() => document.getElementById(`service-${serviceId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

interface ServiceCardProps {
  service: ServiceSummary
  isOpen: boolean
  templateName: string | undefined
  onPlan: () => void
  onPresent: () => void
  onRehearse: () => void
}

function ServiceCard({ service, isOpen, templateName, onPlan, onPresent, onRehearse }: ServiceCardProps) {
  const setTeam = (team: { operator?: string; stage?: string }) => dispatch({ type: 'service.edit', serviceId: service.id, edit: { type: 'service.setTeam', team } })
  return (
    <article id={`service-${service.id}`} className={`service-card is-${service.readiness.state}`}>
      <div className="service-card-head">
        <strong>
          {service.time ?? ''} {service.name}
        </strong>
        <span className={`readiness-label is-${service.readiness.state}`}>{service.readiness.detail}</span>
      </div>
      <span className="muted">
        {templateName ? `From template “${templateName}” · ` : ''}
        {service.items} items · {service.minutes} min{isOpen ? ' · open in Present' : ''}
      </span>
      <div className="team-row">
        <label>
          <span>Operator</span>
          <CommitField label={`Operator for ${service.name}`} value={service.team.operator ?? ''} placeholder="Not assigned" onCommit={(operator) => setTeam({ operator })} />
        </label>
        <label>
          <span>Stage</span>
          <CommitField label={`Stage person for ${service.name}`} value={service.team.stage ?? ''} placeholder="Not assigned" onCommit={(stage) => setTeam({ stage })} />
        </label>
      </div>
      <div className="service-card-actions">
        <button className="button-quiet" onClick={onPlan}>
          Plan the order
        </button>
        <button className="button-quiet" title="Practise this service without changing the screens" onClick={onRehearse}>
          Rehearse
        </button>
        <button className="button-primary" onClick={onPresent}>
          Open to present
        </button>
      </div>
    </article>
  )
}

function ServiceList({ services, openId, onPick }: { services: ServiceSummary[]; openId: Id; onPick: (service: ServiceSummary) => void }) {
  const today = dayKey(new Date())
  const upcoming = services.filter((s) => !s.date || s.date >= today)
  return (
    <ol className="service-list">
      {upcoming.map((s) => (
        <li key={s.id}>
          <button className="service-list-row" onClick={() => onPick(s)}>
            <span className={`readiness-dot is-${s.readiness.state}`} aria-hidden="true" />
            <span className="service-list-when">{s.date ? `${longDay(s.date)} · ${s.time ?? ''}` : 'Not scheduled'}</span>
            <span className="service-list-name">{s.name}</span>
            <span className="muted">{s.id === openId ? 'open in Present · ' : ''}{s.readiness.detail}</span>
          </button>
        </li>
      ))}
      {upcoming.length === 0 && <li className="muted">No services from today on.</li>}
    </ol>
  )
}
