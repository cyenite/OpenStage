import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { isSafeId, newId, type Library, type Song } from '@openstage/shared'
import { findDuplicate, songFromImport } from './import/plan'
import type { ImportedSong } from './import/types'

/** Songs that ship with the app, public domain only, written by `scripts/build-hymns.ts`. */
export interface SongPack {
  id: string
  name: string
  notice: string
  songs: ImportedSong[]
}

export async function loadSongPacks(folder: string, onProblem: (file: string, error: unknown) => void): Promise<SongPack[]> {
  const names = await readdir(folder).catch(() => [] as string[])
  const packs: SongPack[] = []
  for (const name of names.filter((n) => n.endsWith('.json.gz')).sort()) {
    const file = join(folder, name)
    try {
      const pack = JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as SongPack
      if (!isSafeId(pack.id) || !Array.isArray(pack.songs)) throw new Error('Not a song pack')
      packs.push(pack)
    } catch (error) {
      onProblem(file, error)
    }
  }
  return packs
}

/**
 * The pack's songs that are not already in the library, as new songs. A pack is installed once
 * (the caller records it), so songs a church deletes afterwards stay deleted.
 */
export function songsToInstall(pack: SongPack, library: Library): Song[] {
  const songs: Song[] = []
  let current = library
  for (const imported of pack.songs) {
    if (!imported?.title || !Array.isArray(imported.sections) || imported.sections.length === 0) continue
    // Pack ids are predictable, so a pack's songs are recognisable on disk and never collide with a church's own.
    const id = `${pack.id}-${newId(imported.title, () => 0).replace(/-0000$/, '')}`.slice(0, 120)
    if (findDuplicate(imported, current) || Object.hasOwn(current.songs, id)) continue
    const song = songFromImport(id, { ...imported, copyright: imported.copyright || pack.notice })
    songs.push(song)
    current = { ...current, songs: { ...current.songs, [song.id]: song } }
  }
  return songs
}
