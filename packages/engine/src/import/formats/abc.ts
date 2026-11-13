import type { TextLine } from '@openstage/shared'
import type { ImportedSection, ImportedSong } from '../types'

interface Piece {
  text: string
  isOpen: boolean
}

interface Entry extends Piece {
  number?: number
}

/** Origins and placeholders the Open Hymnal puts where a person's name would go. */
const notNames = new Set(['none', 'unknown', 'anonymous', 'composite', 'latin', 'german', 'medieval', 'english', 'french', 'bohemian', 'basque', 'african-american', 'german jesuits'])

const hyphenMark = '\u0001'

/** An ABC tune file read for its words only: the Open Hymnal's hymns, with `w:` lines under the music and `W:` verses after it. */
export function abcHymn(fileTitle: string, source: string): { song: ImportedSong; isPublicDomain: boolean } {
  const lines = source.replace(/^﻿/, '').split(/\r\n?|\n/)
  const copyrights = lines.filter((l) => /^C:/.test(l)).map((l) => l.slice(2).trim())
  const copyright = copyrights.find((c) => /^copyright:/i.test(c))
  const isPublicDomain = copyrights.some((c) => /copyright:\s*public domain/i.test(c))
  const { verses, refrain, written } = words(lines)
  // `W:` verses are written out as sung lines already; only words taken from under the music are re-flowed.
  const sections: ImportedSection[] = [...verses]
    .sort(([a], [b]) => a - b)
    .map(([number, rows]) => ({ label: `Verse ${number}`, slides: slides(written.has(number) ? rows : reflow(rows)) }))
  if (refrain.length) sections.push({ label: 'Chorus', slides: slides(reflow(refrain)) })

  const key = lines.find((l) => l.startsWith('K:'))?.slice(2).replace(/%.*$/, '').trim().split(/\s+/)[0]
  const song: ImportedSong = {
    title: lines.find((l) => l.startsWith('T:'))?.slice(2).replace(/%.*$/, '').trim() || fileTitle,
    authors: authors(lines, copyrights),
    copyright: isPublicDomain ? 'Public domain' : (copyright?.replace(/^copyright:\s*/i, '').trim() ?? ''),
    languages: ['en'],
    sections,
    order: refrain.length ? sections.filter((s) => s.label !== 'Chorus').flatMap((s) => [s.label, 'Chorus']) : [],
  }
  if (key && /^[A-G][#b]?m?$/.test(key)) song.key = key
  return { song, isPublicDomain }
}

export function isAbc(source: string): boolean {
  const top = source.replace(/^﻿/, '').split(/\r\n?|\n/).slice(0, 200)
  const index = top.findIndex((l) => /^X:\s*\d*\s*(%.*)?$/.test(l))
  return index >= 0 && top.slice(index + 1).some((l) => /^T:/.test(l))
}

function authors(lines: string[], copyrights: string[]): string[] {
  const field = (name: string) => lines.filter((l) => l.startsWith(name)).flatMap((l) => l.slice(name.length).split(';'))
  const names = [...field('%OHAUTHOR'), ...field('%OHTRANSLATOR')].map(personName).filter(Boolean)
  if (!names.length) {
    const words = /Words(?: and Music)?:\s*(.+?)(?:,\s*\d{3,4}|\.\s+(?:Music|Setting|Tune)|\.?$)/.exec(copyrights.join(' '))?.[1]
    if (words) names.push(...words.split(/\s+(?:and|&)\s+/).map((n) => personName(n.replace(/,.*$/, ''))).filter(Boolean))
  }
  return [...new Set(names)]
}

/** "Lyte, Henry F. (1793-1847)" becomes "Henry F. Lyte". */
function personName(entry: string): string {
  const name = entry.replace(/\s*\([^)]*\)/g, '').trim()
  if (!name || notNames.has(name.toLowerCase()) || /^(from|traditional|psalm|african-american)\b/i.test(name)) return ''
  const suffix = /\b(?:Jr|Sr)\./.exec(name)?.[0]
  const [last = '', ...rest] = name.replace(suffix ?? '', '').split(',').map((part) => part.trim()).filter(Boolean)
  const full = rest.length ? `${rest.join(' ')} ${last}` : last
  return suffix ? `${full}, ${suffix}` : full
}

/**
 * Finds the first voice that carries `w:` lines; each music line's run of `w:` lines is one system,
 * and within it the k-th line is verse k unless it carries its own number. A system with a single
 * line of words in a hymn of several verses is the refrain.
 */
function words(lines: string[]): { verses: Map<number, string[]>; refrain: string[]; written: Set<number> } {
  const systems: { voice: string; entries: Entry[] }[] = []
  let voice = ''
  let isOpenSystem = false
  for (const line of lines) {
    const inline = /^\[V:\s*([^\]\s]+)/.exec(line) ?? /^V:\s*(\S+)/.exec(line)
    if (inline) voice = inline[1]!
    if (/^w:/.test(line)) {
      if (!isOpenSystem) systems.push({ voice, entries: [] })
      isOpenSystem = true
      systems[systems.length - 1]!.entries.push(entry(line.slice(2)))
    } else if (line.trim() && !line.startsWith('%')) {
      isOpenSystem = false
    }
  }

  const own = systems.filter((s) => s.voice === systems[0]?.voice)
  const count = Math.max(0, ...own.map((s) => s.entries.length))
  const byVerse = new Map<number, Piece[]>()
  const refrain: Piece[] = []
  let offset = 0
  for (const { entries } of own) {
    const spoken = entries.filter((e) => e.text)
    if (spoken.length === 1 && count > 1 && spoken[0]!.number === undefined) {
      refrain.push(spoken[0]!)
      continue
    }
    entries.forEach((e, index) => {
      if (e.number !== undefined) offset = e.number - index - 1
      if (!e.text) return
      const number = e.number ?? index + 1 + offset
      byVerse.set(number, [...(byVerse.get(number) ?? []), e])
    })
  }

  const verses = new Map([...byVerse].map(([number, pieces]) => [number, joinPieces(pieces)] as const))
  let last = Math.max(0, ...verses.keys())
  const written = new Set<number>()
  for (const [given, rows] of tail(lines)) {
    const number = given ?? ++last
    if (!verses.has(number)) written.add(number)
    verses.set(number, [...(verses.get(number) ?? []), ...rows])
  }
  return { verses: new Map([...verses].filter(([, rows]) => rows.length)), refrain: joinPieces(refrain), written }
}

function entry(raw: string): Entry {
  const numbered = /^\s*(\d+)(\(alt\))?[.,]~?\s*/.exec(raw)
  if (numbered?.[2]) return { text: '', isOpen: false }
  const spaced = (numbered ? raw.slice(numbered[0].length) : raw)
    .replace(/\\-/g, hyphenMark)
    .replace(/\\(.)/g, '$1')
    .replace(/[~*_|]/g, ' ')
  const isOpen = /-\s*$/.test(spaced)
  const text = dashes(spaced.replace(/\s*-\s*/g, '').replace(/\s+/g, ' ').trim())
  return { text, isOpen, ...(numbered && { number: Number(numbered[1]) }) }
}

/** A literal hyphen is either part of a compound ("heavy-hearted") or a dash between clauses. */
function dashes(text: string): string {
  return text
    .replace(new RegExp(`(\\p{L})${hyphenMark} ?(?=\\p{Ll})`, 'gu'), '$1-')
    .replace(new RegExp(`${hyphenMark}$`), '-')
    .replace(new RegExp(` ?${hyphenMark} ?`, 'g'), ' - ')
}

/** A word that runs on past the end of one system finishes on the line it began. */
function joinPieces(pieces: Piece[]): string[] {
  const rows = pieces.map((p) => ({ ...p }))
  for (let i = 0; i < rows.length - 1; i++) {
    while (rows[i]!.isOpen && rows[i + 1]) {
      const next = rows[i + 1]!
      const space = next.text.indexOf(' ')
      rows[i]!.text += space < 0 ? next.text : next.text.slice(0, space)
      next.text = space < 0 ? '' : next.text.slice(space + 1)
      if (space < 0) {
        rows[i]!.isOpen = next.isOpen
        rows.splice(i + 1, 1)
      } else rows[i]!.isOpen = false
    }
  }
  return rows.map((r) => r.text).filter(Boolean)
}

/** `W:` blocks, split by empty `W:` lines, each starting with its verse number. */
function tail(lines: string[]): [number | undefined, string[]][] {
  const blocks: string[][] = [[]]
  for (const line of lines) {
    if (!line.startsWith('W:')) continue
    const text = dashes(line.slice(2).replace(/\\-/g, hyphenMark).replace(/\\(.)/g, '$1').replace(/(?<=\S)-\s+/g, hyphenMark).replace(/\s+/g, ' ').trim())
    if (text) blocks[blocks.length - 1]!.push(text)
    else if (blocks[blocks.length - 1]!.length) blocks.push([])
  }
  return blocks
    .filter((block) => block.length)
    .map((block): [number | undefined, string[]] => {
      const numbered = /^(\d+)[.,]?\s*/.exec(block[0]!)
      if (!numbered) return [undefined, block]
      return [Number(numbered[1]), [block[0]!.slice(numbered[0].length), ...block.slice(1)].filter(Boolean)]
    })
}

/**
 * Music systems end mid-sentence ("The darkness / deepens"), so the words are re-flowed into sung
 * lines: clauses are packed up to a hymn line's usual length, and a long clause is cut near its middle.
 */
export function reflow(rows: string[]): string[] {
  const text = rows.join(' ').replace(/\s+/g, ' ').trim()
  if (!text) return []
  const clauses = text.split(/(?<=[;:.!?,])\s+/).flatMap(halve)
  const lines: string[] = []
  for (const clause of clauses) {
    const last = lines.at(-1)
    // A strong stop usually ends a sung line; only a very short opening ("Abide with me;") runs on past one.
    const canJoin = !!last && (!/[;:.!?]$/.test(last) || last.length < 18) && last.length + clause.length + 1 <= lineLength
    if (canJoin) lines[lines.length - 1] = `${last} ${clause}`
    else lines.push(clause)
  }
  return lines
}

const lineLength = 48

function halve(clause: string): string[] {
  if (clause.length <= lineLength + 4) return [clause]
  const middle = clause.length / 2
  const spaces = [...clause.matchAll(/\s/g)].map((m) => m.index!)
  if (spaces.length === 0) return [clause]
  const cut = spaces.reduce((best, at) => (Math.abs(at - middle) < Math.abs(best - middle) ? at : best))
  return [...halve(clause.slice(0, cut)), ...halve(clause.slice(cut + 1))]
}

function slides(rows: string[]): TextLine[][] {
  const lines = rows.map((text): TextLine => ({ text: text.trim(), chords: [] })).filter((line) => line.text)
  if (lines.length < 4) return [lines]
  return Array.from({ length: Math.ceil(lines.length / 2) }, (_, i) => lines.slice(i * 2, i * 2 + 2))
}
