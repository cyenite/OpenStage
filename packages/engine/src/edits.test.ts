import { describe, expect, it } from 'vitest'
import { classicTheme, type Song } from '@openstage/shared'
import { applyServiceEdit, applySongEdit, applyThemeEdit, createSong, createTheme } from './edits'
import { starterLibrary } from './starter-library'

const grace = starterLibrary.songs['amazing-grace']!
const song = createSong('test', 'Test', '[Verse 1]\n[G]One\n\n[D]Two\n\n[Chorus]\n[C]Refrain', 'en')

describe('createSong', () => {
  it('builds sections and a default arrangement from lyrics', () => {
    expect(song.arrangements).toEqual([{ id: 'default', name: 'Default', sectionIds: ['s1', 's2'] }])
    expect(song.sections.s1!.slides.map((s) => s.lines[0]!.chords[0]!.chord)).toEqual(['G', 'D'])
  })

  it('starts an empty song with one empty verse', () => {
    const empty = createSong('e', '  ', '', 'xx!')
    expect(empty).toMatchObject({ title: 'Untitled song', languages: ['en'], arrangements: [{ sectionIds: ['s1'] }] })
  })
})

describe('applySongEdit', () => {
  const withSwahili = applySongEdit(song, { type: 'song.setLanguages', languages: ['en', 'sw'] })
  const translated = applySongEdit(withSwahili, { type: 'song.setSectionText', sectionId: 's1', language: 'sw', text: 'Moja\n\nMbili' })

  it('stores translations by slide and keeps them when the main text changes', () => {
    expect(translated.sections.s1!.slides.map((s) => s.translations?.sw)).toEqual([['Moja'], ['Mbili']])
    const edited = applySongEdit(translated, { type: 'song.setSectionText', sectionId: 's1', language: null, text: '[A]Uno\n\nDos' })
    expect(edited.sections.s1!.slides.map((s) => [s.lines[0]!.text, s.translations?.sw])).toEqual([
      ['Uno', ['Moja']],
      ['Dos', ['Mbili']],
    ])
  })

  it('refuses a translation in a language the song does not have', () => {
    expect(applySongEdit(song, { type: 'song.setSectionText', sectionId: 's1', language: 'sw', text: 'Moja' })).toBe(song)
  })

  it('drops a removed language’s lines and rejects bad language lists', () => {
    const back = applySongEdit(translated, { type: 'song.setLanguages', languages: ['en'] })
    expect(back.sections.s1!.slides.every((s) => !s.translations)).toBe(true)
    expect(applySongEdit(song, { type: 'song.setLanguages', languages: [] })).toBe(song)
    expect(applySongEdit(song, { type: 'song.setLanguages', languages: ['en', 'en'] })).toBe(song)
    expect(applySongEdit(song, { type: 'song.setLanguages', languages: ['English'] })).toBe(song)
  })

  it('transposes every chord and the key', () => {
    const keyed: Song = { ...song, meta: { ...song.meta, key: 'G' } }
    const up = applySongEdit(keyed, { type: 'song.transpose', semitones: 3 })
    expect(up.meta.key).toBe('Bb')
    expect(up.sections.s1!.slides.map((s) => s.lines[0]!.chords[0]!.chord)).toEqual(['Bb', 'F'])
    expect(applySongEdit(grace, { type: 'song.transpose', semitones: 2 })).toBe(grace)
    expect(applySongEdit(song, { type: 'song.transpose', semitones: 0.5 })).toBe(song)
  })

  it('adds a section to the chosen arrangement and removes it from every arrangement', () => {
    const added = applySongEdit(song, { type: 'song.addSection', sectionId: 'bridge', kind: 'bridge', label: 'Bridge', arrangementId: 'default' })
    expect(added.arrangements[0]!.sectionIds).toEqual(['s1', 's2', 'bridge'])
    const removed = applySongEdit(added, { type: 'song.removeSection', sectionId: 's2' })
    expect(removed.arrangements[0]!.sectionIds).toEqual(['s1', 'bridge'])
    expect(removed.sections.s2).toBeUndefined()
    expect(applySongEdit(song, { type: 'song.addSection', sectionId: 's1', kind: 'verse', label: 'Dup' })).toBe(song)
  })

  it('creates, reorders and removes arrangements but never the last one', () => {
    const short = applySongEdit(song, { type: 'song.setArrangement', arrangementId: 'short', name: 'Short', sectionIds: ['s2', 's1', 's2', 'ghost'] })
    expect(short.arrangements[1]).toEqual({ id: 'short', name: 'Short', sectionIds: ['s2', 's1', 's2'] })
    const gone = applySongEdit(short, { type: 'song.removeArrangement', arrangementId: 'short' })
    expect(gone.arrangements).toHaveLength(1)
    expect(applySongEdit(gone, { type: 'song.removeArrangement', arrangementId: 'default' })).toBe(gone)
  })

  it('updates a section’s kind and label', () => {
    const renamed = applySongEdit(song, { type: 'song.updateSection', sectionId: 's2', kind: 'tag', label: 'Tag' })
    expect(renamed.sections.s2).toMatchObject({ kind: 'tag', label: 'Tag' })
    expect(applySongEdit(song, { type: 'song.updateSection', sectionId: 's2', kind: 'nonsense' as 'tag', label: 'X' })).toBe(song)
  })
})

describe('applyServiceEdit', () => {
  const service = starterLibrary.services.sunday!

  it('adds a song item once per item id and removes items', () => {
    const added = applyServiceEdit(service, { type: 'service.addSong', itemId: 'item-x', songId: 'test', arrangementId: 'default' })
    expect(added.items).toHaveLength(4)
    expect(applyServiceEdit(added, { type: 'service.addSong', itemId: 'item-x', songId: 'test', arrangementId: 'default' })).toBe(added)
    expect(applyServiceEdit(service, { type: 'service.addSong', itemId: 'item-y', songId: 'test' })).toBe(service)
    expect(applyServiceEdit(added, { type: 'service.removeItem', itemId: 'item-x' }).items).toEqual(service.items)
  })

  it('adds a song after a given item, or at the end when that item is gone', () => {
    const after = applyServiceEdit(service, { type: 'service.addSong', itemId: 'item-x', songId: 'test', arrangementId: 'default', afterItemId: 'item-amazing-grace' })
    expect(after.items.map((i) => i.id)).toEqual(['item-amazing-grace', 'item-x', 'item-john-3', 'item-it-is-well'])
    const atEnd = applyServiceEdit(service, { type: 'service.addSong', itemId: 'item-x', songId: 'test', arrangementId: 'default', afterItemId: 'gone' })
    expect(atEnd.items.at(-1)!.id).toBe('item-x')
  })

  it('sets and clears an item background, one item or several at once', () => {
    const one = applyServiceEdit(service, { type: 'service.updateItem', itemId: 'item-john-3', changes: { backgroundId: 'candle' } })
    expect(one.items[1]).toMatchObject({ backgroundId: 'candle', isLinked: false })
    expect(applyServiceEdit(one, { type: 'service.updateItem', itemId: 'item-john-3', changes: { backgroundId: null } }).items[1]!.backgroundId).toBeUndefined()
    expect(applyServiceEdit(service, { type: 'service.updateItem', itemId: 'item-john-3', changes: { backgroundId: '../x' } })).toBe(service)

    const all = applyServiceEdit(one, { type: 'service.setBackground', itemIds: ['item-amazing-grace', 'item-john-3', 'gone'], backgroundId: 'candle' })
    expect(all.items.map((i) => i.backgroundId)).toEqual(['candle', 'candle', undefined])
    expect(all.items[1]).toBe(one.items[1])
    expect(applyServiceEdit(all, { type: 'service.setBackground', itemIds: ['item-amazing-grace'], backgroundId: 'candle' })).toBe(all)
    expect(applyServiceEdit(all, { type: 'service.setBackground', itemIds: ['item-amazing-grace', 'item-john-3'], backgroundId: null }).items.every((i) => !i.backgroundId)).toBe(true)
  })
})

describe('themes', () => {
  const theme = createTheme('mine', 'Mine', classicTheme)

  it('copies the theme it starts from without sharing objects', () => {
    expect(theme).toMatchObject({ id: 'mine', name: 'Mine', boxes: classicTheme.boxes })
    expect(theme.boxes.main).not.toBe(classicTheme.boxes.main)
    expect(createTheme('x', ' ', undefined).name).toBe('Classic copy')
  })

  it('merges box changes and clamps the frame on screen', () => {
    const edited = applyThemeEdit(theme, { type: 'theme.setBox', role: 'main', style: { color: '#ff0000', font: { size: 0.1 }, frame: { x: 0.9, w: 0.5 } } })
    expect(edited.boxes.main).toMatchObject({ color: '#ff0000', font: { size: 0.1, weight: 600 }, frame: { x: 0.5, w: 0.5, y: 0.1 } })
  })

  it('rejects bad colours, sizes, fonts and fills', () => {
    const bad = [
      { color: 'red; background: url(x)' },
      { font: { size: 2 } },
      { font: { family: '</style>' } },
      { align: 'justify' as 'left' },
      { backing: 'nope' },
    ]
    for (const style of bad) expect(applyThemeEdit(theme, { type: 'theme.setBox', role: 'main', style })).toBe(theme)
    expect(applyThemeEdit(theme, { type: 'theme.setFill', fill: { kind: 'color', color: 'javascript:' } })).toBe(theme)
    expect(applyThemeEdit(theme, { type: 'theme.setBox', role: 'nope' as 'main', style: { color: '#fff' } })).toBe(theme)
  })

  it('sets fills, names and song or service themes', () => {
    const filled = applyThemeEdit(theme, { type: 'theme.setFill', fill: { kind: 'gradient', from: '#000', to: 'rgba(0, 0, 0, 0.5)', angle: 90 } })
    expect(filled.fill).toEqual({ kind: 'gradient', from: '#000', to: 'rgba(0, 0, 0, 0.5)', angle: 90 })
    expect(applyThemeEdit(theme, { type: 'theme.setName', name: ' Mine ' })).toBe(theme)
    const themed = applySongEdit(song, { type: 'song.setTheme', themeId: 'paper' })
    expect(themed.themeId).toBe('paper')
    expect('themeId' in applySongEdit(themed, { type: 'song.setTheme', themeId: null })).toBe(false)
    expect(applyServiceEdit(starterLibrary.services.sunday!, { type: 'service.setTheme', themeId: 'paper' }).themeId).toBe('paper')
  })
})

