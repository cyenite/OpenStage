import { describe, expect, it } from 'vitest'
import { formatReference, parseReference, passageSlides, splitText, versesFor, type BibleText, type PassageRef } from './scripture'

const ok = (text: string) => {
  const parsed = parseReference(text)
  if (!parsed.ok) throw new Error(`${text}: ${parsed.error}`)
  return parsed.ref
}

describe('parseReference', () => {
  it('reads the usual ways of typing a passage', () => {
    expect(ok('jn 3 16-18')).toEqual({ book: 'JHN', startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18 })
    expect(ok('John 3:16')).toEqual({ book: 'JHN', startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 })
    expect(ok('Jn. 3.16')).toMatchObject({ book: 'JHN', startVerse: 16 })
    expect(ok('ps 23')).toEqual({ book: 'PSA', startChapter: 23, startVerse: null, endChapter: 23, endVerse: null })
    expect(ok('gen 1-2')).toMatchObject({ book: 'GEN', startChapter: 1, endChapter: 2, startVerse: null })
    expect(ok('jn 3:16-4:2')).toMatchObject({ startChapter: 3, startVerse: 16, endChapter: 4, endVerse: 2 })
    expect(ok('1 cor 13 4-7')).toMatchObject({ book: '1CO', startChapter: 13, startVerse: 4, endVerse: 7 })
    expect(ok('II Kings 2:11')).toMatchObject({ book: '2KI' })
    expect(ok('song of songs 2 4')).toMatchObject({ book: 'SNG' })
    expect(ok('Rev 22:20\u201321')).toMatchObject({ book: 'REV', endVerse: 21 })
  })

  it('reads Swahili book names and abbreviations', () => {
    expect(ok('Yohana 3:16')).toMatchObject({ book: 'JHN' })
    expect(ok('1 Kor 13 4-7')).toMatchObject({ book: '1CO' })
    expect(ok('Zab 23')).toMatchObject({ book: 'PSA' })
    expect(ok('Mathayo 5:3')).toMatchObject({ book: 'MAT' })
    expect(ok('Matendo ya Mitume 2:1')).toMatchObject({ book: 'ACT' })
    expect(ok('Ufunuo 21 4')).toMatchObject({ book: 'REV' })
    expect(ok('1 Yohana 4 8')).toMatchObject({ book: '1JN' })
  })

  it('accepts a unique start of a name and explains the rest', () => {
    expect(ok('philem 1 6')).toMatchObject({ book: 'PHM' })
    expect(ok('deuteron 6 4')).toMatchObject({ book: 'DEU' })
    const ambiguous = parseReference('jo 1 1')
    expect(ambiguous.ok).toBe(false)
    expect(!ambiguous.ok && ambiguous.suggestions).toEqual(expect.arrayContaining(['JOB', 'JHN', 'JOS']))
    expect(parseReference('jn 22 1')).toMatchObject({ ok: false, error: 'John has 21 chapters.' })
    expect(parseReference('jn 3 18-16')).toMatchObject({ ok: false })
    expect(parseReference('hello')).toMatchObject({ ok: false })
    expect(parseReference('')).toMatchObject({ ok: false })
  })
})

describe('formatReference', () => {
  it('writes references compactly, in English or Swahili', () => {
    expect(formatReference(ok('jn 3 16-18'))).toBe('John 3:16-18')
    expect(formatReference(ok('jn 3 16'), 'sw')).toBe('Yohana 3:16')
    expect(formatReference(ok('ps 23'))).toBe('Psalms 23')
    expect(formatReference(ok('jn 3:16-4:2'))).toBe('John 3:16-4:2')
  })
})

const ref: PassageRef = { book: 'JHN', startChapter: 3, startVerse: 1, endChapter: 3, endVerse: null }
const long = 'And the king said, Go thy way. One clause comes here; another clause follows it, and then a third part, which is long enough. Finally the sentence closes after many more words than fit on one screen comfortably, so it must be split.'
const bible = (code: string, verses: string[]): BibleText => ({ code, name: code, language: 'en', notice: '', books: { JHN: [[], [], verses] } })

describe('passageSlides', () => {
  const english = bible('A', ['One.', 'Two.', long])
  const other = bible('B', ['Moja.', 'Mbili.', `${long} Tena.`])

  it('reads verses from each Bible, to the end of the chapter when asked', () => {
    const rows = versesFor(ref, [english, other])
    expect(rows.map((r) => [r.verse, r.texts.A?.slice(0, 4), r.texts.B?.slice(0, 4)])).toEqual([
      [1, 'One.', 'Moja'],
      [2, 'Two.', 'Mbil'],
      [3, 'And ', 'And '],
    ])
  })

  it('splits long verses into aligned parts and groups the others', () => {
    const rows = versesFor(ref, [english, other])
    const slides = passageSlides(ref, rows, { translations: ['A', 'B'], versesPerSlide: 2, splitLong: true }, [english, other])
    expect(slides.map((s) => s.label)).toEqual(['Verses 1-2', 'Verse 3a', 'Verse 3b'])
    expect(slides[0]).toMatchObject({ lines: ['1 One.', '2 Two.'], secondaryLines: ['1 Moja.', '2 Mbili.'], reference: 'John 3:1-2 A · B' })
    expect(slides[1]!.lines[0]!.endsWith('.')).toBe(true)
    expect(slides[1]!.secondaryLines).toHaveLength(1)
    expect(`${slides[1]!.lines[0]} ${slides[2]!.lines[0]}`).toBe(long)
  })

  it('names a Bible that is not installed instead of showing nothing', () => {
    const slides = passageSlides(ref, versesFor(ref, [english]), { translations: ['A', 'ZZZ'], versesPerSlide: 1, splitLong: false }, [english])
    expect(slides[0]!.secondaryLines).toEqual(['ZZZ is not installed on this computer'])
  })
})

describe('splitText', () => {
  it('prefers clause ends near the middle and keeps every word', () => {
    const parts = splitText(long, 2)
    expect(parts).toHaveLength(2)
    expect(parts.join(' ')).toBe(long)
    expect(parts[0]).toMatch(/[,.;]$/)
    expect(splitText('short', 1)).toEqual(['short'])
  })
})
