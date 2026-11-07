import { SaxesParser, type SaxesTagPlain } from 'saxes'
import { fromChordText } from '@openstage/shared'
import { rtfToText } from '../rtf'
import type { ImportedSection, ImportedSong } from '../types'

/**
 * ProPresenter 6 (`.pro6`, and `.pro` from 5 and 6): XML whose slide groups hold text elements with
 * base64 `PlainText` or `RTFData`, and arrangements that list group ids.
 */
export function proPresenter6(fileTitle: string, xml: string): ImportedSong {
  const parser = new SaxesParser()
  const song: ImportedSong = { title: '', authors: [], copyright: '', languages: ['en'], sections: [], order: [] }
  const groups: { id: string; section: ImportedSection }[] = []
  const arrangements: { name: string; ids: string[] }[] = []
  let group: { id: string; section: ImportedSection } | null = null
  let slideTexts: string[] | null = null
  let ivar = ''
  let buffer = ''
  let arrangement: { name: string; ids: string[] } | null = null

  parser.on('opentag', (tag: SaxesTagPlain) => {
    const a = (key: string) => (typeof tag.attributes[key] === 'string' ? (tag.attributes[key] as string) : '')
    if (tag.name === 'RVPresentationDocument') {
      song.title = a('CCLISongTitle')
      song.authors = a('CCLIAuthor') ? a('CCLIAuthor').split(/\s*[,;|]\s*/) : []
      song.copyright = [a('CCLICopyrightYear'), a('CCLIPublisher')].filter(Boolean).join(' ')
      if (a('CCLISongNumber')) song.ccli = a('CCLISongNumber')
    } else if (tag.name === 'RVSlideGrouping') {
      group = { id: a('uuid'), section: { label: a('name') || `Group ${groups.length + 1}`, slides: [] } }
    } else if (tag.name === 'RVDisplaySlide') {
      slideTexts = []
    } else if (tag.name === 'RVSongArrangement') {
      arrangement = { name: a('name'), ids: [] }
    } else if (tag.name === 'NSString') {
      ivar = a('rvXMLIvarName')
      buffer = ''
    }
  })
  parser.on('text', (value) => {
    buffer += value
  })
  parser.on('closetag', (tag) => {
    if (tag.name === 'NSString') {
      if (slideTexts && (ivar === 'PlainText' || ivar === 'RTFData') && buffer.trim()) {
        const decoded = Buffer.from(buffer.trim(), 'base64').toString('utf8')
        slideTexts.push(ivar === 'RTFData' ? `rtf:${rtfToText(decoded)}` : `txt:${decoded}`)
      } else if (arrangement && !ivar) {
        arrangement.ids.push(buffer.trim())
      }
      ivar = ''
    } else if (tag.name === 'RVDisplaySlide' && group && slideTexts) {
      const plain = slideTexts.find((t) => t.startsWith('txt:')) ?? slideTexts.find((t) => t.startsWith('rtf:'))
      const lines = (plain?.slice(4) ?? '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim())
      if (lines.length) group.section.slides.push(lines.map((l) => fromChordText(l.trim())))
      slideTexts = null
    } else if (tag.name === 'RVSlideGrouping' && group) {
      groups.push(group)
      group = null
    } else if (tag.name === 'RVSongArrangement' && arrangement) {
      arrangements.push(arrangement)
      arrangement = null
    }
  })
  parser.write(xml.replace(/^﻿/, '')).close()
  song.sections = groups.map((g) => g.section).filter((s) => s.slides.length)
  const first = arrangements.find((a) => a.ids.length)
  song.order = first ? first.ids.map((id) => groups.find((g) => g.id === id)?.section.label).filter((l): l is string => !!l) : []
  song.title ||= fileTitle
  return song
}

export function isProPresenter6(xml: string): boolean {
  return /<RVPresentationDocument[\s>]/.test(xml.slice(0, 4000))
}
