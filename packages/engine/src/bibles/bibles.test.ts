import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseReference, passageSlides, versesFor } from '@openstage/shared'
import { parseBible } from './parse'
import { loadBibles } from './store'

const info = { code: 'T', name: 'Test', notice: '', language: 'en' }

describe('parseBible', () => {
  it('reads OSIS milestone verses and skips notes and titles', () => {
    const xml = `<osis><osisText><div type="book" osisID="John"><chapter sID="John.3.seID.1" osisID="John.3" n="3"/>
      <title>Heading</title><verse sID="a" osisID="John.3.16" n="16"/>For God <transChange>so</transChange> loved<note>a note</note> the world.<verse eID="a"/>
      <verse sID="b" osisID="John.3.17"/>Second verse.<verse eID="b"/><chapter eID="John.3.seID.1"/></div>
      <div type="book" osisID="Tob"><chapter osisID="Tob.1"/><verse osisID="Tob.1.1">Apocrypha</verse></div></osisText></osis>`
    const bible = parseBible(xml, 'osis', info)
    expect(bible.books.JHN?.[2]?.slice(15)).toEqual(['For God so loved the world.', 'Second verse.'])
    expect(Object.keys(bible.books)).toEqual(['JHN'])
  })

  it('reads USFX and drops footnotes and cross references', () => {
    const xml = `<usfx><book id="FRT"><p>Preface</p></book><book id="JHN"><c id="3"/><p><v id="16"/><w s="G1">For</w> God<f caller="+"><fr>3:16</fr><ft>Note</ft></f> so loved.<ve/>
      <v id="17"/>Next<x><xt>Ref</xt></x> one.<ve/></p></book></usfx>`
    const bible = parseBible(xml, 'usfx', info)
    expect(bible.books.JHN?.[2]?.slice(15)).toEqual(['For God so loved.', 'Next one.'])
  })

  it('reads Zefania with a byte order mark', () => {
    const xml = `﻿<?xml version="1.0"?><XMLBIBLE><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="16">For God <NOTE>n</NOTE>so loved.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`
    expect(parseBible(xml, 'zefania', info).books.JHN?.[2]?.[15]).toBe('For God so loved.')
  })
})

describe('bundled Bibles', () => {
  it('load and give John 3:16 in every translation, splitting the longest verse', async () => {
    const problems: unknown[] = []
    const bibles = await loadBibles([join(import.meta.dirname, '../../../../apps/desktop/resources/bibles')], (_, e) => problems.push(e))
    expect(problems).toEqual([])
    expect(bibles.map((b) => b.code).sort()).toEqual(['ASV', 'BBE', 'BSB', 'KJV', 'WEB'])
    const john = parseReference('jn 3 16')
    if (!john.ok) throw new Error(john.error)
    for (const row of versesFor(john.ref, bibles)) expect(Object.values(row.texts).every((t) => t?.startsWith('For God'))).toBe(true)
    const esther = parseReference('esther 8 9')
    if (!esther.ok) throw new Error(esther.error)
    const kjv = bibles.find((b) => b.code === 'KJV')!
    const slides = passageSlides(esther.ref, versesFor(esther.ref, [kjv]), { translations: ['KJV'], versesPerSlide: 1, splitLong: true }, bibles)
    expect(slides.length).toBeGreaterThan(2)
    expect(slides.map((s) => s.label)[0]).toBe('Verse 9a')
  })
})
