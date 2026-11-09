import {
  formatReference,
  itemKind,
  itemKinds,
  newId,
  parseReference,
  type BackgroundRender,
  type HeadingKind,
  type Id,
  type InstantSource,
  type ItemKind,
  type OperatorSnapshot,
  type PassageRef,
  type Service,
  type ServiceEdit,
  type ServiceItem,
} from '@openstage/shared'
import { dispatch, useLibrarySearch } from '../engine'

/** Declaration order is chip order. Live filters act on the screens now and never land in the service. */
export const libraryFilters = [
  { key: 'all', label: 'All', isLive: false },
  { key: 'songs', label: 'Songs', isLive: false },
  { key: 'scripture', label: 'Bible', isLive: false },
  { key: 'backgrounds', label: 'Backgrounds', isLive: false },
  { key: 'parts', label: 'Parts', isLive: false },
  { key: 'lowerThirds', label: 'Lower thirds', isLive: true },
  { key: 'audio', label: 'Audio', isLive: true },
] as const

export type LibraryFilter = (typeof libraryFilters)[number]['key']

export type LibraryResult =
  | { filter: 'songs'; key: string; id: Id; title: string; detail: string; snippet: string }
  | { filter: 'scripture'; key: string; id: Id; title: string; detail: string; snippet: string }
  /** A reference typed into the search box, not yet a passage in the library. */
  | { filter: 'scripture'; key: string; ref: PassageRef; text: string; title: string; detail: string; snippet: string; translations?: string[] }
  | { filter: 'backgrounds'; key: string; id: Id; title: string; render: BackgroundRender }
  | { filter: 'parts'; key: string; part: HeadingKind; title: string; detail: string }
  | { filter: 'lowerThirds'; key: string; id: Id; title: string; detail: string }
  | { filter: 'audio'; key: string; id: Id; title: string; detail: string }

/** Where adds go: after `afterItemId`, filling it instead when it is a placeholder of the same kind; at the end when null. */
export interface AddTarget {
  service: Service
  afterItemId: Id | null
  /** The title of the item at `afterItemId`, for button hints. */
  afterTitle: string
  /** The service open in Present: a new item there becomes the selected one, so the next add follows it. */
  isOpen: boolean
}

export const backgroundDragType = 'application/x-openstage-background'

export function swatchCss(render: BackgroundRender): string {
  return render.kind === 'color' ? render.color : `linear-gradient(${render.angle}deg, ${render.from}, ${render.to})`
}

/** The two-letter badge each result shows, matching the service order's. */
export function resultBadge(result: LibraryResult): string {
  if (result.filter === 'parts') return itemKinds.find((k) => k.key === result.part)!.badge
  if (result.filter === 'songs') return itemKinds.find((k) => k.key === 'song')!.badge
  if (result.filter === 'scripture') return itemKinds.find((k) => k.key === 'scripture')!.badge
  return result.filter === 'lowerThirds' ? 'LT' : result.filter === 'audio' ? 'AU' : ''
}

const partKinds = itemKinds.filter((k): k is (typeof itemKinds)[number] & { key: HeadingKind } => k.key !== 'song' && k.key !== 'scripture')

export function useLibraryResults(snapshot: OperatorSnapshot, text: string, filter: LibraryFilter, includeLive: boolean): { results: LibraryResult[]; isFresh: boolean } {
  const query = text.trim()
  const revision = snapshot.libraryRevision
  const ask = (kind: 'songs' | 'passages') => (query ? ({ type: 'library.search', text: query, kind, limit: 40 } as const) : ({ type: 'library.list', kind } as const))
  const { hits: songs, isFresh: hasSongs } = useLibrarySearch(ask('songs'), revision)
  const { hits: passages, isFresh: hasPassages } = useLibrarySearch(ask('passages'), revision)
  const parsed = query ? parseReference(query) : null
  const needle = query.toLowerCase()
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle)
  const { backgrounds, lowerThirds, audioCues } = snapshot.library

  const results: LibraryResult[] = [
    ...(parsed?.ok
      ? [{ filter: 'scripture', key: `ref:${query}`, ref: parsed.ref, text: query, title: formatReference(parsed.ref), detail: 'Typed reference', snippet: '' } as const]
      : []),
    ...songs.map((hit) => ({ filter: 'songs', key: `song:${hit.id}`, id: hit.id, title: hit.title, detail: hit.detail, snippet: hit.snippet }) as const),
    // Every quick verse saves a passage, so the full list would bury everything else until something is typed.
    ...(query || filter === 'scripture'
      ? passages.map((hit) => ({ filter: 'scripture', key: `passage:${hit.id}`, id: hit.id, title: hit.title, detail: hit.detail, snippet: hit.snippet }) as const)
      : []),
    ...backgrounds.filter((b) => matches(b.name)).map((b) => ({ filter: 'backgrounds', key: `bg:${b.id}`, id: b.id, title: b.name, render: b.render }) as const),
    ...partKinds.filter((k) => matches(k.label)).map((k) => ({ filter: 'parts', key: `part:${k.key}`, part: k.key, title: k.label, detail: `Part · ${k.minutes} min` }) as const),
    ...(includeLive
      ? [
          ...lowerThirds.filter((l) => matches(l.title)).map((l) => ({ filter: 'lowerThirds', key: `lt:${l.id}`, id: l.id, title: l.title, detail: l.subtitle }) as const),
          ...audioCues.filter((a) => matches(a.name)).map((a) => ({ filter: 'audio', key: `audio:${a.id}`, id: a.id, title: a.name, detail: 'Playback arrives in phase 3' }) as const),
        ]
      : []),
  ]
  return { results: filter === 'all' ? results : results.filter((r) => r.filter === filter), isFresh: hasSongs && hasPassages }
}

export function targetItem(target: AddTarget): ServiceItem | undefined {
  return target.service.items.find((i) => i.id === target.afterItemId)
}

/** The placeholder the result would fill, if the target is one of its kind. */
function slotFor(result: LibraryResult, target: AddTarget): ServiceItem | undefined {
  const item = targetItem(target)
  if (item?.type !== 'slot') return undefined
  return (item.kind === 'song' && result.filter === 'songs') || (item.kind === 'scripture' && result.filter === 'scripture') ? item : undefined
}

export function actionLabel(result: LibraryResult, target: AddTarget, snapshot: OperatorSnapshot): string {
  if (result.filter === 'backgrounds') return targetItem(target)?.backgroundId === result.id ? 'In use' : 'Use'
  if (result.filter === 'lowerThirds') return snapshot.state.live.lowerThird === result.id ? 'Showing' : 'Show'
  if (result.filter === 'audio') return snapshot.state.live.audio === result.id ? 'Playing' : 'Play'
  return slotFor(result, target) ? 'Fill' : 'Add'
}

export function actionHint(result: LibraryResult, target: AddTarget): string {
  const item = targetItem(target)
  const title = target.afterTitle
  if (result.filter === 'backgrounds') return item ? `Use ${result.title} as the background of ${title}` : `Pick an item to give it ${result.title}`
  if (result.filter === 'lowerThirds' || result.filter === 'audio') return `Show ${result.title} now`
  if (slotFor(result, target)) return `Fill ${title} with ${result.title}`
  return item ? `Add ${result.title} after ${title}` : `Add ${result.title} at the end`
}

/** Carries out a result's action and returns the item it added or filled, if any. */
export function applyResult(result: LibraryResult, target: AddTarget, atEnd = false): Id | null {
  const { service } = target
  const edit = (change: ServiceEdit) => dispatch({ type: 'service.edit', serviceId: service.id, edit: change })
  const afterItemId = atEnd ? undefined : target.afterItemId ?? undefined
  const slot = atEnd ? undefined : slotFor(result, target)
  const itemId = slot ? slot.id : newId(result.title)

  switch (result.filter) {
    case 'songs':
      edit(slot ? { type: 'service.fillSlot', itemId, songId: result.id } : { type: 'service.addSong', itemId, songId: result.id, afterItemId })
      break
    case 'scripture': {
      const passageId = 'ref' in result ? newId(result.title) : result.id
      if ('ref' in result) dispatch({ type: 'passage.create', passageId, ref: result.ref, translations: result.translations ?? service.translations ?? [] })
      edit(slot ? { type: 'service.fillSlot', itemId, passageId } : { type: 'service.addPassage', itemId, passageId, afterItemId })
      break
    }
    case 'parts':
      edit({ type: 'service.addHeading', itemId, kind: result.part, title: result.title, afterItemId })
      break
    case 'backgrounds': {
      const item = targetItem(target)
      if (item) edit({ type: 'service.updateItem', itemId: item.id, changes: { backgroundId: item.backgroundId === result.id ? null : result.id } })
      return null
    }
    case 'lowerThirds':
      dispatch({ type: 'lowerThird.set', lowerThirdId: result.id })
      return null
    case 'audio':
      dispatch({ type: 'audio.set', audioCueId: result.id })
      return null
  }
  if (target.isOpen) dispatch({ type: 'item.select', itemId })
  return itemId
}

/** Adds a song or passage that was opened from the Library to the service, after the selected item. */
export function addInstantToService(source: InstantSource, title: string, target: AddTarget): Id | null {
  if (source.type === 'song') return applyResult({ filter: 'songs', key: source.songId, id: source.songId, title, detail: '', snippet: '' }, target)
  return applyResult({ filter: 'scripture', key: title, ref: source.ref, text: title, title, detail: '', snippet: '', translations: source.translations }, target)
}

/** Drop with Alt for every item of the same kind, with Shift for the whole service. */
export function dropBackground(service: Service, item: ServiceItem, backgroundId: Id, event: { altKey: boolean; shiftKey: boolean }): void {
  const kind: ItemKind = itemKind(item)
  const itemIds = event.shiftKey ? service.items.map((i) => i.id) : event.altKey ? service.items.filter((i) => itemKind(i) === kind).map((i) => i.id) : [item.id]
  dispatch({ type: 'service.edit', serviceId: service.id, edit: { type: 'service.setBackground', itemIds, backgroundId } })
}
