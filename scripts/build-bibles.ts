/**
 * Converts Bible XML files into the compact files bundled with the app.
 * Usage: pnpm build:bibles <folder holding the XML files>
 * The sources are listed below with their licences; only public domain or openly licensed text belongs here.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { parseBible, type BibleFormat } from '../packages/engine/src/bibles/parse'

const source = 'github.com/seven1m/open-bibles'

interface Source {
  file: string
  code: string
  name: string
  notice: string
  format: BibleFormat
  /** Removes what is not verse text in this edition, so every translation projects the same way. */
  clean?: (text: string) => string
}

const bibles: Source[] = [
  { file: 'eng-kjv.osis.xml', format: 'osis', code: 'KJV', name: 'King James Version', notice: `King James Version (1769 text). Public domain, except in the United Kingdom where the Crown holds rights. Text from ${source}.` },
  { file: 'eng-bsb.usfx.xml', format: 'usfx', code: 'BSB', name: 'Berean Standard Bible', notice: `Berean Standard Bible. Dedicated to the public domain by its publisher in 2023. Text from ${source}.` },
  { file: 'eng-web.usfx.xml', format: 'usfx', code: 'WEB', name: 'World English Bible', notice: `World English Bible. Public domain; "World English Bible" is a trademark of eBible.org. Text from ${source}.` },
  { file: 'eng-asv.zefania.xml', format: 'zefania', code: 'ASV', name: 'American Standard Version', notice: `American Standard Version (1901). Public domain. Words in square brackets were supplied by the translators. Text from ${source}.` },
  { file: 'eng-bbe.usfx.xml', format: 'usfx', code: 'BBE', name: 'Bible in Basic English', notice: `Bible in Basic English (1965). Public domain. Text from ${source}.`, clean: (text) => text.replace(/\s*<[^>]*>\s*/g, ' ') },
]

const input = process.argv[2]
if (!input) throw new Error('Pass the folder that holds the Bible XML files')
const output = join(import.meta.dirname, '../apps/desktop/resources/bibles')
await mkdir(output, { recursive: true })

const isEmpty = (text: string) => /^[\s[\](){}.,;:]*$/.test(text)

for (const { file, format, code, name, notice, clean = (text: string) => text } of bibles) {
  const bible = parseBible(await readFile(join(input, file), 'utf8'), format, { code, name, notice, language: 'en' })
  for (const chapters of Object.values(bible.books)) {
    for (const verses of chapters!) {
      verses?.forEach((text, index) => {
        const cleaned = text ? clean(text).trim() : ''
        verses[index] = isEmpty(cleaned) ? '' : cleaned
      })
    }
  }
  const books = Object.keys(bible.books).length
  const verses = Object.values(bible.books).reduce((sum, chapters) => sum + chapters!.reduce((n, c) => n + (c?.filter(Boolean).length ?? 0), 0), 0)
  const data = gzipSync(JSON.stringify(bible), { level: 9 })
  await writeFile(join(output, `${code.toLowerCase()}.json.gz`), data)
  console.log(`${code}: ${books} books, ${verses} verses, ${(data.length / 1024 / 1024).toFixed(2)} MB`)
}
