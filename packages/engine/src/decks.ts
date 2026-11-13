import {
  formatReference,
  itemKind,
  itemMinutes,
  lookup,
  mediaUrl,
  pageRender,
  pageText,
  passageSlides,
  versesFor,
  type BibleText,
  type Deck,
  type DeckSlide,
  type Id,
  type InstantSource,
  type Library,
  type Presentation,
  type ScripturePassage,
  type Service,
  type ServiceItem,
  type SlideContent,
  type SlideRef,
  type Song,
} from '@openstage/shared'

export function buildDecks(service: Service, library: Library, bibles: BibleText[] = []): Deck[] {
  return service.items.map((item) => buildDeck(item, service, library, bibles))
}

/** Decks for what Preview and Live show from the library; they take the service's theme like its own items. */
export function buildInstantDecks(instant: Record<Id, InstantSource>, service: Service, library: Library, bibles: BibleText[] = []): Deck[] {
  return Object.entries(instant).map(([id, source]) => {
    if (source.type === 'song') {
      const arrangementId = source.arrangementId ?? lookup(library.songs, source.songId)?.arrangements[0]?.id ?? ''
      return buildDeck({ id, type: 'song', songId: source.songId, arrangementId }, service, library, bibles)
    }
    if (source.type === 'presentation') return buildDeck({ id, type: 'presentation', presentationId: source.presentationId }, service, library, bibles)
    const passage: ScripturePassage = { id, ref: source.ref, splitLong: true, translations: source.translations, versesPerSlide: source.versesPerSlide }
    const language = bibles.find((b) => b.code === source.translations[0])?.language ?? 'en'
    const base = { itemId: id, kind: 'scripture' as const, notes: '', minutes: 0, musicalKey: '', themeId: service.themeId ?? null, backgroundId: null, isPlaceholder: false }
    return { ...base, title: formatReference(source.ref, language), subtitle: source.translations.join(' + '), slides: scriptureSlides(passage, bibles) }
  })
}

export function scriptureSlides(passage: ScripturePassage, bibles: BibleText[]): DeckSlide[] {
  const chosen = passage.translations.flatMap((code) => bibles.filter((b) => b.code === code))
  return passageSlides(passage.ref, versesFor(passage.ref, chosen), passage, bibles)
}

/** A song's lines in one of its languages: its main lines, or a translation by code. */
function linesIn(song: Song, slide: SlideContent, language: string | undefined): string[] {
  if (!language) return []
  return language === song.languages[0] ? slide.lines.map((line) => line.text) : slide.translations?.[language] ?? []
}

function buildDeck(item: ServiceItem, service: Service, library: Library, bibles: BibleText[]): Deck {
  const base = {
    itemId: item.id,
    kind: itemKind(item),
    notes: item.notes ?? '',
    minutes: itemMinutes(item),
    musicalKey: '',
    themeId: item.themeId ?? service.themeId ?? null,
    backgroundId: item.backgroundId ?? null,
    isPlaceholder: false,
  }

  if (item.type === 'heading') return { ...base, isPlaceholder: true, title: item.title, subtitle: 'No slides', slides: [] }
  if (item.type === 'slot') return { ...base, isPlaceholder: true, title: item.title, subtitle: item.rule || `Choose a ${item.kind}`, slides: [] }

  if (item.type === 'scripture') {
    const passage = lookup(library.passages, item.passageId)
    if (!passage?.ref) return { ...base, title: 'Missing passage', subtitle: item.passageId, slides: [] }
    const language = bibles.find((b) => b.code === passage.translations[0])?.language ?? 'en'
    return { ...base, title: formatReference(passage.ref, language), subtitle: passage.translations.join(' + '), slides: scriptureSlides(passage, bibles) }
  }

  if (item.type === 'presentation') {
    const presentation = lookup(library.presentations, item.presentationId)
    if (!presentation) return { ...base, title: 'Missing slides', subtitle: item.presentationId, slides: [] }
    const pages = presentation.pages.length
    return { ...base, isLooping: presentation.isLooping, title: presentation.title, subtitle: `${pages} ${pages === 1 ? 'page' : 'pages'}${presentation.isLooping ? ' · loops' : ''}`, slides: presentationSlides(presentation, library) }
  }

  const song = lookup(library.songs, item.songId)
  if (!song) return { ...base, title: 'Missing song', subtitle: item.songId, slides: [] }
  const arrangement = song.arrangements.find((a) => a.id === item.arrangementId) ?? song.arrangements[0]
  const [main, secondary] = item.languages?.filter((l) => song.languages.includes(l)) ?? song.languages
  const slides: DeckSlide[] = []
  for (const sectionId of arrangement?.sectionIds ?? []) {
    const section = lookup(song.sections, sectionId)
    if (!section) continue
    for (const slide of section.slides) {
      slides.push({ kind: section.kind, label: section.label, lines: linesIn(song, slide, main), reference: '', secondaryLines: linesIn(song, slide, secondary) })
    }
  }
  const subtitle = [song.meta.authors.join(', '), song.meta.copyright, `Arrangement: ${arrangement?.name ?? 'none'}`]
  const themeId = item.themeId ?? song.themeId ?? service.themeId ?? null
  return { ...base, themeId, musicalKey: song.meta.key ?? '', title: song.title, subtitle: subtitle.join(' · '), slides }
}

export function findDeck(decks: Deck[], ref: SlideRef | null): Deck | null {
  return ref ? decks.find((d) => d.itemId === ref.itemId) ?? null : null
}

export function findSlide(decks: Deck[], ref: SlideRef | null): DeckSlide | null {
  if (!ref) return null
  return decks.find((d) => d.itemId === ref.itemId)?.slides[ref.index] ?? null
}

/** A media item's URL for outputs, or null when the item is gone. */
export const mediaSource = (library: Library) => (mediaId: Id) => {
  const item = lookup(library.media, mediaId)
  return item ? mediaUrl(item.file) : null
}

export function presentationSlides(presentation: Presentation, library: Library): DeckSlide[] {
  const src = mediaSource(library)
  return presentation.pages.map((page) => ({
    kind: 'other',
    label: page.name,
    lines: pageText(page),
    secondaryLines: [],
    reference: '',
    page: pageRender(page, src),
    advanceAfter: page.advanceAfter,
  }))
}
