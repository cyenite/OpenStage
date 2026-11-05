import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { documentKindKeys, type DocumentKind, type DocumentTypes, type Id, type Library } from '@openstage/shared'
import { atomicWriteJson, CoalescingWriter } from '../persistence'
import { isSafeId, isValidDocument } from './validate'

export interface LoadProblem {
  kind: DocumentKind
  id: Id
  reason: string
  /** Set when the document was recovered from a backup instead of its own file. */
  recoveredFrom?: string
}

export interface DocumentStoreOptions {
  now?: () => number
  onError?: (error: unknown) => void
  backupCount?: number
  backupIntervalMs?: number
}

const backupFolder = '.backups'

/**
 * One JSON file per document at `<root>/<kind>/<id>.json`, written atomically. Before a file is
 * overwritten its last good version is copied to `<kind>/.backups/<id>/`, at most once per
 * interval, keeping a rolling window of versions to fall back on.
 */
export class DocumentStore {
  private readonly now: () => number
  private readonly onError: (error: unknown) => void
  private readonly backupCount: number
  private readonly backupIntervalMs: number
  private readonly writers = new Map<string, CoalescingWriter<DocumentTypes[DocumentKind]>>()

  constructor(
    readonly root: string,
    options: DocumentStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.onError = options.onError ?? ((error) => console.error('[store]', error))
    this.backupCount = options.backupCount ?? 10
    this.backupIntervalMs = options.backupIntervalMs ?? 5 * 60_000
  }

  async exists(): Promise<boolean> {
    return readdir(this.root).then(
      () => true,
      () => false,
    )
  }

  async loadAll(): Promise<{ library: Library; problems: LoadProblem[] }> {
    const library = Object.fromEntries(documentKindKeys.map((kind) => [kind, {}])) as Library
    const problems: LoadProblem[] = []
    for (const kind of documentKindKeys) {
      const names = await readdir(join(this.root, kind)).catch(() => [] as string[])
      for (const name of names.sort()) {
        if (name.startsWith('.') || !name.endsWith('.json')) continue
        const id = name.slice(0, -'.json'.length)
        if (!isSafeId(id)) {
          problems.push({ kind, id, reason: 'File name is not a valid document id' })
          continue
        }
        const loaded = await this.read(kind, id)
        if (loaded.problem) problems.push({ kind, id, ...loaded.problem })
        if (!loaded.document) continue
        if (loaded.document.id !== id) problems.push({ kind, id, reason: `Document id "${loaded.document.id}" did not match its file name; the file name wins` })
        ;(library[kind] as Record<Id, unknown>)[id] = { ...loaded.document, id }
      }
    }
    return { library, problems }
  }

  /** Queues a write; rapid saves of one document coalesce into a single write. */
  save<K extends DocumentKind>(kind: K, document: DocumentTypes[K]): void {
    if (!isSafeId(document.id)) throw new Error(`Refusing to save ${kind} with unsafe id ${JSON.stringify(document.id)}`)
    const key = `${kind}/${document.id}`
    let writer = this.writers.get(key)
    if (!writer) {
      writer = new CoalescingWriter((value) => this.write(kind, value), this.onError)
      this.writers.set(key, writer)
    }
    writer.save(document)
  }

  async saveAll(library: Library): Promise<void> {
    for (const kind of documentKindKeys) {
      for (const document of Object.values(library[kind])) this.save(kind, document)
    }
    await this.flush()
  }

  async flush(): Promise<void> {
    await Promise.all([...this.writers.values()].map((writer) => writer.flush()))
  }

  private path(kind: DocumentKind, id: Id): string {
    return join(this.root, kind, `${id}.json`)
  }

  private backupDirectory(kind: DocumentKind, id: Id): string {
    return join(this.root, kind, backupFolder, id)
  }

  private async read(kind: DocumentKind, id: Id) {
    const own = await parseDocument(kind, this.path(kind, id))
    if (own.document) return { document: own.document }
    const directory = this.backupDirectory(kind, id)
    const backups = (await readdir(directory).catch(() => [] as string[])).filter((n) => n.endsWith('.json')).sort().reverse()
    for (const name of backups) {
      const backup = await parseDocument(kind, join(directory, name))
      if (backup.document) return { document: backup.document, problem: { reason: own.reason, recoveredFrom: name } }
    }
    return { document: null, problem: { reason: own.reason } }
  }

  private async write(kind: DocumentKind, document: DocumentTypes[DocumentKind]): Promise<void> {
    await this.backUp(kind, document.id)
    await atomicWriteJson(this.path(kind, document.id), document)
  }

  /** Copies the current file aside unless a recent backup exists or the file is not a good document. */
  private async backUp(kind: DocumentKind, id: Id): Promise<void> {
    const current = await readFile(this.path(kind, id), 'utf8').catch(() => null)
    if (current === null || !isValidDocument(kind, safeParse(current))) return
    const directory = this.backupDirectory(kind, id)
    const existing = (await readdir(directory).catch(() => [] as string[])).filter((n) => n.endsWith('.json')).sort()
    const newest = existing.at(-1)
    const now = this.now()
    if (newest && now - Number(newest.slice(0, -'.json'.length)) < this.backupIntervalMs) return
    const name = `${String(now).padStart(15, '0')}.json`
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, name), current)
    const expired = [...existing, name].slice(0, -this.backupCount)
    await Promise.all(expired.map((n) => rm(join(directory, n), { force: true })))
  }
}

async function parseDocument(kind: DocumentKind, path: string) {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return { document: null, reason: 'File could not be read' }
  }
  const value = safeParse(text)
  if (value === undefined) return { document: null, reason: 'File is not valid JSON' }
  if (!isValidDocument(kind, value)) return { document: null, reason: `File is not a valid ${kind} document` }
  return { document: value as DocumentTypes[DocumentKind], reason: '' }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
