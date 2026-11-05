import { describe, expect, it } from 'vitest'
import type { Song } from '@openstage/shared'
import { applyServiceEdit, applySongEdit, createSong } from './edits'
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
})
