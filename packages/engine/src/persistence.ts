import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Deck, EngineState, Library } from '@openstage/shared'
import { emptyLive, isValid } from './state'

/** Write to a temp file, fsync, then rename over the target, so a power cut never leaves a half-written file. */
export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const directory = dirname(path)
  const temp = join(directory, `.${process.pid}.${Date.now()}.tmp`)
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
 * points at real content is dropped rather than trusted.
 */
export async function loadLiveState(path: string, decks: Deck[], library: Library): Promise<EngineState | null> {
  let raw: Partial<EngineState>
  try {
    raw = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
  const live = { ...emptyLive, ...raw.live }
  const has = (list: { id: string }[], id: string | null) => !!id && list.some((x) => x.id === id)
  return {
    preview: isValid(decks, raw.preview ?? null) ? raw.preview! : null,
    selectedItemId: decks.some((d) => d.itemId === raw.selectedItemId) ? raw.selectedItemId! : null,
    live: {
      slide: isValid(decks, live.slide) ? live.slide : null,
      audio: has(library.audioCues, live.audio) ? live.audio : null,
      background: has(library.backgrounds, live.background) ? live.background : null,
      lowerThird: has(library.lowerThirds, live.lowerThird) ? live.lowerThird : null,
    },
  }
}

/** Coalesces rapid changes into one write; at most one write is in flight at a time. */
export class StateSaver {
  private pending: EngineState | null = null
  private writing: Promise<void> | null = null

  constructor(
    private readonly path: string,
    private readonly onError: (error: unknown) => void,
  ) {}

  save(state: EngineState): void {
    this.pending = state
    this.writing ??= this.drain()
  }

  async flush(): Promise<void> {
    await this.writing
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const state = this.pending
      this.pending = null
      await atomicWriteJson(this.path, state).catch(this.onError)
    }
    this.writing = null
  }
}
