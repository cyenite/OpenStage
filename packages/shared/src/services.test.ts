import { describe, expect, it } from 'vitest'
import type { Service, ServiceTemplate } from './library'
import { followTemplate, forecast, serviceFromTemplate, serviceReadiness } from './services'

const template: ServiceTemplate = {
  id: 't',
  name: 'Sunday',
  color: '#F2A93B',
  slots: [
    { id: 'welcome', kind: 'welcome', title: 'Welcome', rule: '', minutes: 5 },
    { id: 'opening', kind: 'song', title: 'Opening song', rule: 'Pick', minutes: 6 },
    { id: 'fixed', kind: 'song', title: 'Doxology', rule: '', minutes: 2, songId: 'doxology' },
    { id: 'sermon', kind: 'sermon', title: 'Sermon', rule: '', minutes: 30 },
  ],
}
const arrangement = (songId: string) => (songId === 'doxology' ? 'default' : undefined)
const make = () => serviceFromTemplate(template, { id: 's', name: 'Sunday', date: '2026-11-08', time: '09:00' }, arrangement)

describe('serviceFromTemplate', () => {
  it('starts each slot as a heading, a placeholder or its fixed content, linked to the slot', () => {
    expect(make().items).toEqual([
      { id: 's-welcome', slotId: 'welcome', minutes: 5, isLinked: true, type: 'heading', kind: 'welcome', title: 'Welcome' },
      { id: 's-opening', slotId: 'opening', minutes: 6, isLinked: true, type: 'slot', kind: 'song', title: 'Opening song', rule: 'Pick' },
      { id: 's-fixed', slotId: 'fixed', minutes: 2, isLinked: true, type: 'song', songId: 'doxology', arrangementId: 'default' },
      { id: 's-sermon', slotId: 'sermon', minutes: 30, isLinked: true, type: 'heading', kind: 'sermon', title: 'Sermon' },
    ])
  })
})

describe('followTemplate', () => {
  it('updates linked items, drops removed slots, inserts new ones in place and leaves edited items alone', () => {
    const service = make()
    service.items[3] = { ...service.items[3]!, minutes: 40, isLinked: false }
    service.items.push({ id: 'extra', type: 'heading', kind: 'other', title: 'Baptism' })
    const edited: ServiceTemplate = {
      ...template,
      slots: [
        { ...template.slots[0]!, title: 'Welcome and notices', minutes: 8 },
        { id: 'prayer', kind: 'prayer', title: 'Prayer', rule: '', minutes: 4 },
        template.slots[1]!,
        { ...template.slots[3]!, minutes: 25 },
      ],
    }
    const followed = followTemplate(service, edited, arrangement)
    expect(followed.items.map((i) => [i.id, 'title' in i ? i.title : i.type, i.minutes])).toEqual([
      ['s-welcome', 'Welcome and notices', 8],
      ['s-prayer', 'Prayer', 4],
      ['s-opening', 'Opening song', 6],
      ['s-sermon', 'Sermon', 40],
      ['extra', 'Baptism', undefined],
    ])
    expect(followTemplate(followed, edited, arrangement)).toBe(followed)
  })
})

describe('serviceReadiness', () => {
  it('needs an operator first, then filled placeholders', () => {
    const service = make()
    expect(serviceReadiness(service)).toMatchObject({ state: 'staff', open: 1, detail: '1 item to choose · operator not assigned' })
    const staffed: Service = { ...service, team: { operator: 'Amina' } }
    expect(serviceReadiness(staffed)).toMatchObject({ state: 'needs' })
    expect(serviceReadiness({ ...staffed, items: staffed.items.filter((i) => i.type !== 'slot') })).toEqual({ state: 'ready', open: 0, detail: 'Ready' })
  })
})

describe('forecast', () => {
  it('projects the end from the live item and what follows', () => {
    const service = make()
    const start = new Date(2026, 10, 8, 9, 0).getTime()
    expect(forecast(service, null, null, start)).toEqual({ plannedMinutes: 43, plannedEnd: start + 43 * 60_000, projectedEnd: null })
    const now = start + 10 * 60_000
    expect(forecast(service, 's-opening', start + 9 * 60_000, now).projectedEnd).toBe(now + 5 * 60_000 + 32 * 60_000)
    expect(forecast(service, 's-opening', start, now + 60 * 60_000).projectedEnd).toBe(now + 60 * 60_000 + 32 * 60_000)
  })
})
