import { classicTheme, parseReference, themeBoxRoles, type ScripturePassage, type Chord, type DocumentKind, type DocumentTypes, type SlideContent, type Song, type TextLine, type Theme } from '@openstage/shared'

type Loose<T> = { [K in keyof T]?: unknown }

/**
 * Brings a document written by an older version up to the current shape as it loads. The file
 * itself is only rewritten by the next real edit.
 */
export function upgradeDocument<K extends DocumentKind>(kind: K, document: DocumentTypes[K]): DocumentTypes[K] {
  if (kind === 'songs') return upgradeSong(document as Song) as DocumentTypes[K]
  if (kind === 'themes') return completeTheme(document as Theme) as DocumentTypes[K]
  if (kind === 'passages') return upgradePassage(document as ScripturePassage) as DocumentTypes[K]
  return document
}

/** A hand-edited theme missing a box or a field takes the classic theme's, so layout never meets a hole. */
function completeTheme(theme: Theme): Theme {
  const raw = theme as Loose<Theme> & Theme
  const boxes = Object.fromEntries(
    themeBoxRoles.map(({ key }) => {
      const base = classicTheme.boxes[key]
      const own = (raw.boxes as Partial<Theme['boxes']>)[key] ?? base
      return [key, { ...base, ...own, font: { ...base.font, ...own.font }, frame: { ...base.frame, ...own.frame } }]
    }),
  ) as Theme['boxes']
  const overrides = raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {}
  return { ...theme, fill: raw.fill ?? null, boxes, overrides }
}

/** Step 1 passages held a reference string and their verse text; now the text comes from the installed Bibles. */
function upgradePassage(passage: ScripturePassage): ScripturePassage {
  const raw = passage as Loose<ScripturePassage> & ScripturePassage & { reference?: unknown; verses?: unknown }
  const parsed = !raw.ref && typeof raw.reference === 'string' ? parseReference(raw.reference) : null
  const { reference: _reference, verses: _verses, ...rest } = raw
  return {
    ...rest,
    ref: parsed?.ok ? parsed.ref : raw.ref,
    translations: raw.translations.filter((t): t is string => typeof t === 'string'),
    versesPerSlide: typeof raw.versesPerSlide === 'number' ? raw.versesPerSlide : 1,
    splitLong: typeof raw.splitLong === 'boolean' ? raw.splitLong : true,
  }
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
