import { SaxesParser, type SaxesTagPlain } from 'saxes'
import { bibleBooks, type BibleInfo, type BibleText, type BookId } from '@openstage/shared'

export type BibleFormat = 'osis' | 'usfx' | 'zefania'

const byOsis = new Map<string, BookId>(bibleBooks.map((b) => [b.osis, b.usfm]))
const byUsfm = new Set<string>(bibleBooks.map((b) => b.usfm))

/** Footnotes, cross references, headings and titles are not verse text. */
const skipped: Record<BibleFormat, Set<string>> = {
  osis: new Set(['note', 'title', 'reference']),
  usfx: new Set(['f', 'x', 'fe', 'ef', 'ex', 's', 'd', 'h', 'toc', 'id', 'ide', 'rem', 'periph', 'ms', 'mr', 'r', 'sr']),
  zefania: new Set(['NOTE', 'XREF', 'CAPTION', 'REMARK']),
}

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

  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    buffer = ''
    if (!book || chapter < 1 || verse < 1 || !text) return
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
    if (skip.has(name)) {
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
    if (skip.has(name)) {
      if (!tag.isSelfClosing) skipDepth = Math.max(0, skipDepth - 1)
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
