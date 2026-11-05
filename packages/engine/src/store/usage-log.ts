import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Id, Service, ServiceItem } from '@openstage/shared'

export interface UsageEntry {
  at: string
  day: string
  songId: Id
  serviceId: Id
}

/** A song going live in a service, dated by the local calendar day the service ran on. */
export function usageEntry(item: ServiceItem, service: Service, now: Date): UsageEntry | null {
  if (item.type !== 'song') return null
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
  return { at: now.toISOString(), day, songId: item.songId, serviceId: service.id }
}

/**
 * Append-only JSON lines. Usage cannot be rebuilt from the documents, so it gets its own file
 * that the index replays at start-up; a line cut short by a power cut is skipped.
 */
export class UsageLog {
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly path: string,
    private readonly onError: (error: unknown) => void,
  ) {}

  async read(): Promise<UsageEntry[]> {
    const text = await readFile(this.path, 'utf8').catch(() => '')
    const entries: UsageEntry[] = []
    for (const line of text.split('\n')) {
      try {
        const entry = JSON.parse(line)
        if (typeof entry?.songId === 'string' && typeof entry.serviceId === 'string' && typeof entry.day === 'string') entries.push(entry)
      } catch {
        continue
      }
    }
    return entries
  }

  append(entry: UsageEntry): void {
    this.writing = this.writing
      .then(() => mkdir(dirname(this.path), { recursive: true }))
      .then(() => appendFile(this.path, `${JSON.stringify(entry)}\n`))
      .catch(this.onError)
  }

  async flush(): Promise<void> {
    await this.writing
  }
}
