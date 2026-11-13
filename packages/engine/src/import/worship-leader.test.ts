import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Fetcher } from '../bibles/biblecom'
import { SongSourceError, WorshipLeaderClient, parseLanguages, parsePack, songFromSongXml } from './worship-leader'

const encode = (text: string) => new TextEncoder().encode(text)
const cebuano = readFileSync(new URL('./fixtures/worship-leader-ceb.json', import.meta.url), 'utf8')

const index = JSON.stringify({
  sw: { count: 143, size: 200000, name: { en: 'Swahili', de: 'Suaheli' } },
  en: { count: 3479, size: 9000000, name: { en: 'English' } },
  ceb: { count: 2, size: 7677, name: { en: 'Cebuano' } },
  'zh-TW': { count: 12, size: 3000, name: { zh: '繁體中文' } },
  empty: { count: 0, size: 10, name: { en: 'Nothing' } },
})

describe('parseLanguages', () => {
  it('uses the English name, falls back to the code, drops empty packs and sorts by name', () => {
    expect(parseLanguages(index)).toEqual([
      { code: 'ceb', name: 'Cebuano', count: 2 },
      { code: 'en', name: 'English', count: 3479 },
      { code: 'sw', name: 'Swahili', count: 143 },
      { code: 'zh-TW', name: 'zh-TW', count: 12 },
    ])
  })

  it('rejects an answer that is not an object', () => {
    expect(() => parseLanguages('[]')).toThrow(SongSourceError)
    expect(() => parseLanguages('<html>')).toThrow(SongSourceError)
  })
})

describe('parsePack on the Cebuano pack', () => {
  const { songs, imported } = parsePack(cebuano, 'ceb')
  const first = imported.get(103973)!
  const second = imported.get(111029)!

  it('lists both songs with their first line', () => {
    expect(songs).toEqual([
      { id: 103973, title: 'Qekeumet', authors: [], firstLine: 'Kequ etm qekemezet tme equtm teyefxet', isRestricted: false, language: 'ceb' },
      { id: 111029, title: 'Kouy etm qeraceyet qu', authors: [], firstLine: 'Mo atzuy su etm zetetm qeyeqozet un Kouy', isRestricted: false, language: 'ceb' },
    ])
  })

  it('reads details and uses headings as labels', () => {
    expect(first).toMatchObject({ title: 'Qekeumet', key: 'D', languages: ['ceb'], copyright: '', authors: [] })
    expect(first.sections.map((section) => section.label)).toEqual([
      'Verse 1',
      'Pre-chorus 1',
      'Verse 2',
      'Chorus 1',
      'Verse',
      'Pre-chorus',
      'Chorus 2',
      'Instrumental',
      'Pre-chorus 2',
      'Chorus 3',
    ])
    expect(first.order).toEqual(first.sections.map((section) => section.label))
  })

  it('drops chord-only lines and heading lines', () => {
    const preChorus = first.sections[1]!
    expect(preChorus.slides).toEqual([[{ text: 'Etm mamse su un Kofuy (etm mamse su un Kofuy)', chords: [{ chord: 'Em', offset: 10 }, { chord: 'D/F#', offset: 29 }] }]])
  })

  it('puts chords on the letters they were written before', () => {
    const [line] = first.sections[0]!.slides[0]!
    expect(line!.text).toBe('Kequ etm qekemezet tme equtm teyefxet')
    const letters = line!.chords.map(({ chord, offset }) => [chord, line!.text.slice(offset, offset + 1)])
    expect(letters).toEqual([['G', 'K'], ['D', 'e'], ['A/C#', 'e']])
    expect(line!.chords.map((chord) => chord.offset)).toEqual([0, 23, 30])
  })

  it('attaches trailing chords at the end of the line, one per chord name', () => {
    const lastLine = first.sections[3]!.slides[0]!.at(-1)!
    expect(lastLine.text).toBe("Oqec Un Kofuy, etm qetatef'tm qeahet.")
    expect(lastLine.chords).toEqual([
      { chord: 'Bm', offset: 0 },
      { chord: 'G', offset: 25 },
      { chord: 'A', offset: 37 },
      { chord: 'G', offset: 37 },
      { chord: 'A', offset: 37 },
    ])
  })

  it('keeps blocks of four lines whole and splits longer ones into pairs', () => {
    expect(first.sections[0]!.slides).toHaveLength(1)
    expect(second.sections[0]!.slides.map((slide) => slide.length)).toEqual([2, 2, 2])
    expect(second.sections[2]!.slides.map((slide) => slide.length)).toEqual([2, 2, 2])
  })

  it('labels bare elements by type', () => {
    expect(second.sections.map((section) => section.label)).toEqual(['Verse 1', 'Pre-chorus 1', 'Chorus 1', 'Verse 2', 'Pre-chorus 2', 'Chorus 2', 'Chorus 3'])
  })
})

describe('parsePack entries', () => {
  const xml = '<verse>Joy to the <chord>G</chord>world</verse>'

  it('reads the restricted flag, authors and key from compressed and full keys', () => {
    const body = JSON.stringify({
      data: [
        { i: 1, 8: 'Short Keys', x: xml, C: 1, k: 'Bb', I: [{ z: 'words', v: 'Ann' }, { z: 'music', v: 'Ben' }, { z: 'tempo', v: '90' }] },
        { id: 2, title: 'Long Keys', songxml: xml, copyright_restricted: 0, songkey: 'Dm7', info: [{ type: 'wordsandmusic', value: 'Cy' }, { type: 'words', value: 'Cy' }] },
        { id: 3, title: 'Has Text', songxml: xml, copyright_restricted: true, info: [{ type: 'copyright', value: '2001 Some Church' }] },
      ],
    })
    const { songs, imported } = parsePack(body, 'sw')
    expect(songs).toEqual([
      { id: 1, title: 'Short Keys', authors: ['Ann', 'Ben'], firstLine: 'Joy to the world', isRestricted: true, language: 'sw' },
      { id: 2, title: 'Long Keys', authors: ['Cy'], firstLine: 'Joy to the world', isRestricted: false, language: 'sw' },
      { id: 3, title: 'Has Text', authors: [], firstLine: 'Joy to the world', isRestricted: true, language: 'sw' },
    ])
    expect(imported.get(1)).toMatchObject({ copyright: 'Copyright restricted (Worship Leader)', key: 'Bb', languages: ['sw'] })
    expect(imported.get(2)).toMatchObject({ copyright: '', key: undefined })
    expect(imported.get(3)).toMatchObject({ copyright: '2001 Some Church' })
  })

  it('uses the primary subtag as the song language', () => {
    expect(parsePack(JSON.stringify({ data: [{ i: 1, 8: 'T', x: xml }] }), 'zh-TW').imported.get(1)!.languages).toEqual(['zh'])
  })

  it('skips entries without an id, title or songxml, and songs with no words', () => {
    const body = JSON.stringify({
      data: [
        { 8: 'No id', x: xml },
        { i: 2, x: xml },
        { i: 3, 8: 'No xml' },
        { i: 4, 8: 'Chords only', x: '<verse><chord>G</chord><br />G A</verse>' },
        { i: 5, 8: 'Kept', x: xml },
        'junk',
      ],
    })
    expect(parsePack(body, 'en').songs.map((song) => song.id)).toEqual([5])
  })

  it('rejects an answer without a song list', () => {
    expect(() => parsePack('{"songs":[]}', 'en')).toThrow(SongSourceError)
    expect(() => parsePack('nope', 'en')).toThrow(SongSourceError)
  })
})

describe('songFromSongXml', () => {
  it('numbers unlabelled blocks of each type and leaves a lone chorus bare', () => {
    const song = songFromSongXml('T', '<verse>One</verse><chorus>Sing</chorus><verse>Two</verse><bridge>Over</bridge><prechorus>Up</prechorus>', {})
    expect(song.sections.map((section) => section.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Bridge', 'Pre-chorus'])
  })

  it('repeats a section in the order when the markup repeats it, and renames differing sections that share a label', () => {
    const song = songFromSongXml('T', '<verse>Chorus<br />Same</verse><verse>Verse 1<br />Alone</verse><verse>Chorus<br />Same</verse><verse>Chorus<br />Other</verse>', {})
    expect(song.sections.map((section) => section.label)).toEqual(['Chorus', 'Verse 1', 'Chorus 2'])
    expect(song.order).toEqual(['Chorus', 'Verse 1', 'Chorus', 'Chorus 2'])
  })

  it('decodes entities, flats, repeat marks and ignores chord-only content', () => {
    const song = songFromSongXml('T', '<verse>Chorus (2x)<br /><indent>Rock &amp; <chord>B&amp;</chord>roll<repeat count="2">Hey</repeat><br />  <chord>G</chord>  <br /></verse><chorus><chordsonly>G A</chordsonly>Hi</chorus>', {})
    expect(song.sections[0]).toEqual({ label: 'Chorus', slides: [[{ text: 'Rock & roll // Hey //', chords: [{ chord: 'Bb', offset: 7 }] }]] })
    expect(song.sections[1]!.slides[0]![0]!.text).toBe('Hi')
  })

  it('keeps the caller details but takes the given title', () => {
    expect(songFromSongXml('Mine', '<verse>Hi</verse>', { title: 'Other', authors: ['A'], copyright: 'C' })).toMatchObject({ title: 'Mine', authors: ['A'], copyright: 'C', languages: [] })
  })
})

describe('WorshipLeaderClient', () => {
  const record = (status: number, body: string) => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const fetcher: Fetcher = async (url, headers) => {
      calls.push({ url, headers })
      return { status, body: encode(body) }
    }
    return { calls, client: new WorshipLeaderClient(fetcher) }
  }

  it('asks for the index and a pack with the headers', async () => {
    const { calls, client } = record(200, index)
    expect((await client.languages()).map((language) => language.code)).toContain('sw')
    expect(calls[0]!.url).toBe('https://songs.worshipleaderapp.com/db2/db.index.json')
    expect(calls[0]!.headers).toEqual({ 'Accept-Language': 'en', 'User-Agent': 'OpenStage/1.0 (church presentation software)' })

    const packs = record(200, cebuano)
    expect((await packs.client.pack('ceb')).songs).toHaveLength(2)
    expect(packs.calls[0]!.url).toBe('https://songs.worshipleaderapp.com/db2/db.ceb.json')
    expect((await packs.client.pack('zh-TW')).songs).toHaveLength(2)
    expect(packs.calls[1]!.url).toBe('https://songs.worshipleaderapp.com/db2/db.zh-TW.json')
  })

  it.each([403, 429])('reports status %i as a refusal', async (status) => {
    const error = await record(status, '').client.languages().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SongSourceError)
    expect(error).toMatchObject({
      isRefused: true,
      message: 'The Worship Leader song server is not accepting requests from this computer right now. Try again later.',
    })
  })

  it('reports other statuses with the number', async () => {
    const error = await record(500, '').client.pack('sw').catch((caught: unknown) => caught)
    expect(error).toMatchObject({ isRefused: false, message: 'The Worship Leader song server answered with error 500.' })
  })

  it('reports a thrown fetch as no connection', async () => {
    const client = new WorshipLeaderClient(async () => {
      throw new Error('offline')
    })
    await expect(client.languages()).rejects.toMatchObject({
      isRefused: false,
      message: 'No connection to the Worship Leader song server. Connect, then try again.',
    })
  })

  it('reports an unreadable answer', async () => {
    const { client } = record(200, '<html>')
    await expect(client.languages()).rejects.toMatchObject({ message: 'The Worship Leader song server sent an answer that could not be read.' })
    await expect(client.pack('sw')).rejects.toBeInstanceOf(SongSourceError)
  })

  it.each(['', 'EN', 'e', 'english', '../x', 'sw/../x', 'sw?x=1', 'sw-', 'sw-toolonglabel'])('builds no request for the code %j', async (code) => {
    const { calls, client } = record(200, cebuano)
    await expect(client.pack(code)).rejects.toBeInstanceOf(SongSourceError)
    expect(calls).toEqual([])
  })
})
