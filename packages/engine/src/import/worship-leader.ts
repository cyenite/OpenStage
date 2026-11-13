import type { CatalogSong, Chord, SongLanguage, TextLine } from '@openstage/shared'

export type { CatalogSong, SongLanguage }
import { isChord, isChordLine } from '@openstage/shared'
import { fetchWithTimeout, type Fetcher } from '../bibles/biblecom'
import type { ImportedSection, ImportedSong } from './types'

export interface SongPack {
  songs: CatalogSong[]
  imported: Map<number, ImportedSong>
}

export class SongSourceError extends Error {
  constructor(
    message: string,
    readonly isRefused = false,
  ) {
    super(message)
    this.name = 'SongSourceError'
  }
}

const origin = 'https://songs.worshipleaderapp.com/db2/db'
const codePattern = /^[a-z]{2,3}(-[A-Za-z]{2,8})*$/
const refusedMessage = 'The Worship Leader song server is not accepting requests from this computer right now. Try again later.'
const offlineMessage = 'No connection to the Worship Leader song server. Connect, then try again.'
const unreadableMessage = 'The Worship Leader song server sent an answer that could not be read.'
const restrictedCopyright = 'Copyright restricted (Worship Leader)'
const baseHeaders = {
  'Accept-Language': 'en',
  'User-Agent': 'OpenStage/1.0 (church presentation software)',
}

// The app's compressed-key-map.json, limited to the keys a pack entry is read by here.
const compressedKeys: Record<string, string> = {
  copyright_restricted: 'C',
  songxml: 'x',
  songkey: 'k',
  title: '8',
  info: 'I',
  type: 'z',
  value: 'v',
  id: 'i',
}

type Json = Record<string, unknown>

function asObject(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {}
}

function field(entry: Json, name: string): unknown {
  return entry[name] ?? entry[compressedKeys[name]!]
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    throw new SongSourceError(unreadableMessage)
  }
}

export function parseLanguages(body: string): SongLanguage[] {
  const root = parseJson(body)
  if (typeof root !== 'object' || root === null || Array.isArray(root)) throw new SongSourceError(unreadableMessage)
  const languages: SongLanguage[] = []
  for (const [code, raw] of Object.entries(root)) {
    const entry = asObject(raw)
    const english = asObject(entry.name).en
    const count = Number(entry.count)
    if (!Number.isFinite(count) || count < 1) continue
    languages.push({ code, name: typeof english === 'string' && english.trim() ? english.trim() : code, count })
  }
  return languages.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code))
}

const inlineElements = new Set(['br', 'chord', 'chordsonly', 'indent', 'repeat'])
const tokenPattern = /<!--[\s\S]*?-->|<[!?][^>]*>|<(\/?)([a-zA-Z0-9]+)([^>]*)>|[^<]+|</g
const entityPattern = /&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos|nbsp));/gi
const namedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const chordTokenPattern = /^[A-G][#b]?[0-9A-Za-z#b+()°ø/-]*$/
const headingPattern = /^(pre[\s-]*chorus|chorus|verse|bridge|intro|outro|tag|interlude|instrumental|ending|refrain|coda)\s*(\d+)?\s*(?:\(?\s*\d+\s*x\s*\)?)?\s*:?$/i

function decodeEntities(text: string): string {
  return text.replace(entityPattern, (whole, hex?: string, decimal?: string, name?: string) => {
    if (name) return namedEntities[name.toLowerCase()] ?? whole
    const code = hex ? parseInt(hex, 16) : Number(decimal)
    return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function baseLabel(name: string): string {
  const lower = name.toLowerCase()
  return /^pre[\s-]*chorus$/.test(lower) ? 'Pre-chorus' : capitalise(lower)
}

// Chords are written with `&` for flat; one element may hold several ("A G A") and stray dashes.
function chordNames(content: string): string[] {
  return content
    .replace(/&/g, 'b')
    .split(/\s+/)
    .filter((token) => chordTokenPattern.test(token) || isChord(token))
}

function finishLine(line: TextLine): TextLine | null {
  const lead = line.text.length - line.text.trimStart().length
  const text = line.text.trim()
  if (text === '' || isChordLine(text)) return null
  const chords = line.chords.map(({ chord, offset }): Chord => ({ chord, offset: Math.min(Math.max(offset - lead, 0), text.length) }))
  return { text, chords }
}

interface RawBlock {
  tag: string
  lines: TextLine[]
}

function parseBlocks(songxml: string): RawBlock[] {
  const blocks: RawBlock[] = []
  let block: RawBlock | null = null
  let line: TextLine = { text: '', chords: [] }
  let chordText: string | null = null
  let skipDepth = 0
  let repeatCount = 2

  const endLine = () => {
    const finished = finishLine(line)
    if (finished && block) block.lines.push(finished)
    line = { text: '', chords: [] }
  }
  const endBlock = () => {
    endLine()
    if (block) blocks.push(block)
    block = null
  }

  for (const [token, slash, rawName, attributes] of songxml.matchAll(tokenPattern)) {
    if (token.startsWith('<!') || token.startsWith('<?')) continue
    if (rawName === undefined) {
      if (chordText !== null) chordText += decodeEntities(token)
      else if (block && skipDepth === 0) line.text += decodeEntities(token).replace(/\s+/g, ' ')
      continue
    }
    const name = rawName.toLowerCase()
    const isSelfClosed = attributes!.trimEnd().endsWith('/')
    if (slash) {
      if (name === 'chord' && chordText !== null) {
        if (block && skipDepth === 0) for (const chord of chordNames(chordText)) line.chords.push({ chord, offset: line.text.length })
        chordText = null
      } else if (name === 'chordsonly') skipDepth = Math.max(0, skipDepth - 1)
      else if (name === 'repeat') {
        if (block && skipDepth === 0) line.text += ` ${'/'.repeat(repeatCount)}`
      } else if (block && name === block.tag) endBlock()
      continue
    }
    if (name === 'br') endLine()
    else if (name === 'chord') chordText = isSelfClosed ? null : ''
    else if (name === 'chordsonly') {
      if (!isSelfClosed) skipDepth++
    } else if (name === 'indent') line.text += ' '
    else if (name === 'repeat') {
      repeatCount = Number(/count\s*=\s*['"]?(\d+)/i.exec(attributes!)?.[1]) || 2
      if (block && skipDepth === 0) line.text += `${line.text === '' || line.text.endsWith(' ') ? '' : ' '}${'/'.repeat(repeatCount)} `
    } else if (!block && !inlineElements.has(name) && !isSelfClosed) block = { tag: name, lines: [] }
  }
  endBlock()
  return blocks
}

function slidesOf(lines: TextLine[]): TextLine[][] {
  if (lines.length <= 4) return [lines]
  const slides: TextLine[][] = []
  for (let at = 0; at < lines.length; at += 2) slides.push(lines.slice(at, at + 2))
  return slides
}

function distinctLabel(label: string, used: Set<string>): string {
  if (!used.has(label)) return label
  const base = label.replace(/\s+\d+$/, '')
  let number = (Number(/\s(\d+)$/.exec(label)?.[1]) || 1) + 1
  while (used.has(`${base} ${number}`)) number++
  return `${base} ${number}`
}

export function songFromSongXml(title: string, songxml: string, details: Partial<ImportedSong>): ImportedSong {
  const blocks = parseBlocks(songxml)
  const sections: ImportedSection[] = []
  const order: string[] = []
  const used = new Map<string, string>()
  const counts = new Map<string, number>()
  const running = new Map<string, number>()

  const headed = blocks.map((block) => {
    const heading = block.lines[0]?.chords.length === 0 ? headingPattern.exec(block.lines[0].text) : null
    if (!heading) return { block, label: null }
    const base = baseLabel(heading[1]!)
    return { block: { ...block, lines: block.lines.slice(1) }, label: heading[2] ? `${base} ${heading[2]}` : base }
  })
  for (const { block, label } of headed) if (!label && block.lines.length > 0) counts.set(block.tag, (counts.get(block.tag) ?? 0) + 1)

  for (const { block, label: heading } of headed) {
    if (block.lines.length === 0) continue
    let label = heading
    if (!label) {
      const base = baseLabel(block.tag)
      const number = (running.get(block.tag) ?? 0) + 1
      running.set(block.tag, number)
      label = block.tag === 'verse' || counts.get(block.tag)! > 1 ? `${base} ${number}` : base
    }
    const slides = slidesOf(block.lines)
    const signature = JSON.stringify(slides)
    if (used.get(label) === signature) {
      order.push(label)
      continue
    }
    const unique = distinctLabel(label, new Set(used.keys()))
    used.set(unique, signature)
    sections.push({ label: unique, slides })
    order.push(unique)
  }

  return { authors: [], copyright: '', languages: [], ...details, title, sections, order }
}

const authorTypes = new Set(['words', 'music', 'wordsandmusic'])
const plainKey = /^[A-G][#b]?m?$/

function infoEntries(entry: Json): { type: string; value: string }[] {
  const raw = field(entry, 'info')
  return (Array.isArray(raw) ? raw : []).flatMap((item) => {
    const info = asObject(item)
    const type = field(info, 'type')
    const value = field(info, 'value')
    return typeof type === 'string' && typeof value === 'string' && value.trim() ? [{ type, value: value.trim() }] : []
  })
}

export function parsePack(body: string, language: string): SongPack {
  const root = parseJson(body)
  const items = Array.isArray(root) ? root : asObject(root).data
  if (!Array.isArray(items)) throw new SongSourceError(unreadableMessage)
  const primary = language.split('-')[0]!.toLowerCase()
  const songs: CatalogSong[] = []
  const imported = new Map<number, ImportedSong>()

  for (const raw of items) {
    const entry = asObject(raw)
    const id = Number(field(entry, 'id'))
    const title = field(entry, 'title')
    const songxml = field(entry, 'songxml')
    if (!Number.isInteger(id) || id < 1 || imported.has(id)) continue
    if (typeof title !== 'string' || title.trim() === '' || typeof songxml !== 'string' || songxml.trim() === '') continue

    const restricted = field(entry, 'copyright_restricted')
    const isRestricted = restricted === 1 || restricted === true || restricted === '1'
    const info = infoEntries(entry)
    const authors = [...new Set(info.filter(({ type }) => authorTypes.has(type)).map(({ value }) => value))]
    const copyright = info.find(({ type }) => type === 'copyright')?.value ?? (isRestricted ? restrictedCopyright : '')
    const key = field(entry, 'songkey')
    const song = songFromSongXml(title.trim(), songxml, {
      authors,
      copyright,
      key: typeof key === 'string' && plainKey.test(key.trim()) ? key.trim() : undefined,
      languages: [primary],
    })
    if (song.sections.length === 0) continue

    imported.set(id, song)
    songs.push({ id, title: song.title, authors, firstLine: song.sections[0]!.slides[0]?.[0]?.text ?? '', isRestricted, language })
  }
  return { songs, imported }
}

const utf8 = new TextDecoder('utf-8')

export class WorshipLeaderClient {
  constructor(private readonly fetcher: Fetcher = fetchWithTimeout) {}

  async languages(): Promise<SongLanguage[]> {
    return parseLanguages(await this.get(`${origin}.index.json`))
  }

  async pack(code: string): Promise<SongPack> {
    if (!codePattern.test(code)) throw new SongSourceError('That is not a Worship Leader song language.')
    return parsePack(await this.get(`${origin}.${code}.json`), code)
  }

  private async get(url: string): Promise<string> {
    let response: Awaited<ReturnType<Fetcher>>
    try {
      response = await this.fetcher(url, { ...baseHeaders })
    } catch {
      throw new SongSourceError(offlineMessage)
    }
    if (response.status === 403 || response.status === 429) throw new SongSourceError(refusedMessage, true)
    if (response.status !== 200) throw new SongSourceError(`The Worship Leader song server answered with error ${response.status}.`)
    return utf8.decode(response.body)
  }
}
