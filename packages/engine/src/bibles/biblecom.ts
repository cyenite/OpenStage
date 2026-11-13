import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bibleBooks, bookById, type BibleText, type BookId, type RemoteVersion } from '@openstage/shared'

export type { RemoteVersion }

export interface RemoteBook {
  book: BookId
  name: string
  /** Canonical chapters as USFM ids like `PSA.23`. */
  chapters: string[]
}

interface BibleDetails {
  books: RemoteBook[]
  copyright: string | null
}

export class BibleComError extends Error {
  constructor(
    message: string,
    readonly isRefused = false,
  ) {
    super(message)
    this.name = 'BibleComError'
  }
}

export class DownloadCancelled extends Error {
  constructor() {
    super('The download was cancelled.')
    this.name = 'DownloadCancelled'
  }
}

const origin = 'https://www.bible.com'
const chapterPattern = /^[1-4A-Z]{3}\.\d+$/
const refusedMessage = 'bible.com is not accepting downloads from this computer right now. Try again later.'
const challengeMessage = 'bible.com asked for a human check. Open bible.com in a browser, then try again later.'
const offlineMessage = 'No connection to bible.com. Connect, then Retry. Finished chapters are kept.'
const baseHeaders = {
  'Accept-Language': 'en',
  'User-Agent': 'OpenStage/1.0 (church presentation software; offline Bible)',
}

type Json = Record<string, unknown>

function asObject(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {}
}

function parseJson(body: string): Json {
  try {
    return asObject(JSON.parse(body))
  } catch {
    throw new BibleComError('bible.com sent an answer that could not be read.')
  }
}

export function parseCatalog(body: string): RemoteVersion[] {
  const root = parseJson(body)
  const response = asObject(root.response ?? root)
  const data = asObject(response.data ?? response)
  const items = Array.isArray(data.versions) ? data.versions : []
  const versions: RemoteVersion[] = []
  for (const raw of items) {
    const item = asObject(raw)
    if (item.text !== true) continue
    const language = asObject(item.language)
    const id = item.id
    const title = item.local_title ?? item.title
    const abbreviation = item.local_abbreviation ?? item.abbreviation
    if (typeof id !== 'number' || typeof title !== 'string' || typeof abbreviation !== 'string') continue
    const languageTag = typeof language.language_tag === 'string' ? language.language_tag : ''
    const languageName = language.local_name ?? language.name
    const code = language.iso_639_1 ?? language.iso_639_3 ?? languageTag
    versions.push({
      id,
      title,
      abbreviation,
      languageTag,
      languageName: typeof languageName === 'string' ? languageName : '',
      language: String(code).toLowerCase(),
    })
  }
  return versions
}

export function parseDetails(body: string): BibleDetails {
  const root = parseJson(body)
  const items = Array.isArray(root.books) ? root.books : []
  const books: RemoteBook[] = []
  for (const raw of items) {
    const item = asObject(raw)
    const book = typeof item.usfm === 'string' ? bookById(item.usfm) : undefined
    if (!book) continue
    const human = typeof item.human === 'string' ? item.human.trim() : ''
    const chapters = (Array.isArray(item.chapters) ? item.chapters : [])
      .map(asObject)
      .filter((chapter) => chapter.canonical === true)
      .map((chapter) => chapter.usfm)
      .filter((usfm): usfm is string => typeof usfm === 'string' && chapterPattern.test(usfm))
    books.push({ book: book.usfm, name: human || book.en, chapters })
  }
  const order = (remote: RemoteBook) => bibleBooks.findIndex((b) => b.usfm === remote.book)
  books.sort((a, b) => order(a) - order(b))
  const text = asObject(root.copyright_short).text
  const copyright = typeof text === 'string' ? text.trim() : ''
  return { books, copyright: copyright || null }
}

const versionMarker = '<div class="version'
const rowPattern = /\n[0-9a-f]+:T([0-9a-f]+),<div class="version/
const utf8 = new TextDecoder('utf-8', { ignoreBOM: true })

/**
 * The reader route answers `RSC: 1` with a React Server Components payload; the chapter markup is one
 * `<id>:T<hex byte length>,` text row in it.
 */
export function chapterMarkup(body: Uint8Array): string {
  const text = utf8.decode(body)
  if (text.includes('_fs-ch-') || text.includes('CAPTCHA')) throw new BibleComError(challengeMessage, true)
  const row = rowPattern.exec(text)
  if (!row) {
    if (text.includes('data-usfm=')) return text
    throw new BibleComError('bible.com sent a chapter in an unknown format.')
  }
  const start = row.index + row[0].length - versionMarker.length
  const offset = Buffer.byteLength(text.slice(0, start))
  const end = Math.min(offset + parseInt(row[1]!, 16), body.length)
  return utf8.decode(body.subarray(offset, Math.max(offset, end)))
}

const voidElements = new Set(['br', 'img', 'hr', 'wbr', 'input', 'meta', 'link'])
const tokenPattern = /<!--[\s\S]*?-->|<[!?][^>]*>|<(\/?)([a-zA-Z0-9]+)([^>]*)>|[^<]+|</g
const entityPattern = /&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos|nbsp));/gi
const namedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text: string): string {
  return text.replace(entityPattern, (whole, hex?: string, decimal?: string, name?: string) => {
    if (name) return namedEntities[name.toLowerCase()] ?? whole
    const code = hex ? parseInt(hex, 16) : Number(decimal)
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attributes)
  return match ? (match[1] ?? match[2] ?? '') : null
}

// Server-rendered pages hash class names (`cat7xG_verse`); the RSC payload does not, so both spellings count.
function hasClass(classes: string[], name: string): boolean {
  return classes.some((item) => item === name || item.endsWith(`_${name}`))
}

interface OpenElement {
  name: string
  isSkipped: boolean
  verse: number | null
}

export function parseVerses(markup: string): Map<number, string> {
  const buffers = new Map<number, string>()
  const stack: OpenElement[] = []
  let skipDepth = 0

  const close = (element: OpenElement) => {
    if (element.isSkipped) skipDepth--
    if (element.verse !== null) buffers.set(element.verse, `${buffers.get(element.verse) ?? ''} `)
  }

  for (const [token, slash, rawName, attributes] of markup.matchAll(tokenPattern)) {
    if (token.startsWith('<!') || token.startsWith('<?')) continue
    if (rawName === undefined) {
      if (skipDepth > 0) continue
      const current = stack.findLast((element) => element.verse !== null)
      if (current) buffers.set(current.verse!, (buffers.get(current.verse!) ?? '') + decodeEntities(token))
      continue
    }
    const name = rawName.toLowerCase()
    if (slash) {
      const at = stack.findLastIndex((element) => element.name === name)
      if (at < 0) continue
      while (stack.length > at) close(stack.pop()!)
      continue
    }
    if (voidElements.has(name) || attributes!.trimEnd().endsWith('/')) continue
    const classes = (attribute(attributes!, 'class') ?? '').split(/\s+/).filter(Boolean)
    const usfm = attribute(attributes!, 'data-usfm')
    const isSkipped = hasClass(classes, 'note') || hasClass(classes, 'label')
    const number = usfm !== null && hasClass(classes, 'verse') ? Number(usfm.split('+')[0]!.split('.').at(-1)) : 0
    const element = { name, isSkipped, verse: Number.isInteger(number) && number >= 1 ? number : null }
    if (isSkipped) skipDepth++
    stack.push(element)
  }
  while (stack.length > 0) close(stack.pop()!)

  const verses = new Map<number, string>()
  for (const number of [...buffers.keys()].sort((a, b) => a - b)) {
    const text = buffers.get(number)!.replace(/\s+/g, ' ').trim()
    if (text) verses.set(number, text)
  }
  return verses
}

export type Fetcher = (url: string, headers: Record<string, string>) => Promise<{ status: number; body: Uint8Array }>

export const fetchWithTimeout: Fetcher = async (url, headers) => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  return { status: response.status, body: new Uint8Array(await response.arrayBuffer()) }
}

export class BibleComClient {
  constructor(private readonly fetcher: Fetcher = fetchWithTimeout) {}

  async versions(languageTag: string): Promise<RemoteVersion[]> {
    const body = await this.get(`${origin}/api/bible/versions?language_tag=${encodeURIComponent(languageTag)}&type=all`)
    return parseCatalog(utf8.decode(body))
  }

  async details(versionId: number): Promise<BibleDetails> {
    this.checkVersion(versionId)
    return parseDetails(utf8.decode(await this.get(`${origin}/api/bible/version/${versionId}`)))
  }

  async chapter(version: RemoteVersion, usfm: string): Promise<Map<number, string>> {
    this.checkVersion(version.id)
    if (!chapterPattern.test(usfm)) throw new BibleComError(`“${usfm}” is not a chapter.`)
    const url = `${origin}/bible/${version.id}/${usfm}.${encodeURIComponent(version.abbreviation)}`
    return parseVerses(chapterMarkup(await this.get(url, { RSC: '1' })))
  }

  private checkVersion(versionId: number) {
    if (!Number.isInteger(versionId) || versionId < 1) throw new BibleComError('That is not a bible.com version.')
  }

  private async get(url: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
    let response: Awaited<ReturnType<Fetcher>>
    try {
      response = await this.fetcher(url, { ...baseHeaders, ...headers })
    } catch {
      throw new BibleComError(offlineMessage)
    }
    if (response.status === 403 || response.status === 429) throw new BibleComError(refusedMessage, true)
    if (response.status !== 200) throw new BibleComError(`bible.com answered with error ${response.status}.`)
    return response.body
  }
}

export interface DownloadOptions {
  stagingDir: string
  isCancelled: () => boolean
  onProgress: (done: number, total: number) => void
  workers?: number
  retryDelayMs?: number
}

/** The longest chapter (Psalm 119) has 176 verses; anything past this is a damaged answer. */
const verseLimit = 200
const attempts = 3

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const exists = (path: string) => stat(path).then(() => true, () => false)

/**
 * Downloads one version chapter by chapter into `<stagingDir>/<id>`, one JSON file per chapter, so a failed
 * or cancelled run resumes where it stopped. The staging folder is removed once the Bible is assembled.
 */
export async function downloadVersion(client: BibleComClient, version: RemoteVersion, code: string, options: DownloadOptions): Promise<BibleText> {
  const { stagingDir, isCancelled, onProgress, workers = 3, retryDelayMs = 2000 } = options
  const details = await client.details(version.id)
  const chapters = details.books.flatMap((remote) => remote.chapters.map((usfm) => ({ book: remote.book, usfm })))
  if (chapters.length === 0) throw new BibleComError('This version has no Old or New Testament chapters to download.')
  const folder = join(stagingDir, String(version.id))
  await mkdir(folder, { recursive: true })

  const fetchChapter = async (usfm: string) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await client.chapter(version, usfm)
      } catch (error) {
        const isRetryable = error instanceof BibleComError && !error.isRefused
        if (!isRetryable || attempt === attempts) throw error
        await sleep(attempt * retryDelayMs)
      }
    }
  }

  let next = 0
  let done = 0
  const failures: unknown[] = []
  onProgress(0, chapters.length)

  const work = async () => {
    try {
      while (failures.length === 0 && next < chapters.length) {
        if (isCancelled()) throw new DownloadCancelled()
        const { usfm } = chapters[next++]!
        const file = join(folder, `${usfm}.json`)
        if (!(await exists(file))) {
          const verses = await fetchChapter(usfm)
          await writeFile(`${file}.tmp`, JSON.stringify(Object.fromEntries(verses)))
          await rename(`${file}.tmp`, file)
        }
        onProgress(++done, chapters.length)
      }
    } catch (error) {
      failures.push(error)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, workers) }, work))
  if (failures.length > 0) throw failures[0]

  const books: BibleText['books'] = {}
  for (const { book, usfm } of chapters) {
    const number = Number(usfm.split('.')[1])
    if (number > bookById(book)!.chapters) continue
    const staged = JSON.parse(await readFile(join(folder, `${usfm}.json`), 'utf8')) as Record<string, string>
    const verses: string[] = []
    for (const [key, text] of Object.entries(staged)) {
      const verse = Number(key)
      if (verse >= 1 && verse <= verseLimit) verses[verse - 1] = text
    }
    const list = (books[book] ??= [])
    list[number - 1] = Array.from(verses, (text) => text ?? '')
  }
  for (const list of Object.values(books)) {
    for (let index = 0; index < list.length; index++) list[index] ??= []
  }

  await rm(folder, { recursive: true, force: true })
  return {
    code,
    name: version.title,
    notice: details.copyright ?? 'Downloaded from bible.com',
    language: version.language,
    books,
  }
}
