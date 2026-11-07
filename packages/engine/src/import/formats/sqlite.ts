import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** node:sqlite only opens files, so imported database bytes go to a private temp file for the read. */
export function withDatabase<T>(bytes: Uint8Array, read: (db: DatabaseSync) => T): T {
  const folder = mkdtempSync(join(tmpdir(), 'openstage-import-'))
  const path = join(folder, 'import.sqlite')
  writeFileSync(path, bytes)
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return read(db)
  } finally {
    db.close()
    rmSync(folder, { recursive: true, force: true })
  }
}

export function isSqlite(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 15)) === 'SQLite format 3'
}

export function tables(db: DatabaseSync): Set<string> {
  return new Set((db.prepare(`select name from sqlite_master where type = 'table'`).all() as { name: string }[]).map((t) => t.name))
}

export function columns(db: DatabaseSync, table: string): Set<string> {
  return new Set((db.prepare(`pragma table_info(${JSON.stringify(table)})`).all() as { name: string }[]).map((c) => c.name))
}
