import type { Chord, DocumentKind, DocumentTypes, SlideContent, Song, TextLine } from '@openstage/shared'

type Loose<T> = { [K in keyof T]?: unknown }

/**
 * Brings a document written by an older version up to the current shape as it loads. The file
 * itself is only rewritten by the next real edit.
 */
export function upgradeDocument<K extends DocumentKind>(kind: K, document: DocumentTypes[K]): DocumentTypes[K] {
  return kind === 'songs' ? (upgradeSong(document as Song) as DocumentTypes[K]) : document
}

function upgradeSong(song: Song): Song {
  const raw = song as Loose<Song> & Song
  const languages = Array.isArray(raw.languages) && raw.languages.length > 0 ? raw.languages.filter((l) => typeof l === 'string') : ['en']
  const authors = Array.isArray(raw.meta.authors) ? raw.meta.authors.filter((a) => typeof a === 'string') : []
  const sections = Object.fromEntries(
    Object.entries(raw.sections).map(([id, section]) => [id, { ...section, slides: Array.isArray(section.slides) ? section.slides.map(upgradeSlide) : [] }]),
  )
  return { ...song, languages, meta: { ...song.meta, authors, copyright: typeof song.meta.copyright === 'string' ? song.meta.copyright : '' }, sections }
}

function upgradeSlide(slide: SlideContent): SlideContent {
  const lines = Array.isArray(slide.lines) ? slide.lines.map(upgradeLine) : []
  return { ...slide, lines }
}

function upgradeLine(line: unknown): TextLine {
  if (typeof line === 'string') return { text: line, chords: [] }
  const raw = (line ?? {}) as Loose<TextLine>
  const chords = Array.isArray(raw.chords) ? raw.chords.filter((c): c is Chord => typeof c?.chord === 'string' && Number.isInteger(c?.offset)) : []
  return { text: typeof raw.text === 'string' ? raw.text : '', chords }
}
