import {
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
