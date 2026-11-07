import { SaxesParser, type SaxesTagPlain } from 'saxes'
import type { Chord, TextLine } from '@openstage/shared'
import type { ImportedSection, ImportedSong } from '../types'

const verseNames: Record<string, string> = { v: 'Verse', c: 'Chorus', b: 'Bridge', p: 'Pre-chorus', i: 'Intro', e: 'Ending', o: 'Other', t: 'Tag' }

/** "v1" → "Verse 1", "c" → "Chorus", as OpenLyrics and OpenLP name verses. */
export function verseLabel(name: string): string {
  const match = /^([a-z])(\d*)([a-z]?)$/i.exec(name.trim())
  if (!match || !verseNames[match[1]!.toLowerCase()]) return name
  return [verseNames[match[1]!.toLowerCase()], match[2]].filter(Boolean).join(' ')
}

/**
 * OpenLyrics 0.8 and 0.9. Each `<lines>` is a slide; `<br/>` breaks lines; `<chord name>` or
 * `<chord root>` marks a chord. Verses with the same name in other languages become translations.
 */
export function openLyrics(fileTitle: string, xml: string): ImportedSong {
  const parser = new SaxesParser()
  const song: ImportedSong = { title: '', authors: [], copyright: '', languages: [], sections: [], order: [] }
  const path: string[] = []
  const verses = new Map<string, Map<string, TextLine[][]>>()
  let field = ''
  let buffer = ''
  let verse: { name: string; lang: string } | null = null
  let slide: TextLine[] | null = null
  let line: TextLine = { text: '', chords: [] }
  let isComment = false

  const endLine = () => {
    if (slide) slide.push({ text: line.text.trim(), chords: line.chords })
    line = { text: '', chords: [] }
  }

  parser.on('opentag', (tag: SaxesTagPlain) => {
    const name = tag.name.replace(/^.*:/, '')
    const attr = (key: string) => (typeof tag.attributes[key] === 'string' ? (tag.attributes[key] as string) : '')
    path.push(name)
    buffer = ''
    if (name === 'verse') verse = { name: attr('name') || `v${verses.size + 1}`, lang: attr('lang') || attr('xml:lang') || '' }
    else if (name === 'lines' && verse) {
      slide = []
      line = { text: '', chords: [] }
    } else if (name === 'br') endLine()
    else if (name === 'chord') {
      const chord = attr('name') || [attr('root'), attr('structure') === 'min' ? 'm' : ''].join('') + (attr('bass') ? `/${attr('bass')}` : '')
      if (chord) line.chords.push({ chord, offset: line.text.replace(/^\s+/, '').length } as Chord)
    } else if (name === 'comment') isComment = true
    else if (['title', 'author', 'copyright', 'ccliNo', 'key', 'tempo', 'verseOrder'].includes(name)) field = name
  })
  parser.on('closetag', (tag) => {
    const name = tag.name.replace(/^.*:/, '')
    path.pop()
    if (name === 'lines' && verse && slide) {
      endLine()
      const byLang = verses.get(verse.name) ?? new Map<string, TextLine[][]>()
      byLang.set(verse.lang, [...(byLang.get(verse.lang) ?? []), slide.filter((l, i, all) => l.text || i < all.length - 1)])
      verses.set(verse.name, byLang)
      if (!song.languages.includes(verse.lang)) song.languages.push(verse.lang)
      slide = null
    } else if (name === 'verse') verse = null
    else if (name === 'comment') isComment = false
    else if (field === name) {
      const value = buffer.trim()
      if (name === 'title' && !song.title) song.title = value
      else if (name === 'author' && value) song.authors.push(value)
      else if (name === 'copyright') song.copyright = value
      else if (name === 'ccliNo') song.ccli = value
      else if (name === 'key') song.key = value
      else if (name === 'tempo' && Number(value) > 0) song.tempo = Number(value)
      else if (name === 'verseOrder') song.order = value.split(/\s+/).filter(Boolean).map(verseLabel)
      field = ''
    }
  })
  parser.on('text', (value) => {
    if (slide && !isComment) line.text += line.text ? value : value.replace(/^\s+/, '')
    else buffer += value
  })
  parser.write(xml.replace(/^﻿/, '')).close()

  const [main = '', ...others] = song.languages
  song.languages = [main || 'en', ...others.filter(Boolean)]
  song.sections = [...verses].map(([name, byLang]): ImportedSection => {
    const translations = Object.fromEntries(others.filter((l) => byLang.has(l)).map((l) => [l, byLang.get(l)!.map((s) => s.map((x) => x.text))]))
    return { label: verseLabel(name), slides: byLang.get(main) ?? [...byLang.values()][0] ?? [], ...(Object.keys(translations).length && { translations }) }
  })
  song.title ||= fileTitle
  return song
}

export function isOpenLyrics(xml: string): boolean {
  return /<song[\s>][\s\S]*openlyrics/i.test(xml.slice(0, 2000))
}
