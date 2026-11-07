import {
  sectionKindFor,
  type BibleText,
  type Id,
  type ImportItem,
  type Library,
  type Section,
  type Song,
  type TextLine,
} from '@openstage/shared'
import type { ImportedSong, Parsed } from './types'

export function songFromImport(id: Id, imported: ImportedSong): Song {
  const sections: Section[] = imported.sections.map((section, index) => ({
    id: `s${index + 1}`,
    kind: sectionKindFor(section.label),
    label: section.label,
    slides: section.slides.map((lines, slide) => {
      const translations = Object.fromEntries(
        Object.entries(section.translations ?? {})
          .map(([language, slides]) => [language, slides[slide] ?? []] as const)
          .filter(([, lines]) => lines.length > 0),
      )
      return Object.keys(translations).length ? { lines, translations } : { lines }
    }),
  }))
  const byLabel = new Map(sections.map((s) => [s.label.toLowerCase(), s.id]))
  const ordered = imported.order.map((label) => byLabel.get(label.toLowerCase())).filter((id): id is string => !!id)
  return {
    id,
    title: imported.title.trim() || 'Untitled song',
    languages: imported.languages.length ? imported.languages : ['en'],
    meta: {
      authors: imported.authors,
      copyright: imported.copyright,
      ...(imported.ccli && { ccli: imported.ccli }),
      ...(imported.key && { key: imported.key }),
      ...(imported.tempo && { tempo: imported.tempo }),
    },
    sections: Object.fromEntries(sections.map((s) => [s.id, s])),
    arrangements: [{ id: 'default', name: 'Default', sectionIds: ordered.length ? ordered : sections.map((s) => s.id) }],
  }
}

/** Merge keeps the church's own lyrics and fills only the details its song is missing. */
export function mergeInto(existing: Song, imported: ImportedSong): Song {
  const meta = { ...existing.meta }
  if (!meta.authors.length && imported.authors.length) meta.authors = imported.authors
  if (!meta.copyright && imported.copyright) meta.copyright = imported.copyright
  if (!meta.ccli && imported.ccli) meta.ccli = imported.ccli
  if (!meta.key && imported.key) meta.key = imported.key
  if (!meta.tempo && imported.tempo) meta.tempo = imported.tempo
  return { ...existing, meta }
}

const squash = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '')

function bigrams(text: string): Map<string, number> {
  const grams = new Map<string, number>()
  for (let i = 0; i < text.length - 1; i++) grams.set(text.slice(i, i + 2), (grams.get(text.slice(i, i + 2)) ?? 0) + 1)
  return grams
}

/** Dice similarity of two strings' letter pairs: 1 for the same words, near 0 for unrelated ones. */
export function similarity(a: string, b: string): number {
  const x = bigrams(squash(a))
  const y = bigrams(squash(b))
  let shared = 0
  for (const [gram, count] of x) shared += Math.min(count, y.get(gram) ?? 0)
  const total = [...x.values(), ...y.values()].reduce((sum, n) => sum + n, 0)
  return total === 0 ? (squash(a) === squash(b) ? 1 : 0) : (2 * shared) / total
}

/** Sections as label and slides of lines, whether from a library song or an imported one. */
function sectionsOf(song: Song | ImportedSong): { label: string; slides: TextLine[][] }[] {
  if (!('id' in song)) return song.sections
  const ordered = (song.arrangements[0]?.sectionIds ?? []).map((id) => song.sections[id]).filter((s): s is Section => !!s)
  return (ordered.length ? ordered : Object.values(song.sections)).map((s) => ({ label: s.label, slides: s.slides.map((slide) => slide.lines) }))
}

function firstLine(song: Song | ImportedSong): string {
  return sectionsOf(song).flatMap((s) => s.slides).flat()[0]?.text ?? ''
}

function previewOf(song: Song | ImportedSong): string[] {
  return sectionsOf(song)
    .filter((s, i, all) => all.findIndex((x) => x.label === s.label) === i)
    .slice(0, 6)
    .map((s) => `${s.label}: ${s.slides[0]?.map((l) => l.text).join(' / ') ?? ''}`)
}

/** Title plus first-line fuzzy match, as the blueprint asks; a CCLI number match is certain. */
export function findDuplicate(imported: ImportedSong, library: Library): { song: Song; reason: string } | null {
  const songs = Object.values(library.songs)
  const byCcli = imported.ccli ? songs.find((s) => s.meta.ccli && s.meta.ccli === imported.ccli) : undefined
  if (byCcli) return { song: byCcli, reason: `Same CCLI number (${imported.ccli}) as “${byCcli.title}”.` }
  const sameTitle = songs.filter((s) => squash(s.title) === squash(imported.title))
  const line = firstLine(imported)
  const close = sameTitle.find((s) => similarity(firstLine(s), line) >= 0.8)
  if (close) return { song: close, reason: `Same title and first line as “${close.title}”.` }
  if (sameTitle[0]) return { song: sameTitle[0], reason: `Same title as “${sameTitle[0].title}”, but the lyrics start differently.` }
  return null
}

export function planItems(parsed: Parsed[], library: Library, bibles: BibleText[]): ImportItem[] {
  return parsed.map((entry, index): ImportItem => {
    const key = `i${index}`
    if (entry.kind === 'unreadable') return { key, file: entry.file, kind: 'song', format: entry.format, title: entry.file.replace(/^.*\//, ''), status: 'unreadable', reason: entry.reason, preview: [] }
    if (entry.kind === 'bible') {
      const { books, ...info } = entry.bible
      const verses = Object.values(books).reduce((sum, chapters) => sum + (chapters ?? []).reduce((n, c) => n + (c?.filter(Boolean).length ?? 0), 0), 0)
      const isTaken = bibles.some((b) => b.code === info.code)
      return {
        key,
        file: entry.file,
        kind: 'bible',
        format: entry.format,
        title: info.name,
        status: isTaken ? 'duplicate' : 'new',
        reason: isTaken ? `A Bible with the code ${info.code} is already installed; give this one another code.` : entry.caution ?? '',
        preview: [],
        bible: { ...info, books: Object.keys(books).length, verses },
      }
    }
    const duplicate = findDuplicate(entry.song, library)
    const item: ImportItem = { key, file: entry.file, kind: 'song', format: entry.format, title: entry.song.title, status: 'new', reason: entry.caution ?? '', preview: previewOf(entry.song) }
    if (!duplicate) return item
    return { ...item, status: 'duplicate', reason: duplicate.reason, existing: { id: duplicate.song.id, title: duplicate.song.title, preview: previewOf(duplicate.song) } }
  })
}

export const isBibleCode = (code: unknown): code is string => typeof code === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(code)
