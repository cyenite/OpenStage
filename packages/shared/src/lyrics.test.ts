import { describe, expect, it } from 'vitest'
import { parseLyrics, parseSlides, parseTranslation, translationText } from './lyrics'

const texts = (slides: { lines: { text: string }[] }[]) => slides.map((s) => s.lines.map((l) => l.text))

describe('parseLyrics', () => {
  it('splits sections at headings and slides at blank lines, reusing a repeated chorus', () => {
    const parsed = parseLyrics('[Verse 1]\nOne a\nOne b\n\nOne c\n\n[Chorus]\nRefrain\n\n[Verse 2]\nTwo\n\n[Chorus]\n')
    expect(parsed.sections.map((s) => [s.kind, s.label])).toEqual([
      ['verse', 'Verse 1'],
      ['chorus', 'Chorus'],
      ['verse', 'Verse 2'],
    ])
    expect(texts(parsed.sections[0]!.slides)).toEqual([['One a', 'One b'], ['One c']])
    expect(parsed.order).toEqual([0, 1, 2, 1])
  })

  it('understands bare and Swahili headings', () => {
    const parsed = parseLyrics('Ubeti 1:\nYesu ni wangu\n\nKiitikio\nNitamsifu\n\nPre-Chorus\nLift\n\n[Tag]\nAmen')
    expect(parsed.sections.map((s) => [s.kind, s.label])).toEqual([
      ['verse', 'Ubeti 1'],
      ['chorus', 'Kiitikio'],
      ['preChorus', 'Pre-chorus'],
      ['tag', 'Tag'],
    ])
  })

  it('keeps an unknown bracketed heading as an Other section, and a chord line is never a heading', () => {
    const parsed = parseLyrics('[Interlude]\nHum\n\n[G]\nLa la')
    expect(parsed.sections.map((s) => [s.kind, s.label])).toEqual([['other', 'Interlude']])
    expect(texts(parsed.sections[0]!.slides)).toEqual([['Hum'], ['La la']])
    expect(parsed.sections[0]!.slides[1]!.lines[0]!.chords).toEqual([{ chord: 'G', offset: 0 }])
  })

  it('makes verses of plain stanzas and a chorus of the stanza that repeats', () => {
    const parsed = parseLyrics('First verse\n\nSame chorus\nline\n\nSecond verse\n\nsame CHORUS\nline\n')
    expect(parsed.sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2'])
    expect(parsed.order).toEqual([0, 1, 2, 1])
  })

  it('gives a differently worded repeat of a heading its own section', () => {
    const parsed = parseLyrics('[Chorus]\nA\n\n[Chorus]\nB')
    expect(parsed.sections.map((s) => s.label)).toEqual(['Chorus', 'Chorus 2'])
  })

  it('returns nothing for empty text', () => {
    expect(parseLyrics('  \n\n ')).toEqual({ sections: [], order: [] })
  })
})

describe('parseSlides and translations', () => {
  it('merges chord lines into the lyric below', () => {
    const [slide] = parseSlides('G       C\nAmazing grace\nHow sweet')
    expect(slide).toEqual([
      { text: 'Amazing grace', chords: [{ chord: 'G', offset: 0 }, { chord: 'C', offset: 8 }] },
      { text: 'How sweet', chords: [] },
    ])
  })

  it('keeps empty translation slides so later ones stay aligned', () => {
    expect(parseTranslation('Moja\n\n\n\nTatu')).toEqual([['Moja'], [], ['Tatu']])
    const slides = [{ lines: [], translations: { sw: ['Moja'] } }, { lines: [] }, { lines: [], translations: { sw: ['Tatu'] } }]
    expect(parseTranslation(translationText(slides, 'sw'))).toEqual([['Moja'], [], ['Tatu']])
    expect(parseTranslation('')).toEqual([])
  })
})
