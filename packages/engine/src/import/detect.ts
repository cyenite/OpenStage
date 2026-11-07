import type { BibleInfo } from '@openstage/shared'
import { parseBible, parseUsfm, type BibleFormat } from '../bibles/parse'
import { chordPro, isChordPro } from './formats/chordpro'
import { easyWorship } from './formats/easyworship'
import { freeShow } from './formats/freeshow'
import { openLp } from './formats/openlp'
import { isOpenLyrics, openLyrics } from './formats/openlyrics'
import { isProPresenter6, proPresenter6 } from './formats/propresenter'
import { isSongSelectText, songSelectText, songSelectUsr } from './formats/songselect'
import { isSqlite, tables, withDatabase } from './formats/sqlite'
import { plainText } from './formats/text-songs'
import { baseName, text, type Parsed, type SourceFile } from './types'
import { unzip } from './zip'

/** ISO 639-3 codes that eBible.org ids start with, mapped to the codes songs and Bibles use here. */
const languageCodes: Record<string, string> = { eng: 'en', swh: 'sw', swa: 'sw', fra: 'fr', spa: 'es', por: 'pt', kin: 'rw', lug: 'lg', amh: 'am', kik: 'ki', luo: 'luo', deu: 'de', nld: 'nl' }

const bibleFormats: { test: RegExp; format: BibleFormat; label: string }[] = [
  { test: /<osis[\s>]/, format: 'osis', label: 'OSIS' },
  { test: /<XMLBIBLE[\s>]/, format: 'zefania', label: 'Zefania' },
  { test: /<usfx[\s>]/, format: 'usfx', label: 'USFX' },
  { test: /<usx[\s>]/, format: 'usx', label: 'USX' },
]

const easyWorshipCaution = 'Read from EasyWorship 6/7 databases as documented by other open-source importers; check the songs before using them.'
const proPresenterCaution = 'Read from the ProPresenter 6 file format as documented by other open-source importers; check the song before using it.'

/** Reads every file: unpacks ZIPs, pairs EasyWorship's two databases, gathers USFM books into one Bible. */
export function readFiles(input: SourceFile[]): Parsed[] {
  const files: SourceFile[] = []
  const results: Parsed[] = []
  for (const file of input) {
    if (/\.(zip|osz)$/i.test(file.name) || isZip(file.bytes)) {
      try {
        files.push(...unzip(file.bytes).map((entry) => ({ name: `${file.name}/${entry.name}`, bytes: entry.bytes })))
      } catch (error) {
        results.push({ kind: 'unreadable', file: file.name, format: 'ZIP', reason: message(error) })
      }
    } else {
      files.push(file)
    }
  }

  const songsDb = files.find((f) => /(^|\/)songs\.db$/i.test(f.name))
  const wordsDb = files.find((f) => /(^|\/)songwords\.db$/i.test(f.name))
  if (songsDb && wordsDb) {
    try {
      for (const song of easyWorship(songsDb.bytes, wordsDb.bytes)) results.push({ kind: 'song', file: songsDb.name, format: 'EasyWorship 6/7', song, caution: easyWorshipCaution })
    } catch (error) {
      results.push({ kind: 'unreadable', file: songsDb.name, format: 'EasyWorship 6/7', reason: message(error) })
    }
  } else if (songsDb || wordsDb) {
    results.push({ kind: 'unreadable', file: (songsDb ?? wordsDb)!.name, format: 'EasyWorship 6/7', reason: 'EasyWorship songs need both Songs.db and SongWords.db from Databases/Data, imported together.' })
  }

  const usfm = files.filter((f) => /\.(usfm|sfm)$/i.test(f.name) || /^﻿?\\id\s/.test(text({ name: f.name, bytes: f.bytes.subarray(0, 8) })))
  if (usfm.length) {
    const sources = usfm.map(text)
    const archive = baseName(usfm[0]!.name.split('/')[0]!).replace(/_usfm$/i, '')
    const copyright = files.find((f) => /(^|\/)copr\.html?$/i.test(f.name))
    const notice = copyright ? text(copyright).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 800) : ''
    const bible = parseUsfm(sources, { ...guessInfo(archive, '', sources[0] ?? ''), notice })
    if (Object.keys(bible.books).length) results.push({ kind: 'bible', file: usfm[0]!.name.split('/')[0]!, format: 'USFM', bible })
    else results.push({ kind: 'unreadable', file: usfm[0]!.name, format: 'USFM', reason: 'No books of the Bible were found in these USFM files.' })
  }

  for (const file of files) {
    if (file === songsDb || file === wordsDb || usfm.includes(file)) continue
    if (/(^|\/)(\.|__MACOSX)|\.(css|html?|jpe?g|png|gif|pdf|db-journal|ds_store)$/i.test(file.name)) continue
    results.push(...readOne(file))
  }
  return results
}

function readOne(file: SourceFile): Parsed[] {
  const title = baseName(file.name)
  const unreadable = (format: string, reason: string): Parsed[] => [{ kind: 'unreadable', file: file.name, format, reason }]
  try {
    if (isSqlite(file.bytes)) {
      const known = withDatabase(file.bytes, (db) => tables(db))
      if (known.has('songs') && known.has('authors')) return openLp(file.bytes).map((song) => ({ kind: 'song', file: file.name, format: 'OpenLP', song }))
      return unreadable('SQLite', 'A database OpenStage does not recognise. OpenLP uses songs.sqlite; EasyWorship needs Songs.db and SongWords.db together.')
    }
    if (/\.pro$/i.test(file.name) && !/^\s*</.test(text({ name: '', bytes: file.bytes.subarray(0, 64) }))) {
      return unreadable('ProPresenter 7', 'ProPresenter 7 files are not supported yet. Export the song from ProPresenter as text or ChordPro, or use a ProPresenter 6 file.')
    }
    const source = text(file)
    if (/^\s*</.test(source)) {
      const bible = bibleFormats.find((b) => b.test.test(source.slice(0, 5000)))
      if (bible) return [{ kind: 'bible', file: file.name, format: bible.label, bible: parseBible(source, bible.format, guessInfo(title, source.slice(0, 5000), '')) }]
      if (isProPresenter6(source)) return [{ kind: 'song', file: file.name, format: 'ProPresenter 6', song: proPresenter6(title, source), caution: proPresenterCaution }]
      if (isOpenLyrics(source)) return [{ kind: 'song', file: file.name, format: 'OpenLyrics', song: openLyrics(title, source) }]
      return unreadable('XML', 'An XML file in a format OpenStage does not know.')
    }
    if (/\.show$/i.test(file.name) || /^\s*\[\s*"[^"]+"\s*,\s*\{/.test(source.slice(0, 200))) return [{ kind: 'song', file: file.name, format: 'FreeShow', song: freeShow(title, source) }]
    if (/\.usr$/i.test(file.name) || /^\[File\]/m.test(source.slice(0, 200))) return [{ kind: 'song', file: file.name, format: 'SongSelect', song: songSelectUsr(source) }]
    if (isSongSelectText(source)) return [{ kind: 'song', file: file.name, format: 'SongSelect', song: songSelectText(source) }]
    if (isChordPro(file.name, source)) return [{ kind: 'song', file: file.name, format: 'ChordPro', song: chordPro(title, source) }]
    if (/\.txt$/i.test(file.name) || !/[\u0000-\u0008]/.test(source.slice(0, 1000))) {
      if (!source.trim()) return unreadable('Text', 'The file is empty.')
      return [{ kind: 'song', file: file.name, format: 'Plain text', song: plainText(title, source) }]
    }
    return unreadable('Unknown', 'Not a file type OpenStage can import.')
  } catch (error) {
    return unreadable('Unknown', message(error))
  }
}

/** What a Bible file says about itself, or what its name suggests; the operator confirms before importing. */
function guessInfo(name: string, xml: string, usfm: string): BibleInfo {
  const attr = (pattern: RegExp) => pattern.exec(xml)?.[1]?.trim()
  const title = attr(/<title[^>]*>([^<]+)</) ?? attr(/biblename="([^"]+)"/) ?? /^\\id\s+\w{3}\s+(.+)$/m.exec(usfm)?.[1]?.trim()
  const lang = attr(/xml:lang=['"]([^'"]+)['"]/) ?? attr(/<languageCode>([^<]+)</) ?? attr(/<language[^>]*>([^<]+)</)
  const prefix = name.slice(0, 3).toLowerCase()
  const language = (lang && (languageCodes[lang.toLowerCase()] ?? lang.toLowerCase().slice(0, 3))) || languageCodes[prefix] || 'en'
  const code = (attr(/osisIDWork=['"]([^'"]+)['"]/) ?? name).replace(/[^A-Za-z0-9_-]/g, '').toUpperCase().slice(0, 16) || 'BIBLE'
  return { code, name: title || name, language, notice: '' }
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
