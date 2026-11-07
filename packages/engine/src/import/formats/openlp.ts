import { fromChordText } from '@openstage/shared'
import type { ImportedSong } from '../types'
import { verseLabel } from './openlyrics'
import { columns, withDatabase } from './sqlite'

/**
 * OpenLP's `songs.sqlite`. Lyrics are stored as `<song><lyrics><verse type="v" label="1">` with the
 * text in CDATA, `[---]` marking an optional slide break; `verse_order` is like "v1 c1 v2 c1".
 */
export function openLp(bytes: Uint8Array): ImportedSong[] {
  return withDatabase(bytes, (db) => {
    const songColumns = columns(db, 'songs')
    const pick = (name: string) => (songColumns.has(name) ? name : `'' as ${name}`)
    const rows = db.prepare(`select id, title, lyrics, ${pick('verse_order')}, ${pick('copyright')}, ${pick('ccli_number')} from songs`).all() as Record<string, string | number>[]
    const authorsFor = db.prepare(
      `select coalesce(nullif(a.display_name, ''), trim(a.first_name || ' ' || a.last_name)) as name from authors a join authors_songs s on s.author_id = a.id where s.song_id = ?`,
    )
    return rows.map((row) => {
      const sections = [...String(row.lyrics ?? '').matchAll(/<verse\b([^>]*)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/verse>/g)].map((m) => {
        const type = /type="([^"]*)"/.exec(m[1]!)?.[1] ?? 'v'
        const label = /label="([^"]*)"/.exec(m[1]!)?.[1] ?? ''
        const body = (m[2] ?? decodeEntities(m[3] ?? '')).replace(/\r\n?/g, '\n')
        const slides = body.split(/\n?\[---\]\n?|\n\s*\n/).map((slide) => slide.split('\n').filter((l) => l.trim()).map((l) => fromChordText(l.trim())))
        return { type, key: `${type}${label}`.toLowerCase(), label: verseLabel(`${type}${label}`), slides: slides.filter((s) => s.length) }
      })
      for (const section of sections) {
        const isOnly = sections.filter((s) => s.type === section.type).length === 1
        if (isOnly && section.type !== 'v') section.label = section.label.replace(/ 1$/, '')
      }
      const order = String(row.verse_order ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((key) => sections.find((s) => s.key === key || s.key === `${key}1`)?.label)
        .filter((l): l is string => !!l)
      const authors = (authorsFor.all(row.id!) as { name: string }[]).map((a) => a.name).filter(Boolean)
      return {
        title: String(row.title ?? 'Untitled song'),
        authors,
        copyright: String(row.copyright ?? ''),
        ...(row.ccli_number && { ccli: String(row.ccli_number) }),
        languages: ['en'],
        sections: sections.map(({ label, slides }) => ({ label, slides })),
        order,
      }
    })
  })
}

function decodeEntities(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
}
