import { SaxesParser, type SaxesTagPlain } from 'saxes'
import { bibleBooks, type BibleInfo, type BibleText, type BookId } from '@openstage/shared'

export type BibleFormat = 'osis' | 'usfx' | 'usx' | 'zefania'

const byOsis = new Map<string, BookId>(bibleBooks.map((b) => [b.osis, b.usfm]))
const chapterCounts = new Map<string, number>(bibleBooks.map((b) => [b.usfm, b.chapters]))

/** The longest chapter (Psalm 119) has 176 verses; anything past this is a damaged or hostile file. */
const verseLimit = 200

/** Keeps a damaged or crafted file from creating huge sparse arrays: chapters within the book, verses within reason. */
function isInRange(book: BookId, chapter: number, verse: number): boolean {
  return Number.isInteger(chapter) && Number.isInteger(verse) && chapter >= 1 && verse >= 1 && chapter <= (chapterCounts.get(book) ?? 0) && verse <= verseLimit
}
const byUsfm = new Set<string>(bibleBooks.map((b) => b.usfm))

/** Footnotes, cross references, headings and titles are not verse text. */
const skipped: Record<BibleFormat, Set<string>> = {
  osis: new Set(['note', 'title', 'reference']),
  usfx: new Set(['f', 'x', 'fe', 'ef', 'ex', 's', 'd', 'h', 'toc', 'id', 'ide', 'rem', 'periph', 'ms', 'mr', 'r', 'sr']),
  usx: new Set(['note', 'figure', 'sidebar', 'ref']),
  zefania: new Set(['NOTE', 'XREF', 'CAPTION', 'REMARK']),
}

/** USX paragraph styles that are headings, titles or introductions rather than verse text. */
const usxHeadingStyles = /^(s\d?|ms\d?|mr|r|d|sp|sr|h\d?|toc\d|toca\d|mt\d?|mte\d?|imt\d?|ip|ipi|is\d?|io\d?|iot|rem|cl|cd)$/

/**
 * Reads a whole Bible in OSIS, USFX or Zefania XML into verse text by book, chapter and verse.
 * Only the 66 books in the catalogue are kept; deuterocanonical books are dropped.
 */
export function parseBible(xml: string, format: BibleFormat, info: BibleInfo): BibleText {
  const books: BibleText['books'] = {}
  const parser = new SaxesParser()
  const skip = skipped[format]
  let book: BookId | null = null
  let chapter = 0
  let verse = 0
  let skipDepth = 0
  let buffer = ''
  const skipping: boolean[] = []

  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    buffer = ''
    if (!book || !text || !isInRange(book, chapter, verse)) return
    const chapters = (books[book] ??= [])
    const verses = (chapters[chapter - 1] ??= [])
    verses[verse - 1] = verses[verse - 1] ? `${verses[verse - 1]} ${text}` : text
  }
  const startVerse = (n: number) => {
    flush()
    verse = Number.isFinite(n) ? n : 0
  }
  const endVerse = () => {
    flush()
    verse = 0
  }

  parser.on('opentag', (tag: SaxesTagPlain) => {
    const name = tag.name.replace(/^.*:/, '')
    const attr = (key: string) => (typeof tag.attributes[key] === 'string' ? (tag.attributes[key] as string) : '')
    const isSkipped = skip.has(name) || (format === 'usx' && name === 'para' && usxHeadingStyles.test(attr('style')))
    if (!tag.isSelfClosing) skipping.push(isSkipped)
    if (isSkipped) {
      if (!tag.isSelfClosing) skipDepth++
      return
    }
    if (format === 'osis') {
      if (name === 'div' && attr('type') === 'book') {
        endVerse()
        book = byOsis.get(attr('osisID')) ?? null
      } else if (name === 'chapter' && (attr('sID') || attr('osisID') || attr('osisRef'))) {
        endVerse()
        chapter = Number(attr('n') || (attr('osisID') || attr('osisRef')).split('.').pop())
      } else if (name === 'verse' && attr('eID')) {
        endVerse()
      } else if (name === 'verse' && attr('osisID')) {
        startVerse(Number(attr('osisID').split(/\s+/)[0]!.split('.').pop()))
      }
    } else if (format === 'usfx') {
      if (name === 'book') {
        endVerse()
        book = byUsfm.has(attr('id')) ? (attr('id') as BookId) : null
        chapter = 0
      } else if (name === 'c') {
        endVerse()
        chapter = parseInt(attr('id'), 10)
      } else if (name === 'v') {
        startVerse(parseInt(attr('id'), 10))
      } else if (name === 've') {
        endVerse()
      }
    } else if (format === 'usx') {
      if (name === 'book') {
        endVerse()
        book = byUsfm.has(attr('code')) ? (attr('code') as BookId) : null
        chapter = 0
        if (!tag.isSelfClosing) skipDepth++
      } else if (name === 'chapter' && attr('number')) {
        endVerse()
        chapter = parseInt(attr('number'), 10)
      } else if (name === 'verse' && attr('eid')) {
        endVerse()
      } else if (name === 'verse' && attr('number')) {
        startVerse(parseInt(attr('number'), 10))
      }
    } else if (name === 'BIBLEBOOK') {
      endVerse()
      book = bibleBooks[Number(attr('bnumber')) - 1]?.usfm ?? null
    } else if (name === 'CHAPTER') {
      endVerse()
      chapter = Number(attr('cnumber'))
    } else if (name === 'VERS') {
      startVerse(Number(attr('vnumber')))
    }
  })
  parser.on('closetag', (tag) => {
    const name = tag.name.replace(/^.*:/, '')
    if (tag.isSelfClosing) return
    const wasSkipped = skipping.pop() ?? false
    if (wasSkipped || (format === 'usx' && name === 'book')) {
      skipDepth = Math.max(0, skipDepth - 1)
      return
    }
    if ((format === 'osis' && name === 'verse' && !tag.attributes['sID'] && !tag.attributes['eID']) || (format === 'zefania' && name === 'VERS')) endVerse()
  })
  parser.on('text', (text) => {
    if (skipDepth === 0 && verse > 0) buffer += text
  })
  parser.write(xml.replace(/^﻿/, '')).close()
  flush()
  return { ...info, books }
}

/**
 * USFM, one book per file as Paratext and eBible.org write it. Footnotes and cross references are
 * dropped, word-level markup keeps its words, and heading lines are skipped.
 */
export function parseUsfm(files: string[], info: BibleInfo): BibleText {
  const books: BibleText['books'] = {}
  for (const source of files) {
    let book: BookId | null = null
    let chapter = 0
    let verse = 0
    let buffer = ''
    const flush = () => {
      const text = buffer.replace(/\s+/g, ' ').trim()
      buffer = ''
      if (!book || !text || !isInRange(book, chapter, verse)) return
      const verses = ((books[book] ??= [])[chapter - 1] ??= [])
      verses[verse - 1] = verses[verse - 1] ? `${verses[verse - 1]} ${text}` : text
    }
    const clean = (text: string) =>
      text
        .replace(/\\(f|fe|x|ef|ex)\s[\s\S]*?\\\1\*/g, '')
        .replace(/\\\+?w\s+([^|\\]*)(?:\|[^\\]*)?\\\+?w\*/g, '$1')
        .replace(/\\\+?[a-z]+\d*\*?/gi, '')
    for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const marker = /^\\([a-z]+\d*)\s*(.*)$/i.exec(line.trim())
      if (!marker) {
        if (verse) buffer += ` ${clean(line)}`
        continue
      }
      const [, tag, rest] = marker as unknown as [string, string, string]
      if (tag === 'id') {
        flush()
        const code = rest.slice(0, 3).toUpperCase()
        book = byUsfm.has(code) ? (code as BookId) : null
        chapter = verse = 0
      } else if (tag === 'c') {
        flush()
        chapter = parseInt(rest, 10)
        verse = 0
      } else if (tag === 'v') {
        flush()
        const match = /^(\d+)\S*\s*([\s\S]*)$/.exec(rest)
        verse = match ? Number(match[1]) : 0
        buffer = match ? clean(match[2]!) : ''
      } else if (usxHeadingStyles.test(tag) || /^(ide|sts|usfm|periph)$/.test(tag)) {
        continue
      } else if (verse) {
        buffer += ` ${clean(rest)}`
      }
    }
    flush()
  }
  return { ...info, books }
}