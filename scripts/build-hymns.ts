/**
 * Builds the hymn file bundled with the app from a checkout of the Open Hymnal Project.
 * Usage: pnpm build:hymns <checkout of github.com/mzealey/openhymnal>
 * Only hymns whose score is marked "copyright: public domain" are kept; everything else is skipped.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { abcHymn } from '../packages/engine/src/import/formats/abc'
import type { ImportedSong } from '../packages/engine/src/import/types'

const notice = 'Public domain hymns from the Open Hymnal Project (openhymnal.org), 2008 edition, maintained by Brian J. Dumont; source github.com/mzealey/openhymnal.'

const input = process.argv[2]
if (!input) throw new Error('Pass the folder that holds a checkout of github.com/mzealey/openhymnal')
const output = join(import.meta.dirname, '../apps/desktop/resources/songs')
await mkdir(output, { recursive: true })

const squash = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, '')

function decode(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('latin1').decode(bytes)
  }
}

const skipped = new Map<string, number>()
const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1)
const byTitle = new Map<string, ImportedSong>()
let filesRead = 0

const root = join(input, 'Complete')
for (const directory of (await readdir(root)).sort()) {
  const files = (await readdir(join(root, directory))).filter((f) => f.endsWith('.abc')).sort()
  if (!files.length) {
    skip('no .abc file')
    continue
  }
  let chosen: ImportedSong | undefined
  let reason = 'no words found'
  for (const file of files) {
    filesRead++
    const { song, isPublicDomain } = abcHymn(file.replace(/\.abc$/, ''), decode(await readFile(join(root, directory, file))))
    if (!song.sections.length) continue
    if (!isPublicDomain) {
      reason = 'not marked public domain'
      continue
    }
    chosen = song
    break
  }
  if (!chosen) skip(reason)
  else if (byTitle.has(squash(chosen.title))) skip('duplicate title')
  else byTitle.set(squash(chosen.title), chosen)
}

const songs = [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title))
const data = gzipSync(JSON.stringify({ id: 'open-hymnal', name: 'Open Hymnal', notice, songs }), { level: 9 })
await writeFile(join(output, 'open-hymnal.json.gz'), data)

console.log(`Files read: ${filesRead}`)
console.log(`Hymns written: ${songs.length} (${(data.length / 1024).toFixed(0)} KB)`)
console.log(`Skipped: ${[...skipped.values()].reduce((a, b) => a + b, 0)}`)
for (const [reason, count] of skipped) console.log(`  ${reason}: ${count}`)
