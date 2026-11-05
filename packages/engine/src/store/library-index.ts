import { DatabaseSync } from 'node:sqlite'
import {
  documentKindKeys,
  documentKinds,
  type DocumentKind,
  type DocumentTypes,
  type Id,
  type Library,
  type SearchHit,
  type Song,
} from '@openstage/shared'
import type { UsageEntry } from './usage-log'

export interface LibrarySearch {
  list(kind: DocumentKind): SearchHit[]
  search(text: string, options?: { kind?: DocumentKind; limit?: number }): SearchHit[]
}

export interface UsageRow {
  songId: Id
  title: string
  count: number
}

const schema = `
  create virtual table documents using fts5(kind unindexed, id unindexed, detail unindexed, title, body, tokenize = 'unicode61 remove_diacritics 2');
  create table usage (song_id text not null, service_id text not null, day text not null, at text not null, primary key (song_id, service_id, day));
`

interface Described {
  title: string
  detail: string
  body: string[]
}

const describe: { [K in DocumentKind]: (document: DocumentTypes[K]) => Described } = {
  songs: (song) => ({ title: song.title, detail: song.meta.authors.join(', '), body: [...song.meta.authors, ...songLines(song)] }),
  passages: (passage) => ({ title: passage.reference, detail: passage.translations.join(' + '), body: passage.verses.flatMap((v) => Object.values(v.text)) }),
  services: (service) => ({ title: service.name, detail: `${service.items.length} items`, body: [] }),
  backgrounds: (background) => ({ title: background.name, detail: '', body: [] }),
  lowerThirds: (lowerThird) => ({ title: lowerThird.title, detail: lowerThird.subtitle, body: [lowerThird.subtitle] }),
  audioCues: (cue) => ({ title: cue.name, detail: '', body: [] }),
}

/**
 * Full-text search over titles and lyrics, plus song usage for CCLI reports. It lives in memory and
 * is rebuilt from the document files and the usage log at start-up, so it can never drift from them.
 */
export class LibraryIndex implements LibrarySearch {
  private readonly db = new DatabaseSync(':memory:')

  constructor() {
    this.db.exec(schema)
  }

  rebuild(library: Library): void {
    this.transaction(() => {
      this.db.exec('delete from documents')
      for (const kind of documentKindKeys) {
        for (const document of Object.values(library[kind])) this.insert(kind, document)
      }
    })
  }

  upsert<K extends DocumentKind>(kind: K, document: DocumentTypes[K]): void {
    this.transaction(() => {
      this.db.prepare('delete from documents where kind = ? and id = ?').run(kind, document.id)
      this.insert(kind, document)
    })
  }

  remove(kind: DocumentKind, id: Id): void {
    this.db.prepare('delete from documents where kind = ? and id = ?').run(kind, id)
  }

  list(kind: DocumentKind): SearchHit[] {
    if (!Object.hasOwn(documentKinds, kind)) return []
    const rows = this.db.prepare(`select kind, id, title, detail, '' as snippet from documents where kind = ? order by title collate nocase`).all(kind)
    return rows as unknown as SearchHit[]
  }

  search(text: string, options: { kind?: DocumentKind; limit?: number } = {}): SearchHit[] {
    const match = toMatchQuery(text)
    if (!match) return []
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200)
    const kind = options.kind && Object.hasOwn(documentKinds, options.kind) ? options.kind : null
    const rows = this.db
      .prepare(
        `select kind, id, title, detail, snippet(documents, 4, char(1), char(2), '…', 10) as snippet
         from documents where documents match ? and (? is null or kind = ?)
         order by bm25(documents, 0, 0, 0, 10, 1) limit ?`,
      )
      .all(match, kind, kind, limit)
    return rows as unknown as SearchHit[]
  }

  /** Counts a song once per service per day, the way CCLI reports expect. Returns false for a repeat. */
  recordUsage(entry: UsageEntry): boolean {
    const result = this.db
      .prepare('insert or ignore into usage (song_id, service_id, day, at) values (?, ?, ?, ?)')
      .run(entry.songId, entry.serviceId, entry.day, entry.at)
    return result.changes > 0
  }

  /** Days are `YYYY-MM-DD`, both ends inclusive. */
  usageReport(fromDay: string, toDay: string): UsageRow[] {
    const rows = this.db
      .prepare(
        `select u.song_id as songId, coalesce(d.title, u.song_id) as title, count(*) as count
         from usage u left join documents d on d.kind = 'songs' and d.id = u.song_id
         where u.day between ? and ? group by u.song_id order by count desc, title collate nocase`,
      )
      .all(fromDay, toDay)
    return rows as unknown as UsageRow[]
  }

  private insert<K extends DocumentKind>(kind: K, document: DocumentTypes[K]): void {
    const { title, detail, body } = describe[kind](document)
    this.db.prepare('insert into documents (kind, id, detail, title, body) values (?, ?, ?, ?, ?)').run(kind, document.id, detail, title, body.join('\n'))
  }

  private transaction(work: () => void): void {
    this.db.exec('begin')
    try {
      work()
      this.db.exec('commit')
    } catch (error) {
      this.db.exec('rollback')
      throw error
    }
  }
}

function songLines(song: Song): string[] {
  return Object.values(song.sections).flatMap((section) =>
    section.slides.flatMap((slide) => [...slide.lines.map((line) => line.text), ...Object.values(slide.translations ?? {}).flat()]),
  )
}

/** Turns what an operator types into a safe FTS5 query: every word must match, each as a prefix. */
export function toMatchQuery(text: string): string {
  const words = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  return words.map((word) => `"${word}"*`).join(' ')
}
