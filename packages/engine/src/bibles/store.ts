import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { BibleInfo, BibleText } from '@openstage/shared'

/**
 * Reads every `<code>.json.gz` Bible from the given folders: the bundled ones first, then any the
 * church imported. A later folder replaces a Bible with the same code. Files that do not read are
 * reported and skipped.
 */
export async function loadBibles(folders: string[], onProblem: (file: string, error: unknown) => void): Promise<BibleText[]> {
  const bibles = new Map<string, BibleText>()
  for (const folder of folders) {
    const names = await readdir(folder).catch(() => [] as string[])
    for (const name of names.filter((n) => n.endsWith('.json.gz')).sort()) {
      const file = join(folder, name)
      try {
        const bible = JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as BibleText
        if (typeof bible.code !== 'string' || typeof bible.books !== 'object') throw new Error('Not a Bible file')
        bibles.set(bible.code, bible)
      } catch (error) {
        onProblem(file, error)
      }
    }
  }
  return [...bibles.values()]
}

export function bibleInfo({ code, name, notice, language }: BibleText): BibleInfo {
  return { code, name, notice, language }
}
