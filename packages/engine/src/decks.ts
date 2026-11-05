import { lookup, type Deck, type DeckSlide, type Library, type Service, type ServiceItem, type SlideRef } from '@openstage/shared'

export function buildDecks(service: Service, library: Library): Deck[] {
  return service.items.map((item) => buildDeck(item, service, library))
}

function buildDeck(item: ServiceItem, service: Service, library: Library): Deck {
  const serviceThemeId = service.themeId ?? null
  if (item.type === 'scripture') {
    const passage = lookup(library.passages, item.passageId)
    if (!passage) return { itemId: item.id, themeId: serviceThemeId, title: 'Missing passage', subtitle: item.passageId, slides: [] }
    const [main = '', secondary] = passage.translations
    const book = passage.reference.replace(/:.*$/, '')
    const slides: DeckSlide[] = passage.verses.map((verse) => ({
      kind: 'scripture',
      label: `Verse ${verse.number}`,
      lines: [verse.text[main] ?? ''],
      reference: `${book}:${verse.number} ${passage.translations.join(' · ')}`,
      secondaryLines: secondary ? [verse.text[secondary] ?? ''] : [],
    }))
    return { itemId: item.id, themeId: serviceThemeId, title: passage.reference, subtitle: passage.translations.join(' + '), slides }
  }

  const song = lookup(library.songs, item.songId)
  if (!song) return { itemId: item.id, themeId: serviceThemeId, title: 'Missing song', subtitle: item.songId, slides: [] }
  const arrangement = song.arrangements.find((a) => a.id === item.arrangementId) ?? song.arrangements[0]
  const secondary = song.languages[1]
  const slides: DeckSlide[] = []
  for (const sectionId of arrangement?.sectionIds ?? []) {
    const section = lookup(song.sections, sectionId)
    if (!section) continue
    for (const slide of section.slides) {
      const lines = slide.lines.map((line) => line.text)
      const secondaryLines = secondary ? slide.translations?.[secondary] ?? [] : []
      slides.push({ kind: section.kind, label: section.label, lines, reference: '', secondaryLines })
    }
  }
  const subtitle = [song.meta.authors.join(', '), song.meta.copyright, `Arrangement: ${arrangement?.name ?? 'none'}`]
  return { itemId: item.id, themeId: song.themeId ?? serviceThemeId, title: song.title, subtitle: subtitle.join(' · '), slides }
}

export function findDeck(decks: Deck[], ref: SlideRef | null): Deck | null {
  return ref ? decks.find((d) => d.itemId === ref.itemId) ?? null : null
}

export function findSlide(decks: Deck[], ref: SlideRef | null): DeckSlide | null {
  if (!ref) return null
  return decks.find((d) => d.itemId === ref.itemId)?.slides[ref.index] ?? null
}
