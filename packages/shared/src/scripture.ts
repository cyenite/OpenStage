import { bibleBooks, bookById, bookName, type BookId } from './bible-books'
import type { DeckSlide } from './library'

export interface PassageRef {
  book: BookId
  /** Null means the whole chapter from verse 1. */
  startVerse: number | null
  /** Null means to the end of `endChapter`. */
  endVerse: number | null
  endChapter: number
  startChapter: number
}

export interface BibleInfo {
  code: string
  name: string
  notice: string
  language: string
}

/** A bundled or imported Bible: books by USFM id, chapters, then verses from verse 1 (index 0). */
export interface BibleText extends BibleInfo {
  books: Partial<Record<BookId, string[][]>>
}

export type ParsedReference = { ok: true; ref: PassageRef } | { ok: false; error: string; suggestions: BookId[] }

const squash = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const aliases = new Map<string, BookId>()
for (const book of bibleBooks) {
  for (const alias of [book.en, book.sw, book.usfm, book.osis, ...book.abbreviations]) aliases.set(squash(alias), book.usfm)
}

/**
 * Reads what an operator types: `jn 3 16-18`, `John 3:16`, `Yohana 3:16-4:2`, `ps 23`, `1 Kor 13 4-7`,
 * `gen 1-2`. Book names and abbreviations work in English and Swahili; a unique start of a name works too.
 */
export function parseReference(input: string): ParsedReference {
  const text = input
    .normalize('NFKC')
    .replace(/[‐-―]/g, '-')
    .trim()
    .replace(/^(iii|ii|i)\s+(?=[a-z])/i, (roman) => String(roman.trim().length))
  const match = /^([1-3]?\s*[^\d\s:.,-][^\d:,-]*?)\.?\s*(\d+)?(?:\s*[\s:.,]\s*(\d+))?(?:\s*-\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$/u.exec(text)
  if (!match) return { ok: false, error: 'Type a book, then chapter and verses, like “jn 3 16-18”.', suggestions: [] }
  const [, rawBook, chapterText, verseText, endText, endVerseText] = match
  const found = findBook(rawBook!)
  if (!found.book) return { ok: false, error: found.error, suggestions: found.suggestions }
  const book = bookById(found.book)!
  const startChapter = chapterText ? Number(chapterText) : 1
  const startVerse = verseText ? Number(verseText) : null
  let endChapter = startChapter
  let endVerse: number | null = startVerse
  if (endText && endVerseText) {
    endChapter = Number(endText)
    endVerse = Number(endVerseText)
  } else if (endText && startVerse === null) {
    endChapter = Number(endText)
  } else if (endText) {
    endVerse = Number(endText)
  }
  if (startChapter < 1 || startChapter > book.chapters || endChapter > book.chapters) {
    return { ok: false, error: `${book.en} has ${book.chapters} ${book.chapters === 1 ? 'chapter' : 'chapters'}.`, suggestions: [] }
  }
  const isBackwards = endChapter < startChapter || (endChapter === startChapter && startVerse !== null && endVerse !== null && endVerse < startVerse)
  if (isBackwards || startVerse === 0) return { ok: false, error: 'The passage ends before it starts.', suggestions: [] }
  return { ok: true, ref: { book: book.usfm, startChapter, startVerse, endChapter, endVerse } }
}

function findBook(raw: string): { book: BookId | null; error: string; suggestions: BookId[] } {
  const key = squash(raw)
  const exact = aliases.get(key)
  if (exact) return { book: exact, error: '', suggestions: [] }
  const starts = bibleBooks.filter((b) => [b.en, b.sw].some((name) => squash(name).startsWith(key)))
  if (key.length >= 2 && starts.length === 1) return { book: starts[0]!.usfm, error: '', suggestions: [] }
  if (starts.length > 1) return { book: null, error: `“${raw.trim()}” could be several books.`, suggestions: starts.slice(0, 6).map((b) => b.usfm) }
  return { book: null, error: `No book called “${raw.trim()}”.`, suggestions: [] }
}

export function formatReference(ref: PassageRef, language = 'en'): string {
  const name = bookName(ref.book, language)
  const { startChapter, startVerse, endChapter, endVerse } = ref
  if (startVerse === null) return endChapter === startChapter ? `${name} ${startChapter}` : `${name} ${startChapter}-${endChapter}`
  if (endChapter !== startChapter) return `${name} ${startChapter}:${startVerse}-${endChapter}:${endVerse ?? 'end'}`
  if (endVerse === null) return `${name} ${startChapter}:${startVerse}-end`
  return endVerse === startVerse ? `${name} ${startChapter}:${startVerse}` : `${name} ${startChapter}:${startVerse}-${endVerse}`
}

export interface VerseRow {
  verse: number
  chapter: number
  texts: Record<string, string | null>
}

/** Every verse a reference covers in one Bible, with null where that Bible lacks the verse. */
export function versesFor(ref: PassageRef, bibles: BibleText[]): VerseRow[] {
  const longest = (chapter: number) => Math.max(0, ...bibles.map((b) => b.books[ref.book]?.[chapter - 1]?.length ?? 0))
  const rows: VerseRow[] = []
  for (let chapter = ref.startChapter; chapter <= ref.endChapter; chapter++) {
    const first = chapter === ref.startChapter ? ref.startVerse ?? 1 : 1
    const last = chapter === ref.endChapter && ref.endVerse !== null ? Math.min(ref.endVerse, longest(chapter)) : longest(chapter)
    for (let verse = first; verse <= last; verse++) {
      const texts = Object.fromEntries(bibles.map((b) => [b.code, b.books[ref.book]?.[chapter - 1]?.[verse - 1] || null]))
      rows.push({ chapter, verse, texts })
    }
  }
  return rows
}

export interface PassageLayout {
  splitLong: boolean
  translations: string[]
  versesPerSlide: number
}

/** A verse whose main text is longer than this becomes two or more slides (5a, 5b). */
export const longVerseCharacters = 220

interface Unit {
  label: string
  verse: number
  chapter: number
  main: string
  secondary: string
  isPart: boolean
}

/**
 * Turns verses into slides: the first translation in the main box, the second under it. Long verses
 * are split at matching points in both languages so they stay aligned; parts never share a slide.
 */
export function passageSlides(ref: PassageRef, rows: VerseRow[], layout: PassageLayout, bibles: BibleInfo[]): DeckSlide[] {
  const [mainCode = '', secondaryCode] = layout.translations
  const language = bibles.find((b) => b.code === mainCode)?.language ?? 'en'
  const missing = (code: string) => `${code} is not installed on this computer`
  const units: Unit[] = []
  for (const row of rows) {
    const main = row.texts[mainCode] ?? (bibles.some((b) => b.code === mainCode) ? '' : missing(mainCode))
    const secondary = secondaryCode ? row.texts[secondaryCode] ?? (bibles.some((b) => b.code === secondaryCode) ? '' : missing(secondaryCode)) : ''
    const parts = layout.splitLong ? Math.ceil(main.length / longVerseCharacters) : 1
    if (parts <= 1) {
      units.push({ label: String(row.verse), verse: row.verse, chapter: row.chapter, main, secondary, isPart: false })
      continue
    }
    const mainParts = splitText(main, parts)
    const secondaryParts = splitText(secondary, parts)
    mainParts.forEach((part, index) => {
      const label = `${row.verse}${String.fromCharCode(97 + index)}`
      units.push({ label, verse: row.verse, chapter: row.chapter, main: part, secondary: secondaryParts[index] ?? '', isPart: true })
    })
  }

  const perSlide = Math.min(Math.max(Math.trunc(layout.versesPerSlide) || 1, 1), 6)
  const groups: Unit[][] = []
  for (const unit of units) {
    const last = groups.at(-1)
    const canJoin = last && !unit.isPart && !last[0]!.isPart && last.length < perSlide && last[0]!.chapter === unit.chapter
    if (canJoin) last.push(unit)
    else groups.push([unit])
  }

  const name = bookName(ref.book, language)
  const codes = layout.translations.slice(0, 2).join(' · ')
  return groups.map((group) => {
    const first = group[0]!
    const last = group.at(-1)!
    const numbered = group.length > 1
    const span = first.label === last.label ? first.label : `${first.label}-${last.label}`
    return {
      kind: 'scripture',
      label: numbered ? `Verses ${span}` : `Verse ${span}`,
      lines: group.map((u) => (numbered ? `${u.verse} ${u.main}` : u.main)),
      secondaryLines: secondaryCode ? group.map((u) => (numbered ? `${u.verse} ${u.secondary}` : u.secondary)) : [],
      reference: `${name} ${first.chapter}:${span} ${codes}`.trim(),
    }
  })
}

/** Cuts text into `parts` pieces of similar length, preferring sentence and clause ends, then spaces. */
export function splitText(text: string, parts: number): string[] {
  if (parts <= 1 || !text) return [text]
  const pieces: string[] = []
  let rest = text
  for (let remaining = parts; remaining > 1; remaining--) {
    const target = rest.length / remaining
    const window = target * 0.4
    let cut = -1
    let best = Infinity
    for (const match of rest.matchAll(/[.;:!?,]["'’”)]?\s/g)) {
      const at = match.index + match[0].length
      const distance = Math.abs(at - target)
      if (distance <= window && distance < best) {
        best = distance
        cut = at
      }
    }
    if (cut < 0) {
      const space = rest.lastIndexOf(' ', Math.round(target))
      cut = space > 0 ? space + 1 : Math.round(target)
    }
    pieces.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut)
  }
  pieces.push(rest.trim())
  return pieces
}
