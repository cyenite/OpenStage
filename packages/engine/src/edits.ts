import {
  bookById,
  classicTheme,
  fontFamilies,
  isSafeId,
  keyPrefersFlats,
  parseLyrics,
  parseSlides,
  parseTranslation,
  sectionKinds,
  transposeChord,
  transposeKey,
  type Id,
  type Section,
  type SectionKind,
  type Service,
  type ServiceEdit,
  type SlideContent,
  type BackgroundRender,
  type ItemChanges,
  type PassageEdit,
  type ServiceItem,
  type ServiceTemplate,
  type TemplateEdit,
  type TemplateSlot,
  itemKinds,
  type PassageRef,
  type ScripturePassage,
  type BoxStyle,
  type Song,
  type SongEdit,
  type Theme,
  type ThemeEdit,
} from '@openstage/shared'

const isText = (value: unknown): value is string => typeof value === 'string'
const isLines = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)
const isKind = (value: unknown): value is SectionKind => sectionKinds.some((k) => k.key === value)
const isLanguage = (value: unknown): value is string => isText(value) && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(value)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const metaValidators: Record<keyof Song['meta'], (value: unknown) => boolean> = {
  key: isText,
  ccli: isText,
  tempo: (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
  authors: isLines,
  copyright: isText,
}

export function createSong(id: Id, title: string, lyrics: string, language: string): Song {
  const parsed = parseLyrics(isText(lyrics) ? lyrics : '')
  const found = parsed.sections.length > 0 ? parsed.sections : [{ kind: 'verse' as const, label: 'Verse 1', slides: [] }]
  const sectionIds = found.map((_, index) => `s${index + 1}`)
  const order = parsed.sections.length > 0 ? parsed.order : [0]
  return {
    id,
    title: (isText(title) && title.trim()) || 'Untitled song',
    languages: [isLanguage(language) ? language : 'en'],
    meta: { authors: [], copyright: '' },
    sections: Object.fromEntries(found.map((section, index) => [sectionIds[index]!, { id: sectionIds[index]!, ...section }])),
    arrangements: [{ id: 'default', name: 'Default', sectionIds: order.map((index) => sectionIds[index]!) }],
  }
}

/** Pure, and returns the same song when an edit changes nothing or is invalid, so no-ops never reach the undo log. */
export function applySongEdit(song: Song, edit: SongEdit): Song {
  switch (edit.type) {
    case 'song.setTitle': {
      const title = isText(edit.title) ? edit.title.trim() : ''
      return title && title !== song.title ? { ...song, title } : song
    }
    case 'song.setMeta': {
      const changes = Object.entries(edit.meta ?? {}).filter(
        ([key, value]) =>
          Object.hasOwn(metaValidators, key) &&
          metaValidators[key as keyof Song['meta']](value) &&
          !same(song.meta[key as keyof Song['meta']], value),
      )
      return changes.length > 0 ? { ...song, meta: { ...song.meta, ...Object.fromEntries(changes) } } : song
    }
    case 'song.setLanguages':
      return setLanguages(song, edit.languages)
    case 'song.transpose':
      return transpose(song, edit.semitones)
    case 'song.setSectionText': {
      const section = Object.hasOwn(song.sections, edit.sectionId) ? song.sections[edit.sectionId] : undefined
      if (!section || !isText(edit.text)) return song
      const slides = edit.language === null ? withMainText(section.slides, edit.text) : withTranslation(song, section.slides, edit.language, edit.text)
      return slides && !same(slides, section.slides) ? withSection(song, { ...section, slides }) : song
    }
    case 'song.addSection': {
      if (!isSafeId(edit.sectionId) || Object.hasOwn(song.sections, edit.sectionId) || !isKind(edit.kind)) return song
      const label = isText(edit.label) ? edit.label.trim() : ''
      if (!label) return song
      const added = withSection(song, { id: edit.sectionId, kind: edit.kind, label, slides: [] })
      const arrangements = added.arrangements.map((a) => (a.id === edit.arrangementId ? { ...a, sectionIds: [...a.sectionIds, edit.sectionId] } : a))
      return { ...added, arrangements }
    }
    case 'song.updateSection': {
      const section = Object.hasOwn(song.sections, edit.sectionId) ? song.sections[edit.sectionId] : undefined
      const label = isText(edit.label) ? edit.label.trim() : ''
      if (!section || !label || !isKind(edit.kind) || (section.label === label && section.kind === edit.kind)) return song
      return withSection(song, { ...section, kind: edit.kind, label })
    }
    case 'song.removeSection': {
      if (!Object.hasOwn(song.sections, edit.sectionId)) return song
      const { [edit.sectionId]: _removed, ...sections } = song.sections
      const arrangements = song.arrangements.map((a) => ({ ...a, sectionIds: a.sectionIds.filter((id) => id !== edit.sectionId) }))
      return { ...song, sections, arrangements }
    }
    case 'song.setArrangement': {
      const name = isText(edit.name) ? edit.name.trim() : ''
      if (!isSafeId(edit.arrangementId) || !name || !isLines(edit.sectionIds)) return song
      const arrangement = { id: edit.arrangementId, name, sectionIds: edit.sectionIds.filter((id) => Object.hasOwn(song.sections, id)) }
      const index = song.arrangements.findIndex((a) => a.id === arrangement.id)
      if (index >= 0 && same(song.arrangements[index], arrangement)) return song
      const arrangements = index >= 0 ? song.arrangements.with(index, arrangement) : [...song.arrangements, arrangement]
      return { ...song, arrangements }
    }
    case 'song.setTheme': {
      if (edit.themeId === null) {
        if (song.themeId === undefined) return song
        const { themeId: _old, ...rest } = song
        return rest
      }
      return isSafeId(edit.themeId) && edit.themeId !== song.themeId ? { ...song, themeId: edit.themeId } : song
    }
    case 'song.removeArrangement': {
      const arrangements = song.arrangements.filter((a) => a.id !== edit.arrangementId)
      return arrangements.length > 0 && arrangements.length < song.arrangements.length ? { ...song, arrangements } : song
    }
    default:
      return song
  }
}

export function applyServiceEdit(service: Service, edit: ServiceEdit): Service {
  switch (edit.type) {
    case 'service.addSong': {
      const isTaken = service.items.some((i) => i.id === edit.itemId)
      if (!isSafeId(edit.itemId) || isTaken || !isSafeId(edit.songId) || !isSafeId(edit.arrangementId)) return service
      return { ...service, items: [...service.items, { id: edit.itemId, type: 'song', songId: edit.songId, arrangementId: edit.arrangementId }] }
    }
    case 'service.addPassage': {
      const isTaken = service.items.some((i) => i.id === edit.itemId)
      if (!isSafeId(edit.itemId) || isTaken || !isSafeId(edit.passageId)) return service
      const after = service.items.findIndex((i) => i.id === edit.afterItemId)
      const at = after >= 0 ? after + 1 : service.items.length
      return { ...service, items: service.items.toSpliced(at, 0, { id: edit.itemId, type: 'scripture', passageId: edit.passageId }) }
    }
    case 'service.setTranslations':
      return isCodes(edit.translations) && !same(edit.translations, service.translations) ? { ...service, translations: edit.translations } : service
    case 'service.setDetails': {
      const name = edit.name === undefined ? service.name : isText(edit.name) ? edit.name.trim() : ''
      const date = edit.date === undefined ? service.date : edit.date
      const time = edit.time === undefined ? service.time : edit.time
      if (!name || (date !== undefined && !isDate(date)) || (time !== undefined && !isTime(time))) return service
      const next = { ...service, name, ...(date !== undefined && { date }), ...(time !== undefined && { time }) }
      return same(next, service) ? service : next
    }
    case 'service.setTeam': {
      const team = edit.team && typeof edit.team === 'object' ? edit.team : null
      if (!team || !Object.values(team).every((v) => v === undefined || (isText(v) && v.length <= 80))) return service
      const cleaned = Object.fromEntries(Object.entries({ ...service.team, ...team }).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v))
      return same(cleaned, service.team ?? {}) ? service : { ...service, team: cleaned }
    }
    case 'service.moveItem': {
      const from = service.items.findIndex((i) => i.id === edit.itemId)
      const to = Math.trunc(edit.toIndex)
      if (from < 0 || !Number.isInteger(to) || to < 0 || to >= service.items.length || to === from) return service
      const items = [...service.items]
      const [moved] = items.splice(from, 1)
      items.splice(to, 0, moved!)
      return { ...service, items }
    }
    case 'service.addHeading': {
      const kind: string = edit.kind
      const isKind = kind !== 'song' && kind !== 'scripture' && itemKinds.some((k) => k.key === kind)
      const title = isText(edit.title) ? edit.title.trim() : ''
      if (!isSafeId(edit.itemId) || service.items.some((i) => i.id === edit.itemId) || !isKind || !title) return service
      const after = service.items.findIndex((i) => i.id === edit.afterItemId)
      const at = after >= 0 ? after + 1 : service.items.length
      return { ...service, items: service.items.toSpliced(at, 0, { id: edit.itemId, type: 'heading', kind: edit.kind, title }) }
    }
    case 'service.updateItem': {
      const index = service.items.findIndex((i) => i.id === edit.itemId)
      const item = service.items[index]
      const updated = item && withItemChanges(item, edit.changes)
      return updated && !same(updated, item) ? { ...service, items: service.items.with(index, { ...updated, isLinked: false }) } : service
    }
    case 'service.fillSlot': {
      const index = service.items.findIndex((i) => i.id === edit.itemId)
      const slot = service.items[index]
      if (!slot || slot.type !== 'slot') return service
      const { id, minutes, notes, slotId, themeId } = slot
      const base = { id, ...(minutes !== undefined && { minutes }), ...(notes && { notes }), ...(slotId && { slotId }), ...(themeId && { themeId }), isLinked: false }
      if (slot.kind === 'song' && isSafeId(edit.songId) && isSafeId(edit.arrangementId)) {
        return { ...service, items: service.items.with(index, { ...base, type: 'song', songId: edit.songId, arrangementId: edit.arrangementId }) }
      }
      if (slot.kind === 'scripture' && isSafeId(edit.passageId)) {
        return { ...service, items: service.items.with(index, { ...base, type: 'scripture', passageId: edit.passageId }) }
      }
      return service
    }
    case 'service.setTheme':
      return isSafeId(edit.themeId) && edit.themeId !== service.themeId ? { ...service, themeId: edit.themeId } : service
    case 'service.removeItem': {
      const items = service.items.filter((i) => i.id !== edit.itemId)
      return items.length < service.items.length ? { ...service, items } : service
    }
    default:
      return service
  }
}

const isDate = (value: unknown): value is string => isText(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
const isTime = (value: unknown): value is string => isText(value) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const isMinutes = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 600

function withItemChanges(item: ServiceItem, changes: ItemChanges): ServiceItem | null {
  if (!changes || typeof changes !== 'object') return null
  let next: ServiceItem = { ...item }
  const drop = <K extends keyof ServiceItem>(key: K) => {
    const { [key]: _gone, ...rest } = next
    next = rest as ServiceItem
  }
  if (changes.minutes === null) drop('minutes')
  else if (changes.minutes !== undefined) {
    if (!isMinutes(changes.minutes)) return null
    next.minutes = Math.round(changes.minutes * 10) / 10
  }
  if (changes.notes !== undefined) {
    if (!isText(changes.notes) || changes.notes.length > 4000) return null
    if (changes.notes.trim()) next.notes = changes.notes
    else drop('notes')
  }
  if (changes.themeId === null) drop('themeId')
  else if (changes.themeId !== undefined) {
    if (!isSafeId(changes.themeId)) return null
    next.themeId = changes.themeId
  }
  if (changes.title !== undefined) {
    const title = isText(changes.title) ? changes.title.trim() : ''
    if (!title || (next.type !== 'heading' && next.type !== 'slot')) return null
    next = { ...next, title }
  }
  if (changes.arrangementId !== undefined) {
    if (next.type !== 'song' || !isSafeId(changes.arrangementId)) return null
    next = { ...next, arrangementId: changes.arrangementId }
  }
  if (changes.languages !== undefined) {
    if (next.type !== 'song') return null
    if (changes.languages === null) {
      const { languages: _gone, ...rest } = next
      next = rest
    } else if (Array.isArray(changes.languages) && changes.languages.length > 0 && changes.languages.every((l) => isLanguage(l))) {
      next = { ...next, languages: changes.languages }
    } else {
      return null
    }
  }
  return next
}

export function createTemplate(id: Id, name: string, from: ServiceTemplate | undefined): ServiceTemplate {
  const base: ServiceTemplate = from ? structuredClone(from) : { id, name, color: '#F2A93B', slots: [] }
  return { ...base, id, name: (isText(name) && name.trim()) || (from ? `${from.name} copy` : 'New template') }
}

function isSlot(slot: unknown): slot is TemplateSlot {
  const s = slot as TemplateSlot
  return (
    !!s &&
    isSafeId(s.id) &&
    itemKinds.some((k) => k.key === s.kind) &&
    isText(s.title) &&
    s.title.trim().length > 0 &&
    isText(s.rule) &&
    isMinutes(s.minutes) &&
    (s.songId === undefined || isSafeId(s.songId)) &&
    (s.passageId === undefined || isSafeId(s.passageId))
  )
}

export function applyTemplateEdit(template: ServiceTemplate, edit: TemplateEdit): ServiceTemplate {
  switch (edit.type) {
    case 'template.setDetails': {
      const name = edit.name === undefined ? template.name : isText(edit.name) ? edit.name.trim() : ''
      if (!name || (edit.color !== undefined && !isColor(edit.color)) || (edit.time !== undefined && !isTime(edit.time))) return template
      const next = { ...template, name, ...(edit.color !== undefined && { color: edit.color }), ...(edit.time !== undefined && { time: edit.time }) }
      return same(next, template) ? template : next
    }
    case 'template.addSlot': {
      if (!isSlot(edit.slot) || template.slots.some((s) => s.id === edit.slot.id)) return template
      const after = template.slots.findIndex((s) => s.id === edit.afterSlotId)
      return { ...template, slots: template.slots.toSpliced(after >= 0 ? after + 1 : template.slots.length, 0, edit.slot) }
    }
    case 'template.updateSlot': {
      const index = template.slots.findIndex((s) => s.id === edit.slotId)
      const slot = template.slots[index]
      if (!slot || !edit.changes || typeof edit.changes !== 'object') return template
      const { id: _id, ...changes } = edit.changes as TemplateSlot
      const next = { ...slot, ...changes, id: slot.id }
      if (next.kind !== 'song') delete next.songId
      if (next.kind !== 'scripture') delete next.passageId
      return isSlot(next) && !same(next, slot) ? { ...template, slots: template.slots.with(index, next) } : template
    }
    case 'template.removeSlot': {
      const slots = template.slots.filter((s) => s.id !== edit.slotId)
      return slots.length < template.slots.length ? { ...template, slots } : template
    }
    case 'template.moveSlot': {
      const from = template.slots.findIndex((s) => s.id === edit.slotId)
      const to = Math.trunc(edit.toIndex)
      if (from < 0 || !Number.isInteger(to) || to < 0 || to >= template.slots.length || to === from) return template
      const slots = [...template.slots]
      const [moved] = slots.splice(from, 1)
      slots.splice(to, 0, moved!)
      return { ...template, slots }
    }
    default:
      return template
  }
}

const isCodes = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.length <= 4 && value.every((c) => isText(c) && /^[A-Za-z0-9_-]{1,16}$/.test(c)) && new Set(value).size === value.length

export function isPassageRef(ref: unknown): ref is PassageRef {
  const r = ref as PassageRef
  const book = r && typeof r === 'object' ? bookById(r.book) : undefined
  const isChapter = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= (book?.chapters ?? 0)
  const isVerse = (n: unknown) => n === null || (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 200)
  return !!book && isChapter(r.startChapter) && isChapter(r.endChapter) && r.endChapter >= r.startChapter && isVerse(r.startVerse) && isVerse(r.endVerse)
}

export function createPassage(id: Id, ref: PassageRef, translations: string[]): ScripturePassage {
  return { id, ref, translations, versesPerSlide: 1, splitLong: true }
}

export function applyPassageEdit(passage: ScripturePassage, edit: PassageEdit): ScripturePassage {
  switch (edit.type) {
    case 'passage.setRef':
      return isPassageRef(edit.ref) && !same(edit.ref, passage.ref) ? { ...passage, ref: edit.ref } : passage
    case 'passage.setTranslations':
      return isCodes(edit.translations) && !same(edit.translations, passage.translations) ? { ...passage, translations: edit.translations } : passage
    case 'passage.setVersesPerSlide': {
      const isValid = Number.isInteger(edit.versesPerSlide) && edit.versesPerSlide >= 1 && edit.versesPerSlide <= 6
      return isValid && edit.versesPerSlide !== passage.versesPerSlide ? { ...passage, versesPerSlide: edit.versesPerSlide } : passage
    }
    case 'passage.setSplitLong':
      return typeof edit.splitLong === 'boolean' && edit.splitLong !== passage.splitLong ? { ...passage, splitLong: edit.splitLong } : passage
    default:
      return passage
  }
}

export function createTheme(id: Id, name: string, from: Theme | undefined): Theme {
  const base = from ?? classicTheme
  return { ...structuredClone(base), id, name: (isText(name) && name.trim()) || `${base.name} copy` }
}

export function applyThemeEdit(theme: Theme, edit: ThemeEdit): Theme {
  switch (edit.type) {
    case 'theme.setName': {
      const name = isText(edit.name) ? edit.name.trim() : ''
      return name && name !== theme.name ? { ...theme, name } : theme
    }
    case 'theme.setFill':
      return isFill(edit.fill) && !same(edit.fill, theme.fill) ? { ...theme, fill: edit.fill } : theme
    case 'theme.setBox': {
      if (!Object.hasOwn(theme.boxes, edit.role) || !edit.style || typeof edit.style !== 'object') return theme
      const current = theme.boxes[edit.role]
      const { font = {}, frame = {}, ...rest } = edit.style
      const next: BoxStyle = { ...current, ...rest, font: { ...current.font, ...font }, frame: clampFrame({ ...current.frame, ...frame }) }
      return isBoxStyle(next) && !same(next, current) ? { ...theme, boxes: { ...theme.boxes, [edit.role]: next } } : theme
    }
    default:
      return theme
  }
}

const isColor = (value: unknown): value is string =>
  isText(value) && /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i.test(value)
const isNumberIn = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

function isFill(fill: unknown): fill is BackgroundRender | null {
  if (fill === null) return true
  const f = fill as BackgroundRender
  if (f?.kind === 'color') return isColor(f.color)
  return f?.kind === 'gradient' && isColor(f.from) && isColor(f.to) && isNumberIn(f.angle, -360, 360)
}

function isBoxStyle(style: BoxStyle): boolean {
  const { font, align, color, hasShadow, backing } = style
  const isFamily = fontFamilies.some((f) => f.key === font.family) || (isText(font.family) && /^[\w '",-]{1,100}$/.test(font.family))
  return (
    isFamily &&
    isNumberIn(font.weight, 100, 900) &&
    isNumberIn(font.size, 0.01, 0.3) &&
    typeof font.italic === 'boolean' &&
    ['left', 'center', 'right'].includes(align) &&
    isColor(color) &&
    typeof hasShadow === 'boolean' &&
    (backing === null || isColor(backing))
  )
}

/** Keeps a box on screen and at least 2% of it in each direction, whatever the editor sends. */
function clampFrame(frame: BoxStyle['frame']): BoxStyle['frame'] {
  const valid = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback)
  const w = Math.min(Math.max(valid(frame.w, 0.5), 0.02), 1)
  const h = Math.min(Math.max(valid(frame.h, 0.2), 0.02), 1)
  const x = Math.min(Math.max(valid(frame.x, 0), 0), 1 - w)
  const y = Math.min(Math.max(valid(frame.y, 0), 0), 1 - h)
  return { x, y, w, h }
}

function withSection(song: Song, section: Section): Song {
  return { ...song, sections: { ...song.sections, [section.id]: section } }
}

/** Main text decides how many slides there are; translations and notes stay with their slide by position. */
function withMainText(slides: SlideContent[], text: string): SlideContent[] {
  return parseSlides(text).map((lines, index) => ({ ...slides[index], lines }))
}

function withTranslation(song: Song, slides: SlideContent[], language: string, text: string): SlideContent[] | null {
  if (!song.languages.slice(1).includes(language)) return null
  const blocks = parseTranslation(text)
  return Array.from({ length: Math.max(slides.length, blocks.length) }, (_, index) => {
    const slide = slides[index] ?? { lines: [] }
    const { [language]: _old, ...others } = slide.translations ?? {}
    const lines = blocks[index] ?? []
    const translations = lines.length > 0 ? { ...others, [language]: lines } : others
    const { translations: _previous, ...rest } = slide
    return Object.keys(translations).length > 0 ? { ...rest, translations } : rest
  })
}

function setLanguages(song: Song, languages: unknown): Song {
  if (!Array.isArray(languages) || languages.length === 0 || !languages.every(isLanguage) || new Set(languages).size !== languages.length) return song
  if (same(languages, song.languages)) return song
  const kept = new Set(languages.slice(1))
  const strip = (slide: SlideContent): SlideContent => {
    if (!slide.translations) return slide
    const translations = Object.fromEntries(Object.entries(slide.translations).filter(([code]) => kept.has(code)))
    const { translations: _old, ...rest } = slide
    return Object.keys(translations).length > 0 ? { ...rest, translations } : rest
  }
  const sections = Object.fromEntries(Object.entries(song.sections).map(([id, s]) => [id, { ...s, slides: s.slides.map(strip) }]))
  return { ...song, languages, sections }
}

function transpose(song: Song, semitones: unknown): Song {
  if (!Number.isInteger(semitones) || semitones === 0 || Math.abs(semitones as number) > 11) return song
  const steps = semitones as number
  const key = song.meta.key ? transposeKey(song.meta.key, steps) : undefined
  const slides = Object.values(song.sections).flatMap((s) => s.slides)
  if (!key && !slides.some((slide) => slide.lines.some((line) => line.chords.length > 0))) return song
  const isFlat = key ? keyPrefersFlats(key) : slides.some((slide) => slide.lines.some((line) => line.chords.some((c) => /^[A-G]b/.test(c.chord))))
  const shift = (slide: SlideContent): SlideContent => ({
    ...slide,
    lines: slide.lines.map((line) => ({ ...line, chords: line.chords.map((c) => ({ ...c, chord: transposeChord(c.chord, steps, isFlat) })) })),
  })
  const sections = Object.fromEntries(Object.entries(song.sections).map(([id, s]) => [id, { ...s, slides: s.slides.map(shift) }]))
  return { ...song, meta: key ? { ...song.meta, key } : song.meta, sections }
}
