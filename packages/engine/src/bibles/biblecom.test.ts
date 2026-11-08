import { access, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BibleComClient,
  BibleComError,
  DownloadCancelled,
  chapterMarkup,
  downloadVersion,
  parseCatalog,
  parseDetails,
  parseVerses,
  type Fetcher,
  type RemoteVersion,
} from './biblecom'

const encode = (text: string) => new TextEncoder().encode(text)
const fixture = new Uint8Array(readFileSync(new URL('./fixtures/psa23-kjv.rsc', import.meta.url)))
const version: RemoteVersion = { id: 7, title: 'Test Bible', abbreviation: 'TST', languageTag: 'eng', languageName: 'English', language: 'en' }

describe('parseCatalog', () => {
  const versions = [
    { id: 1, title: 'King James Version', abbreviation: 'KJV', text: true, language: { language_tag: 'eng', name: 'English', iso_639_1: 'EN', iso_639_3: 'eng' } },
    { id: 2, title: 'Audio Only', abbreviation: 'AUD', text: false, language: { language_tag: 'eng', name: 'English' } },
    {
      id: 3,
      title: 'Swahili Union',
      local_title: 'Biblia Habari Njema',
      abbreviation: 'SWH',
      local_abbreviation: 'BHN',
      text: true,
      language: { language_tag: 'swh', name: 'Swahili', local_name: 'Kiswahili', iso_639_3: 'SWH' },
    },
    { id: 4, title: 'Tagged', abbreviation: 'TAG', text: true, language: { language_tag: 'KIK', name: 'Kikuyu' } },
  ]

  it('keeps text versions, prefers local names and lower cases the language code', () => {
    const expected = [
      { id: 1, title: 'King James Version', abbreviation: 'KJV', languageTag: 'eng', languageName: 'English', language: 'en' },
      { id: 3, title: 'Biblia Habari Njema', abbreviation: 'BHN', languageTag: 'swh', languageName: 'Kiswahili', language: 'swh' },
      { id: 4, title: 'Tagged', abbreviation: 'TAG', languageTag: 'KIK', languageName: 'Kikuyu', language: 'kik' },
    ]
    expect(parseCatalog(JSON.stringify({ response: { data: { versions } } }))).toEqual(expected)
    expect(parseCatalog(JSON.stringify({ data: { versions } }))).toEqual(expected)
    expect(parseCatalog(JSON.stringify({ versions }))).toEqual(expected)
  })

  it('returns nothing for an answer without versions and rejects non-JSON', () => {
    expect(parseCatalog('{"response":{"data":{}}}')).toEqual([])
    expect(() => parseCatalog('<html>')).toThrow(BibleComError)
  })
})

describe('parseDetails', () => {
  const body = JSON.stringify({
    copyright_short: { text: '  Public Domain  ' },
    books: [
      {
        usfm: 'RUT',
        human: ' Ruth ',
        chapters: [
          { usfm: 'RUT.1', canonical: true },
          { usfm: 'RUT.INTRO1', canonical: true },
          { usfm: 'RUT.2', canonical: false },
          { usfm: 'RUT.3', canonical: true },
        ],
      },
      { usfm: 'XXX', human: 'Unknown', chapters: [{ usfm: 'XXX.1', canonical: true }] },
      { usfm: 'GEN', chapters: [{ usfm: 'GEN.1', canonical: true }] },
    ],
  })

  it('drops unknown books and non-canonical chapters, and sorts in canon order', () => {
    expect(parseDetails(body).books).toEqual([
      { book: 'GEN', name: 'Genesis', chapters: ['GEN.1'] },
      { book: 'RUT', name: 'Ruth', chapters: ['RUT.1', 'RUT.3'] },
    ])
  })

  it('trims the copyright and returns null when it is empty or missing', () => {
    expect(parseDetails(body).copyright).toBe('Public Domain')
    expect(parseDetails('{"copyright_short":{"text":"  "},"books":[]}').copyright).toBeNull()
    expect(parseDetails('{"books":[]}').copyright).toBeNull()
  })
})

describe('chapterMarkup', () => {
  it('slices the version row by its byte length, which counts multi-byte text', () => {
    const markup = '<div class="version"><span class="verse v1" data-usfm="GEN.1.1">Mwanzo wa Ṣ</span></div>'
    const length = new TextEncoder().encode(markup).length.toString(16)
    const body = encode(`1:"é"\n2:T${length},${markup}3:["after"]\n`)
    expect(chapterMarkup(body)).toBe(markup)
  })

  it('clamps a row that claims more bytes than the body holds', () => {
    const markup = '<div class="version"><span data-usfm="GEN.1.1">x</span></div>'
    expect(chapterMarkup(encode(`0:x\n2:Tffff,${markup}`))).toBe(markup)
  })

  it('reads the real Psalm 23 response', () => {
    const markup = chapterMarkup(fixture)
    expect(markup.startsWith('<div class="version vid1')).toBe(true)
    expect(markup.endsWith('</div>')).toBe(true)
  })

  it('accepts plain markup without a row and rejects other formats', () => {
    expect(chapterMarkup(encode('<p><span data-usfm="GEN.1.1">x</span></p>'))).toContain('data-usfm=')
    expect(() => chapterMarkup(encode('junk'))).toThrow('unknown format')
  })

  it('reports a human check as refused', () => {
    for (const body of ['<title>CAPTCHA</title>', '\n2:T4,<div class="version"> _fs-ch-1']) {
      const attempt = () => chapterMarkup(encode(body))
      expect(attempt).toThrow(BibleComError)
      expect(attempt).toThrow(expect.objectContaining({ isRefused: true }))
    }
  })
})

describe('parseVerses', () => {
  it('reads Psalm 23 without verse labels or the title', () => {
    const verses = parseVerses(chapterMarkup(fixture))
    expect([...verses.keys()]).toEqual([1, 2, 3, 4, 5, 6])
    expect(verses.get(1)).toBe('The LORD is my shepherd; I shall not want.')
    expect(verses.get(2)).toBe('He maketh me to lie down in green pastures: He leadeth me beside the still waters.')
    expect(verses.get(6)).toBe('Surely goodness and mercy shall follow me all the days of my life: And I will dwell in the house of the LORD for ever.')
    expect([...verses.values()].join(' ')).not.toContain('A Psalm of David')
  })

  it('accepts hashed class names and skips notes and labels with their descendants', () => {
    const markup = `<div class="cat7xG_chapter">
      <span class="cat7xG_verse cat7xG_v1" data-usfm="JHN.3.16"><span class="x_label">16</span>For God so <b>loved</b>
        <span class="x_note"><span>footnote <i>deep</i></span></span> the world<span class="note">n</span>.</span>
      <span class="verse" data-usfm="JHN.3.17+JHN.3.18">Second.</span>
      <span class="reverse" data-usfm="JHN.3.19">Not a verse.</span>
      <span class="verse">No usfm.</span>
    </div>`
    expect([...parseVerses(markup)]).toEqual([
      [16, 'For God so loved the world.'],
      [17, 'Second.'],
    ])
  })

  it('joins separate elements of one verse and ignores verse zero and empty verses', () => {
    const markup = `<div class="q1"><span class="verse" data-usfm="PSA.1.1">Blessed</span></div>
      <div class="q2"><span class="verse" data-usfm="PSA.1.1">is the man</span></div>
      <span class="verse" data-usfm="PSA.1.0">Title</span><span class="verse" data-usfm="PSA.1.2"> <span class="label">2</span> </span>`
    expect([...parseVerses(markup)]).toEqual([[1, 'Blessed is the man']])
  })

  it('decodes entities once', () => {
    const markup = '<span class="verse" data-usfm="GEN.1.1">Fish &amp; chips &lt;3&gt; &quot;a&quot; it&#39;s&apos; &#x41;&#66;&nbsp;C &amp;lt; &#99999999; &bogus;</span>'
    expect(parseVerses(markup).get(1)).toBe('Fish & chips <3> "a" it\'s\' AB C &lt; &#99999999; &bogus;')
  })

  it('copes with comments, void elements, self-closing tags and stray close tags', () => {
    const markup = `<!-- a <b> comment --></p><span class="verse" data-usfm="GEN.1.1">In<br>the <img src="x.png"/>beginning</div><wbr/>.</span>
      <span class="verse" data-usfm="GEN.1.2"><span class="note"><br/>skip</span>Next`
    expect([...parseVerses(markup)]).toEqual([
      [1, 'Inthe beginning.'],
      [2, 'Next'],
    ])
  })
})

interface Call {
  url: string
  headers: Record<string, string>
}

function recorder(respond: (url: string, call: number) => { status: number; body?: string } | Error) {
  const calls: Call[] = []
  const fetcher: Fetcher = async (url, headers) => {
    calls.push({ url, headers })
    const answer = respond(url, calls.length)
    if (answer instanceof Error) throw answer
    return { status: answer.status, body: encode(answer.body ?? '') }
  }
  return { calls, client: new BibleComClient(fetcher) }
}

describe('BibleComClient', () => {
  it('sends the right URLs and headers', async () => {
    const { calls, client } = recorder((url) => {
      if (url.includes('/api/bible/versions')) return { status: 200, body: JSON.stringify({ response: { data: { versions: [] } } }) }
      if (url.includes('/api/bible/version/')) return { status: 200, body: '{"books":[]}' }
      return { status: 200, body: '<span class="verse" data-usfm="PSA.23.1">The LORD</span>' }
    })
    await client.versions('a b&c')
    await client.details(1)
    const verses = await client.chapter({ ...version, id: 1, abbreviation: 'KJV' }, 'PSA.23')
    expect(verses.get(1)).toBe('The LORD')
    expect(calls.map((call) => call.url)).toEqual([
      'https://www.bible.com/api/bible/versions?language_tag=a%20b%26c&type=all',
      'https://www.bible.com/api/bible/version/1',
      'https://www.bible.com/bible/1/PSA.23.KJV',
    ])
    const base = { 'Accept-Language': 'en', 'User-Agent': 'OpenStage/1.0 (church presentation software; offline Bible)' }
    expect(calls[0]!.headers).toEqual(base)
    expect(calls[1]!.headers).toEqual(base)
    expect(calls[2]!.headers).toEqual({ ...base, RSC: '1' })
  })

  it('refuses malformed ids before any request', async () => {
    const { calls, client } = recorder(() => ({ status: 200, body: '{}' }))
    await expect(client.details(0)).rejects.toThrow(BibleComError)
    await expect(client.details(1.5)).rejects.toThrow(BibleComError)
    await expect(client.chapter(version, '../x')).rejects.toThrow(BibleComError)
    await expect(client.chapter(version, 'PSA.')).rejects.toThrow(BibleComError)
    await expect(client.chapter({ ...version, id: -3 }, 'PSA.1')).rejects.toThrow(BibleComError)
    expect(calls).toHaveLength(0)
  })

  it('treats 403 and 429 as refused', async () => {
    for (const status of [403, 429]) {
      const { client } = recorder(() => ({ status, body: '' }))
      const error = await client.details(1).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(BibleComError)
      expect(error).toMatchObject({ isRefused: true, message: 'bible.com is not accepting downloads from this computer right now. Try again later.' })
    }
  })

  it('reports other statuses plainly', async () => {
    const { client } = recorder(() => ({ status: 500, body: '' }))
    const error = await client.versions('eng').catch((e: unknown) => e)
    expect(error).toMatchObject({ isRefused: false, message: 'bible.com answered with error 500.' })
  })

  it('reports a failed connection', async () => {
    const { client } = recorder(() => new TypeError('fetch failed'))
    const error = await client.chapter(version, 'GEN.1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BibleComError)
    expect(error).toMatchObject({ isRefused: false, message: 'No connection to bible.com. Connect, then Retry. Finished chapters are kept.' })
  })
})

describe('downloadVersion', () => {
  const details = {
    copyright_short: { text: 'Public Domain' },
    books: [
      { usfm: 'RUT', chapters: [{ usfm: 'RUT.1', canonical: true }, { usfm: 'RUT.3', canonical: true }] },
      { usfm: 'GEN', chapters: [{ usfm: 'GEN.1', canonical: true }, { usfm: 'GEN.2', canonical: true }] },
    ],
  }
  const chapterVerses: Record<string, Record<number, string>> = {
    'GEN.1': { 1: 'In the beginning', 2: 'The earth was formless' },
    'GEN.2': { 1: 'Heavens finished', 3: 'God blessed' },
    'RUT.1': { 1: 'In the days of the judges' },
    'RUT.3': { 2: 'Boaz winnows' },
  }
  const page = (usfm: string) => {
    const spans = Object.entries(chapterVerses[usfm]!).map(([number, text]) => `<span class="verse" data-usfm="${usfm}.${number}">${text}</span>`)
    return `<div class="version">${spans.join('')}</div>`
  }

  let stagingDir = ''

  beforeEach(async () => {
    stagingDir = await mkdtemp(join(tmpdir(), 'openstage-biblecom-'))
  })

  afterEach(async () => {
    await rm(stagingDir, { recursive: true, force: true })
  })

  const exists = (path: string) => access(path).then(() => true, () => false)

  function server(fail: (usfm: string, attempt: number) => { status: number } | null = () => null) {
    const requested = new Map<string, number>()
    const { calls, client } = recorder((url) => {
      if (url.endsWith('/api/bible/version/7')) return { status: 200, body: JSON.stringify(details) }
      const usfm = /\/bible\/7\/([A-Z0-9]{3}\.\d+)\./.exec(url)![1]!
      const attempt = (requested.get(usfm) ?? 0) + 1
      requested.set(usfm, attempt)
      return fail(usfm, attempt) ?? { status: 200, body: page(usfm) }
    })
    return { calls, client, requested }
  }

  it('assembles the Bible in canon order, fills gaps and removes the staging folder', async () => {
    const { client, requested } = server()
    const progress: [number, number][] = []
    const bible = await downloadVersion(client, version, 'TST', {
      stagingDir,
      isCancelled: () => false,
      onProgress: (done, total) => progress.push([done, total]),
      retryDelayMs: 1,
    })
    expect(bible).toEqual({
      code: 'TST',
      name: 'Test Bible',
      notice: 'Public Domain',
      language: 'en',
      books: {
        GEN: [['In the beginning', 'The earth was formless'], ['Heavens finished', '', 'God blessed']],
        RUT: [['In the days of the judges'], [], ['', 'Boaz winnows']],
      },
    })
    expect(Object.keys(bible.books)).toEqual(['GEN', 'RUT'])
    expect([...requested.keys()].sort()).toEqual(['GEN.1', 'GEN.2', 'RUT.1', 'RUT.3'])
    expect(progress[0]).toEqual([0, 4])
    expect(progress.at(-1)).toEqual([4, 4])
    expect(progress.map(([done]) => done)).toEqual([0, 1, 2, 3, 4])
    expect(await exists(join(stagingDir, '7'))).toBe(false)
  })

  it('falls back to a generic notice', async () => {
    const { client } = server()
    const original = client.details.bind(client)
    client.details = async (id) => ({ ...(await original(id)), copyright: null })
    const bible = await downloadVersion(client, version, 'TST', { stagingDir, isCancelled: () => false, onProgress: () => {} })
    expect(bible.notice).toBe('Downloaded from bible.com')
  })

  it('resumes from chapters already staged', async () => {
    const { client, requested } = server()
    await mkdir(join(stagingDir, '7'), { recursive: true })
    await writeFile(join(stagingDir, '7', 'GEN.1.json'), JSON.stringify({ 1: 'Staged earlier' }))
    const bible = await downloadVersion(client, version, 'TST', { stagingDir, isCancelled: () => false, onProgress: () => {} })
    expect(requested.has('GEN.1')).toBe(false)
    expect(requested.size).toBe(3)
    expect(bible.books.GEN?.[0]).toEqual(['Staged earlier'])
  })

  it('retries a failing chapter and then succeeds', async () => {
    const { client, requested } = server((usfm, attempt) => (usfm === 'GEN.2' && attempt < 3 ? { status: 500 } : null))
    const bible = await downloadVersion(client, version, 'TST', { stagingDir, isCancelled: () => false, onProgress: () => {}, retryDelayMs: 1 })
    expect(requested.get('GEN.2')).toBe(3)
    expect(bible.books.GEN?.[1]).toEqual(['Heavens finished', '', 'God blessed'])
  })

  it('gives up after three attempts and keeps the finished chapters', async () => {
    const { client, requested } = server((usfm) => (usfm === 'RUT.3' ? { status: 500 } : null))
    const run = downloadVersion(client, version, 'TST', { stagingDir, isCancelled: () => false, onProgress: () => {}, retryDelayMs: 1, workers: 1 })
    await expect(run).rejects.toThrow('bible.com answered with error 500.')
    expect(requested.get('RUT.3')).toBe(3)
    expect((await readdir(join(stagingDir, '7'))).sort()).toEqual(['GEN.1.json', 'GEN.2.json', 'RUT.1.json'])
  })

  it('stops on a refusal without retrying', async () => {
    const { client, requested } = server((usfm) => (usfm === 'GEN.2' ? { status: 429 } : null))
    const run = downloadVersion(client, version, 'TST', { stagingDir, isCancelled: () => false, onProgress: () => {}, retryDelayMs: 1, workers: 1 })
    await expect(run).rejects.toMatchObject({ isRefused: true })
    expect(requested.get('GEN.2')).toBe(1)
    expect(requested.has('RUT.1')).toBe(false)
    expect(await exists(join(stagingDir, '7', 'GEN.1.json'))).toBe(true)
  })

  it('throws DownloadCancelled and keeps the staged chapters', async () => {
    const { client, requested } = server()
    const run = downloadVersion(client, version, 'TST', { stagingDir, isCancelled: () => requested.size >= 2, onProgress: () => {}, workers: 1 })
    await expect(run).rejects.toBeInstanceOf(DownloadCancelled)
    expect(requested.size).toBe(2)
    expect((await readdir(join(stagingDir, '7'))).sort()).toEqual(['GEN.1.json', 'GEN.2.json'])
  })

  it('rejects a version without Old or New Testament chapters', async () => {
    const { client } = recorder(() => ({ status: 200, body: '{"books":[{"usfm":"XXX","chapters":[]}]}' }))
    await expect(downloadVersion(client, version, 'TST', { stagingDir, isCancelled: () => false, onProgress: () => {} })).rejects.toThrow(
      'This version has no Old or New Testament chapters to download.',
    )
  })
})
