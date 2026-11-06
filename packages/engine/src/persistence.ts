import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { BibleText, EngineState, Library } from '@openstage/shared'
import { buildDecks } from './decks'
import { sanitize } from './state'

let tempCounter = 0

/** Write to a temp file, fsync, then rename over the target, so a power cut never leaves a half-written file. */
export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const directory = dirname(path)
  const temp = join(directory, `.${process.pid}.${Date.now()}.${tempCounter++}.tmp`)
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temp, JSON.stringify(value, null, 2))
    const handle = await open(temp, 'r+')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/**
 * Restores the live state written before a crash or power cut. Anything that no longer
 * points at real content is dropped rather than trusted; a missing service discards the lot.
 */
export async function loadLiveState(path: string, library: Library, bibles: BibleText[] = []): Promise<EngineState | null> {
  let raw: Partial<EngineState>
  try {
    raw = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
  const service = raw?.serviceId ? library.services[raw.serviceId] : undefined
  if (!service) return null
  return sanitize(raw, buildDecks(service, library, bibles), library)
}

/** Coalesces rapid changes into one write; at most one write is in flight at a time. */
export class CoalescingWriter<T> {
  private pending: { value: T } | null = null
  private writing: Promise<void> | null = null

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  save(value: T): void {
    this.pending = { value }
    this.writing ??= this.drain()
  }

  async flush(): Promise<void> {
    await this.writing
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const { value } = this.pending
      this.pending = null
      await this.write(value).catch(this.onError)
    }
    this.writing = null
  }
}
