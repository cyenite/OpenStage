import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseUsfm, parseBible } from '../bibles/parse'
import { testBibles } from '../bibles/fixture'
import { Engine } from '../engine'
import { starterLibrary } from '../starter-library'
import { readFiles } from './detect'
import { chordPro } from './formats/chordpro'
import { openLyrics } from './formats/openlyrics'
import { songSelectText, songSelectUsr } from './formats/songselect'
import { findDuplicate, mergeInto, songFromImport } from './plan'
import { rtfToText } from './rtf'
import type { ImportedSong } from './types'
import { unzip } from './zip'

const bytes = (text: string) => new TextEncoder().encode(text)
const texts = (song: ImportedSong) => song.sections.map((s) => [s.label, s.slides.map((slide) => slide.map((l) => l.text))])

function sqlite(build: (db: DatabaseSync) => void): Uint8Array {
  const folder = mkdtempSync(join(tmpdir(), 'openstage-test-'))
  const path = join(folder, 'test.sqlite')
  const db = new DatabaseSync(path)
  build(db)
  db.close()
  const data = new Uint8Array(readFileSync(path))
  rmSync(folder, { recursive: true, force: true })
  return data
}

function zip(entries: { name: string; data: string; declaredSize?: number }[]): Uint8Array {
  const parts: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const raw = Buffer.from(entry.data)
    const packed = deflateRawSync(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(entry.declaredSize ?? raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(entry.declaredSize ?? raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    parts.push(local, name, packed)
    directory.push(central, name)
    offset += 30 + name.length + packed.length
  }
  const size = directory.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...parts, ...directory, end]))
}

describe('song formats', () => {
  it('reads OpenLyrics with chords, verse order and a second language', () => {
    const xml = `<?xml version="1.0"?><song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
      <properties><titles><title>Karibu</title></titles><authors><author>A. Writer</author></authors><copyright>2020 Someone</copyright>
      <ccliNo>12345</ccliNo><key>G</key><tempo type="bpm">90</tempo><verseOrder>v1 c v1</verseOrder></properties>
      <lyrics><verse name="v1" lang="en"><lines><chord name="G"/>Welcome <chord name="C"/>here<br/>Second line</lines><lines>Next slide</lines></verse>
      <verse name="v1" lang="sw"><lines>Karibu hapa<br/>Mstari wa pili</lines><lines>Slaidi ijayo</lines></verse>
      <verse name="c" lang="en"><lines>Chorus line</lines></verse></lyrics></song>`
    const song = openLyrics('file', xml)
    expect(song).toMatchObject({ title: 'Karibu', authors: ['A. Writer'], ccli: '12345', key: 'G', tempo: 90, languages: ['en', 'sw'], order: ['Verse 1', 'Chorus', 'Verse 1'] })
    expect(texts(song)).toEqual([
      ['Verse 1', [['Welcome here', 'Second line'], ['Next slide']]],
      ['Chorus', [['Chorus line']]],
    ])
    expect(song.sections[0]!.slides[0]![0]!.chords).toEqual([{ chord: 'G', offset: 0 }, { chord: 'C', offset: 8 }])
    expect(song.sections[0]!.translations).toEqual({ sw: [['Karibu hapa', 'Mstari wa pili'], ['Slaidi ijayo']] })
    expect(songFromImport('k', song).arrangements[0]!.sectionIds).toEqual(['s1', 's2', 's1'])
  })

  it('reads ChordPro environments, comments as headings and inline chords', () => {
    const song = chordPro('file', `{title: Grace}\n{artist: John Newton}\n{key: G}\n# a comment\n{c: Verse 1}\nA[G]mazing [C]grace\n\n{soc}\nChorus words\n{eoc}\n{sov}\nSecond verse\n{eov}`)
    expect(song).toMatchObject({ title: 'Grace', authors: ['John Newton'], key: 'G' })
    expect(texts(song)).toEqual([
      ['Verse 1', [['Amazing grace']]],
      ['Chorus', [['Chorus words']]],
      ['Verse 2', [['Second verse']]],
    ])
    expect(song.sections[0]!.slides[0]![0]!.chords).toEqual([{ chord: 'G', offset: 1 }, { chord: 'C', offset: 8 }])
  })

  it('reads SongSelect .usr and .txt exports', () => {
    const usr = songSelectUsr('[File]\nType=SongSelect Import File\n[S A22025]\nTitle=Amazing Grace\nAuthor=John Newton | Edwin Excell\nCopyright=Public Domain\nKeys=G\nFields=Verse 1/tVerse 2\nWords=Line one/nLine two/tLine three/nLine four')
    expect(usr).toMatchObject({ title: 'Amazing Grace', ccli: '22025', authors: ['John Newton', 'Edwin Excell'], key: 'G' })
    expect(texts(usr)).toEqual([
      ['Verse 1', [['Line one', 'Line two']]],
      ['Verse 2', [['Line three', 'Line four']]],
    ])
    const txt = songSelectText('Amazing Grace\n\nVerse 1\nLine one\nLine two\n\nChorus\nChorus line\n\nCCLI Song # 22025\nJohn Newton\n© Words: Public Domain\nCCLI License # 1234')
    expect(txt).toMatchObject({ title: 'Amazing Grace', ccli: '22025', authors: ['John Newton'], copyright: '© Words: Public Domain' })
    expect(texts(txt)).toEqual([
      ['Verse 1', [['Line one', 'Line two']]],
      ['Chorus', [['Chorus line']]],
    ])
  })

  it('reads FreeShow, OpenLP, ProPresenter 6 and EasyWorship 6/7 through file detection', () => {
    const show = JSON.stringify(['id1', {
      name: 'Show song',
      meta: { author: 'Writer', CCLI: '777' },
      settings: { activeLayout: 'l1' },
      slides: {
        a: { group: 'Verse 1', globalGroup: 'verse', children: ['a2'], items: [{ lines: [{ text: [{ value: 'One' }], chords: [{ pos: 0, key: 'D' }] }] }] },
        a2: { group: null, items: [{ lines: [{ text: [{ value: 'Two' }] }] }] },
        b: { group: 'Chorus', items: [{ lines: [{ text: [{ value: 'Sing' }] }] }] },
      },
      layouts: { l1: { name: 'Default', slides: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] } },
    }])
    const openlp = sqlite((db) => {
      db.exec(`create table songs (id integer primary key, title text, lyrics text, verse_order text, copyright text, ccli_number text);
        create table authors (id integer primary key, first_name text, last_name text, display_name text);
        create table authors_songs (author_id integer, song_id integer, author_type text);
        insert into authors values (1, 'John', 'Newton', 'John Newton');
        insert into authors_songs values (1, 1, '');`)
      db.prepare('insert into songs values (1, ?, ?, ?, ?, ?)').run('OpenLP song', `<?xml version='1.0'?><song version="1.0"><lyrics><verse label="1" type="v"><![CDATA[[G]Line a\nLine b\n[---]\nLine c]]></verse><verse label="1" type="c"><![CDATA[Chorus]]></verse></lyrics></song>`, 'v1 c1 v1', 'PD', '42')
    })
    const pro6 = `<RVPresentationDocument CCLISongTitle="Pro song" CCLIAuthor="Writer" CCLISongNumber="99"><array rvXMLIvarName="groups">
      <RVSlideGrouping name="Verse 1" uuid="g1"><array rvXMLIvarName="slides"><RVDisplaySlide><array rvXMLIvarName="displayElements"><RVTextElement>
      <NSString rvXMLIvarName="PlainText">${Buffer.from('First line\nSecond line').toString('base64')}</NSString></RVTextElement></array></RVDisplaySlide></array></RVSlideGrouping>
      <RVSlideGrouping name="Chorus" uuid="g2"><array rvXMLIvarName="slides"><RVDisplaySlide><array rvXMLIvarName="displayElements"><RVTextElement>
      <NSString rvXMLIvarName="RTFData">${Buffer.from('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Sing \\u8217? out\\par again}').toString('base64')}</NSString></RVTextElement></array></RVDisplaySlide></array></RVSlideGrouping></array>
      <array rvXMLIvarName="arrangements"><RVSongArrangement name="Main"><array rvXMLIvarName="groupIDs"><NSString>g1</NSString><NSString>g2</NSString><NSString>g1</NSString></array></RVSongArrangement></array></RVPresentationDocument>`
    const songsDb = sqlite((db) => db.exec(`create table song (title text, author text, copyright text, reference_number text); insert into song values ('EW song', 'Writer', '2001', 'CCLI 555');`))
    const wordsDb = sqlite((db) => {
      db.exec('create table word (song_id integer, words text)')
      db.prepare('insert into word values (1, ?)').run('{\\rtf1\\ansi Verse 1\\par First\\par\\par Chorus\\par Refrain words}')
    })
    const parsed = readFiles([
      { name: 'song.show', bytes: bytes(show) },
      { name: 'songs.sqlite', bytes: openlp },
      { name: 'old.pro6', bytes: bytes(pro6) },
      { name: 'Data/Songs.db', bytes: songsDb },
      { name: 'Data/SongWords.db', bytes: wordsDb },
    ])
    const songs = Object.fromEntries(parsed.flatMap((p) => (p.kind === 'song' ? [[p.format, p.song]] : [])))
    expect(texts(songs['FreeShow']!)).toEqual([
      ['Verse 1', [['One'], ['Two']]],
      ['Chorus', [['Sing']]],
    ])
    expect(songs['FreeShow']).toMatchObject({ title: 'Show song', ccli: '777', order: ['Verse 1', 'Chorus', 'Verse 1'] })
    expect(texts(songs['OpenLP']!)).toEqual([
      ['Verse 1', [['Line a', 'Line b'], ['Line c']]],
      ['Chorus', [['Chorus']]],
    ])
    expect(songs['OpenLP']).toMatchObject({ authors: ['John Newton'], ccli: '42', order: ['Verse 1', 'Chorus', 'Verse 1'] })
    expect(texts(songs['ProPresenter 6']!)).toEqual([
      ['Verse 1', [['First line', 'Second line']]],
      ['Chorus', [['Sing ’ out', 'again']]],
    ])
    expect(songs['ProPresenter 6']).toMatchObject({ title: 'Pro song', ccli: '99', order: ['Verse 1', 'Chorus', 'Verse 1'] })
    expect(texts(songs['EasyWorship 6/7']!)).toEqual([
      ['Verse 1', [['First']]],
      ['Chorus', [['Refrain words']]],
    ])
    expect(songs['EasyWorship 6/7']).toMatchObject({ title: 'EW song', ccli: '555' })
    expect(parsed.find((p) => p.kind === 'song' && p.format === 'EasyWorship 6/7')).toHaveProperty('caution')
  })

  it('explains what it cannot read', () => {
    const parsed = readFiles([
      { name: 'new.pro', bytes: new Uint8Array([0x0a, 0x24, 0x01, 0x02, 0xff, 0x00]) },
      { name: 'Songs.db', bytes: sqlite((db) => db.exec('create table song (title text)')) },
      { name: 'other.xml', bytes: bytes('<catalog/>') },
      { name: 'broken.zip', bytes: bytes('PK\u0003\u0004 not really') },
    ])
    expect(parsed.map((p) => (p.kind === 'unreadable' ? p.format : p.kind))).toEqual(['ZIP', 'EasyWorship 6/7', 'ProPresenter 7', 'XML'])
  })
})

describe('Bible formats', () => {
  const info = { code: 'T', name: 'Test', language: 'en', notice: '' }

  it('reads USFM books, dropping notes and headings', () => {
    const bible = parseUsfm(['\\id JHN Test\n\\h John\n\\c 3\n\\s1 A heading\n\\p\n\\v 16 For \\w God|strong="G2316"\\w* so loved\\f + \\fr 3:16 \\ft note\\f* the world.\n\\v 17 Next \\wj words\\wj*\nmore text'], info)
    expect(bible.books.JHN?.[2]?.slice(15)).toEqual(['For God so loved the world.', 'Next words more text'])
  })

  it('reads USX milestones and skips heading paragraphs', () => {
    const xml = `<usx version="3.0"><book code="JHN" style="id">John</book><chapter number="3" style="c" sid="JHN 3"/><para style="s1">Heading</para>
      <para style="p"><verse number="16" style="v" sid="JHN 3:16"/>For God<note style="f">n</note> so loved.<verse eid="JHN 3:16"/></para></usx>`
    expect(parseBible(xml, 'usx', info).books.JHN?.[2]?.[15]).toBe('For God so loved.')
  })

  it('gathers an eBible.org style ZIP of USFM files into one Bible with its notice', () => {
    const archive = zip([
      { name: '44JHNswhonen.usfm', data: '\\id JHN\n\\c 3\n\\v 16 Kwa maana' },
      { name: '45ACTswhonen.usfm', data: '\\id ACT\n\\c 1\n\\v 1 Mwanzo' },
      { name: 'copr.htm', data: '<html><body><p>Copyright © Biblica. CC BY-SA 4.0</p></body></html>' },
    ])
    expect(unzip(archive).map((f) => f.name)).toEqual(['44JHNswhonen.usfm', '45ACTswhonen.usfm', 'copr.htm'])
    const [entry] = readFiles([{ name: 'swhonen_usfm.zip', bytes: archive }])
    expect(entry).toMatchObject({ kind: 'bible', format: 'USFM', bible: { code: 'SWHONEN', language: 'sw', notice: 'Copyright © Biblica. CC BY-SA 4.0' } })
    expect(entry?.kind === 'bible' && Object.keys(entry.bible.books)).toEqual(['JHN', 'ACT'])
  })
})

describe('limits on hostile files', () => {
  it('refuses a ZIP entry that inflates past the size it declares', () => {
    expect(() => unzip(zip([{ name: 'bomb.usfm', data: '\0'.repeat(1_000_000), declaredSize: 10 }]))).toThrow()
    expect(() => unzip(zip([{ name: 'short.usfm', data: 'abc', declaredSize: 100 }]))).toThrow(/not the size/)
    expect(readFiles([{ name: 'bomb.zip', bytes: zip([{ name: 'a.usfm', data: '\0'.repeat(100_000), declaredSize: 4 }]) }])[0]).toMatchObject({ kind: 'unreadable', format: 'ZIP' })
  })

  it('drops chapters past the book and verses past 200 instead of building huge arrays', () => {
    const info = { code: 'T', name: 'T', language: 'en', notice: '' }
    const usfm = parseUsfm(['\\id JHN\n\\c 3\n\\v 16 Kept\n\\v 99999999 Dropped\n\\c 999999\n\\v 1 Dropped too'], info)
    expect(usfm.books.JHN?.length).toBe(3)
    expect(usfm.books.JHN?.[2]?.length).toBe(16)
    const usx = parseBible('<usx><book code="JHN"/><chapter number="2000000"/><para style="p"><verse number="5" sid="x"/>Gone<verse eid="x"/></para></usx>', 'usx', info)
    expect(usx.books).toEqual({})
  })
})

describe('rtfToText', () => {
  it('keeps text and breaks, decodes escapes and drops tables', () => {
    expect(rtfToText("{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0;}{\\*\\generator x;}Caf\\'e9\\par Line \\u8220?two\\u8221?\\line end\\}}")).toBe('Café\nLine "two"\nend}'.replace(/"/g, (m, i) => (i < 12 ? '“' : '”')))
  })
})

describe('duplicates and merging', () => {
  const grace = starterLibrary.songs['amazing-grace']!
  const imported = (details: Partial<ImportedSong>): ImportedSong => ({
    title: 'Amazing Grace',
    authors: [],
    copyright: '',
    languages: ['en'],
    sections: [{ label: 'Verse 1', slides: [[{ text: 'Amazing grace, how sweet the sound', chords: [] }]] }],
    order: [],
    ...details,
  })
  const library = { ...starterLibrary, songs: { ...starterLibrary.songs, 'amazing-grace': { ...grace, meta: { ...grace.meta, ccli: '22025' } } } }

  it('matches by CCLI number, then title and first line, then title alone', () => {
    expect(findDuplicate(imported({ title: 'Different', ccli: '22025' }), library)?.reason).toMatch(/Same CCLI number/)
    expect(findDuplicate(imported({}), library)?.reason).toMatch(/Same title and first line/)
    expect(findDuplicate(imported({ sections: [{ label: 'V', slides: [[{ text: 'Totally other words', chords: [] }]] }] }), library)?.reason).toMatch(/lyrics start differently/)
    expect(findDuplicate(imported({ title: 'New song' }), library)).toBeNull()
  })

  it('merges only details the existing song lacks', () => {
    const merged = mergeInto(grace, imported({ authors: ['Someone else'], ccli: '22025', key: 'G', copyright: 'Changed' }))
    expect(merged.meta).toEqual({ authors: ['John Newton'], copyright: 'Public domain', ccli: '22025', key: 'G' })
    expect(merged.sections).toBe(grace.sections)
  })
})

describe('Engine imports', () => {
  it('previews, then applies the operator’s choices without overwriting anything silently', () => {
    const saved: string[] = []
    const engine = new Engine({ bibles: testBibles, library: starterLibrary, onBibleImported: (b) => saved.push(b.code) })
    const query = (q: object) => (engine as unknown as { query(q: object): { type: string; plan?: { importId: string; items: { key: string; status: string; title: string }[] }; report?: unknown } }).query(q)
    const files = [
      { name: 'grace.cho', data: bytes('{title: Amazing Grace}\n{key: A}\nAmazing grace, how sweet the sound').buffer },
      { name: 'new.txt', data: bytes('Brand New Song\n\nFirst line\nSecond line').buffer },
      { name: 'Bible.xml', data: bytes('<XMLBIBLE biblename="Test Bible"><BIBLEBOOK bnumber="43"><CHAPTER cnumber="3"><VERS vnumber="16">Text</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>').buffer },
    ]
    const plan = query({ type: 'import.preview', files }).plan!
    expect(plan.items.map((i) => [i.title, i.status])).toEqual([
      ['Amazing Grace', 'duplicate'],
      ['Brand New Song', 'new'],
      ['Test Bible', 'new'],
    ])
    const report = query({ type: 'import.apply', importId: plan.importId, decisions: { i0: 'merge' }, bibles: { i2: { code: 'TST', name: 'Test Bible', language: 'en', notice: 'Mine' } } }).report
    expect(report).toEqual({ added: ['Brand New Song', 'Test Bible (TST)'], merged: ['Amazing Grace'], skipped: [], failed: [] })
    expect(engine.documents.songs['amazing-grace']!.meta.key).toBe('A')
    expect(Object.values(engine.documents.songs).filter((s) => s.title === 'Amazing Grace')).toHaveLength(1)
    expect(saved).toEqual(['TST'])
    expect(engine.snapshot().bibles.map((b) => b.code)).toContain('TST')

    const again = query({ type: 'import.preview', files: [files[0], files[2]] }).plan!
    expect(again.items.map((i) => i.status)).toEqual(['duplicate', 'new'])
    const second = query({ type: 'import.apply', importId: again.importId, decisions: { i1: 'add' }, bibles: { i1: { code: 'TST', name: 'Test Bible', language: 'en', notice: '' } } }).report
    expect(second).toEqual({ added: [], merged: [], skipped: ['Amazing Grace'], failed: [{ title: 'Test Bible', reason: 'The code TST is already in use.' }] })
    expect(query({ type: 'import.apply', importId: again.importId, decisions: {}, bibles: {} }).report).toMatchObject({ failed: [{ reason: expect.stringMatching(/expired/) }] })
  })
})
