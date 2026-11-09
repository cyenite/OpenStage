import { itemKinds, type Id, type ItemKind, type Service, type ServiceItem, type ServiceTemplate, type TemplateSlot } from './library'

export function itemKind(item: ServiceItem): ItemKind {
  return item.type === 'song' || item.type === 'scripture' || item.type === 'presentation' ? item.type : item.kind
}

export function itemMinutes(item: ServiceItem): number {
  return item.minutes ?? itemKinds.find((k) => k.key === itemKind(item))!.minutes
}

/** The item a template slot starts as: its fixed content, a heading, or a placeholder to fill. */
export function itemFromSlot(slot: TemplateSlot, itemId: Id, arrangementId: (songId: Id) => Id | undefined): ServiceItem {
  const base = { id: itemId, slotId: slot.id, minutes: slot.minutes, isLinked: true }
  const arrangement = slot.songId ? arrangementId(slot.songId) : undefined
  if (slot.kind === 'song' && slot.songId && arrangement) return { ...base, type: 'song', songId: slot.songId, arrangementId: arrangement }
  if (slot.kind === 'scripture' && slot.passageId) return { ...base, type: 'scripture', passageId: slot.passageId }
  if (slot.kind === 'song' || slot.kind === 'scripture') return { ...base, type: 'slot', kind: slot.kind, title: slot.title, rule: slot.rule }
  // Slides have no slot of their own yet; a template slot for them starts as a part to fill by hand.
  return { ...base, type: 'heading', kind: slot.kind === 'presentation' ? 'other' : slot.kind, title: slot.title }
}

export interface NewService {
  id: Id
  name: string
  date: string
  time: string
}

export function serviceFromTemplate(template: ServiceTemplate | undefined, details: NewService, arrangementId: (songId: Id) => Id | undefined): Service {
  const service: Service = { ...details, items: [] }
  if (!template) return service
  return {
    ...service,
    templateId: template.id,
    ...(template.themeId && { themeId: template.themeId }),
    ...(template.translations && { translations: template.translations }),
    items: template.slots.map((slot) => itemFromSlot(slot, `${details.id}-${slot.id}`, arrangementId)),
  }
}

/**
 * Brings a service up to date with its template. Items still linked to a slot take the slot's new
 * title, length and content; items whose slot is gone leave; new slots arrive after the item of the
 * slot before them. Anything the church changed by hand stays as it is.
 */
export function followTemplate(service: Service, template: ServiceTemplate, arrangementId: (songId: Id) => Id | undefined): Service {
  const slots = new Map(template.slots.map((slot) => [slot.id, slot]))
  const items: ServiceItem[] = []
  for (const item of service.items) {
    const slot = item.slotId ? slots.get(item.slotId) : undefined
    if (!item.isLinked || !item.slotId) items.push(item)
    else if (slot) items.push({ ...itemFromSlot(slot, item.id, arrangementId), ...(item.notes && { notes: item.notes }) })
  }
  template.slots.forEach((slot, index) => {
    if (items.some((i) => i.slotId === slot.id)) return
    const previous = template.slots.slice(0, index).findLast((s) => items.some((i) => i.slotId === s.id))
    const at = previous ? items.findIndex((i) => i.slotId === previous.id) + 1 : 0
    items.splice(at, 0, itemFromSlot(slot, `${service.id}-${slot.id}`, arrangementId))
  })
  return JSON.stringify(items) === JSON.stringify(service.items) ? service : { ...service, items }
}

export const readinessStates = [
  { key: 'ready', label: 'Ready' },
  { key: 'needs', label: 'Needs songs or slides' },
  { key: 'staff', label: 'No operator yet' },
] as const

export type Readiness = (typeof readinessStates)[number]['key']

export interface ServiceReadiness {
  state: Readiness
  /** Placeholders still to fill. */
  open: number
  detail: string
}

/** No operator outranks open placeholders: a service with no one to run it is the bigger gap. */
export function serviceReadiness(service: Service): ServiceReadiness {
  const open = service.items.filter((i) => i.type === 'slot').length
  const hasOperator = !!service.team?.operator?.trim()
  const detail = [
    open > 0 ? `${open} ${open === 1 ? 'item' : 'items'} to choose` : service.items.length === 0 ? 'Nothing planned yet' : '',
    hasOperator ? '' : 'operator not assigned',
  ]
    .filter(Boolean)
    .join(' · ')
  const state: Readiness = !hasOperator ? 'staff' : open > 0 || service.items.length === 0 ? 'needs' : 'ready'
  return { state, open, detail: detail || 'Ready' }
}

export interface TimelineItem {
  id: Id
  title: string
  minutes: number
  state: 'done' | 'live' | 'upcoming'
}

export interface Forecast {
  /** Minutes from the planned start to the planned end. */
  plannedMinutes: number
  /** Planned end and projected end as epoch milliseconds; projected is null until the service starts. */
  plannedEnd: number | null
  projectedEnd: number | null
}

/** Planned start of a dated service in local time, or null. */
export function serviceStart(service: Service): number | null {
  if (!service.date) return null
  const [y, m, d] = service.date.split('-').map(Number)
  const [hh = 0, mm = 0] = (service.time ?? '00:00').split(':').map(Number)
  const start = new Date(y!, m! - 1, d!, hh, mm).getTime()
  return Number.isFinite(start) ? start : null
}

/**
 * Projects the end from where the service is: the live item's remaining planned time (never less
 * than zero) plus every item after it.
 */
export function forecast(service: Service, liveItemId: Id | null, itemStartedAt: number | null, now: number): Forecast {
  const plannedMinutes = service.items.reduce((sum, item) => sum + itemMinutes(item), 0)
  const start = serviceStart(service)
  const plannedEnd = start === null ? null : start + plannedMinutes * 60_000
  const liveIndex = service.items.findIndex((i) => i.id === liveItemId)
  if (liveIndex < 0 || itemStartedAt === null) return { plannedMinutes, plannedEnd, projectedEnd: null }
  const live = service.items[liveIndex]!
  const remainingLive = Math.max(0, itemMinutes(live) * 60_000 - (now - itemStartedAt))
  const after = service.items.slice(liveIndex + 1).reduce((sum, item) => sum + itemMinutes(item), 0)
  return { plannedMinutes, plannedEnd, projectedEnd: now + remainingLive + after * 60_000 }
}
