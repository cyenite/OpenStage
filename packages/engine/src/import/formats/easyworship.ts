import { rtfToText } from '../rtf'
import type { ImportedSong } from '../types'
import { columns, tables, withDatabase } from './sqlite'
import { songFromText } from './text-songs'

/**
 * EasyWorship 6 and 7 keep songs in two SQLite files under `Databases/Data`: `Songs.db` (table
 * `song`) and `SongWords.db` (table `word`, RTF lyrics keyed by `song_id`). Both must be imported together.
 */
export function easyWorship(songsDb: Uint8Array, wordsDb: Uint8Array): ImportedSong[] {
  const words = withDatabase(wordsDb, (db) => {
    if (!tables(db).has('word')) throw new Error('SongWords.db has no word table')
    const rows = db.prepare('select song_id, words from word').all() as { song_id: number; words: string | Uint8Array }[]
    return new Map(rows.map((r) => [Number(r.song_id), typeof r.words === 'string' ? r.words : new TextDecoder().decode(r.words)]))
  })
  return withDatabase(songsDb, (db) => {
    if (!tables(db).has('song')) throw new Error('Songs.db has no song table')
    const has = columns(db, 'song')
    const pick = (name: string) => (has.has(name) ? name : `'' as ${name}`)
    const rows = db.prepare(`select rowid as id, ${pick('title')}, ${pick('author')}, ${pick('copyright')}, ${pick('reference_number')}, ${pick('vendor_id')} from song`).all() as Record<string, string | number>[]
    return rows.flatMap((row) => {
      const rtf = words.get(Number(row.id))
      if (!rtf) return []
      const ccli = String(row.reference_number || row.vendor_id || '').replace(/\D/g, '')
      return [
        songFromText(String(row.title || 'Untitled song'), rtfToText(rtf), {
          authors: String(row.author ?? '')
            .split(/\s*[;,|]\s*/)
            .filter(Boolean),
          copyright: String(row.copyright ?? ''),
          ...(ccli && { ccli }),
        }),
      ]
    })
  })
}
