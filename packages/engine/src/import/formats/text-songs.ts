import { parseLyrics } from '@openstage/shared'
import type { ImportedSong } from '../types'

/** Pasted-lyrics rules for any format that is text with headings: blank lines split slides, headings start sections. */
export function songFromText(title: string, lyrics: string, details: Partial<ImportedSong> = {}): ImportedSong {
  const parsed = parseLyrics(lyrics)
  return {
    title,
    authors: [],
    copyright: '',
    languages: ['en'],
    ...details,
    sections: parsed.sections.map((s) => ({ label: s.label, slides: s.slides.map((slide) => slide.lines) })),
    order: parsed.order.map((index) => parsed.sections[index]!.label),
  }
}

/** A plain text file: the first line is the title when a blank line follows it, else the file name is. */
export function plainText(fileTitle: string, source: string): ImportedSong {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const hasTitle = lines.length > 2 && lines[0]!.trim() && !lines[1]!.trim()
  return songFromText(hasTitle ? lines[0]!.trim() : fileTitle, hasTitle ? lines.slice(2).join('\n') : source)
}
