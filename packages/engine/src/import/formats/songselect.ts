import { fromChordText } from '@openstage/shared'
import type { ImportedSong } from '../types'
import { songFromText } from './text-songs'

/** SongSelect `.usr`: INI-like, with `Fields` and `Words` split by `/t` and lines by `/n`. */
export function songSelectUsr(source: string): ImportedSong {
  const values = new Map<string, string>()
  let ccli = ''
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const header = /^\[S\s+[A-Z]?(\d+)\]/.exec(line)
    if (header) ccli = header[1]!
    const pair = /^([A-Za-z]+)=(.*)$/.exec(line)
    if (pair) values.set(pair[1]!.toLowerCase(), pair[2]!)
  }
  const fields = (values.get('fields') ?? '').split('/t')
  const words = (values.get('words') ?? '').split('/t')
  const sections = fields
    .map((label, index) => ({ label: label.trim() || `Verse ${index + 1}`, text: words[index] ?? '' }))
    .filter((s) => s.text.trim())
    .map((s) => ({ label: s.label, slides: [s.text.split('/n').map((line) => fromChordText(line.trim()))] }))
  return {
    title: values.get('title')?.trim() || 'Untitled song',
    authors: splitAuthors(values.get('author') ?? ''),
    copyright: (values.get('copyright') ?? '').replace(/\|/g, '; ').trim(),
    ...(ccli && { ccli }),
    ...(values.get('keys') && { key: values.get('keys')!.split(/[,/]/)[0]!.trim() }),
    languages: ['en'],
    sections,
    order: [],
  }
}

/** SongSelect's lyrics `.txt`: title, sections with bare headings, then a footer from "CCLI Song #". */
export function songSelectText(source: string): ImportedSong {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const footer = lines.findIndex((l) => /^CCLI Song #/i.test(l.trim()))
  const body = lines.slice(0, footer)
  const titleIndex = body.findIndex((l) => l.trim())
  const title = body[titleIndex]?.trim() ?? 'Untitled song'
  const tail = lines.slice(footer).map((l) => l.trim()).filter(Boolean)
  const ccli = /CCLI Song #\s*(\d+)/i.exec(tail[0] ?? '')?.[1]
  const authors = tail[1] && !/^©|^\(c\)|^CCLI|^For use/i.test(tail[1]) ? splitAuthors(tail[1]) : []
  const copyright = tail.filter((l) => /^©|^\(c\)|copyright/i.test(l)).join('; ')
  return songFromText(title, body.slice(titleIndex + 1).join('\n'), { ...(ccli && { ccli }), authors, copyright })
}

export function isSongSelectText(source: string): boolean {
  return /^CCLI Song #\s*\d+/im.test(source)
}

function splitAuthors(value: string): string[] {
  return value
    .split(/\s*[|,;]\s*|\s+and\s+/)
    .map((a) => a.trim())
    .filter(Boolean)
}
