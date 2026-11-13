import { describe, expect, it } from 'vitest'
import { songsToInstall, type SongPack } from './song-packs'
import { starterLibrary } from './starter-library'
import type { ImportedSong } from './import/types'

const hymn = (title: string, first: string): ImportedSong => ({
  title,
  authors: ['Someone'],
  copyright: 'Public domain',
  languages: ['en'],
  sections: [{ label: 'Verse 1', slides: [[{ text: first, chords: [] }]] }],
  order: [],
})

describe('songsToInstall', () => {
  const pack: SongPack = {
    id: 'test-pack',
    name: 'Test',
    notice: 'Public domain hymns',
    songs: [hymn('Amazing Grace', 'Amazing grace, how sweet the sound'), hymn('Rock of Ages', 'Rock of Ages, cleft for me'), hymn('Rock of Ages', 'Rock of Ages, cleft for me'), hymn('', 'no title')],
  }

  it('adds only songs the library does not have yet, once each', () => {
    const songs = songsToInstall(pack, starterLibrary)
    expect(songs.map((s) => [s.id, s.title])).toEqual([['test-pack-rock-of-ages', 'Rock of Ages']])
    expect(songs[0]!.meta).toMatchObject({ authors: ['Someone'], copyright: 'Public domain' })
  })
})
