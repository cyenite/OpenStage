import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EngineState } from '@openstage/shared'
import { buildDecks } from './decks'
import { atomicWriteJson, CoalescingWriter, loadLiveState } from './persistence'
import { starterLibrary } from './starter-library'
import { initialState } from './state'

const decks = buildDecks(starterLibrary.services.sunday!, starterLibrary)

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'openstage-'))
}

describe('persistence', () => {
  it('writes atomically and leaves no temp files behind', async () => {
    const dir = await tempDir()
    const path = join(dir, 'state.json')
    await atomicWriteJson(path, { a: 1 })
    await atomicWriteJson(path, { a: 2 })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ a: 2 })
    expect(await readdir(dir)).toEqual(['state.json'])
  })

  it('writes several files in one folder at the same moment', async () => {
    const dir = await tempDir()
    await Promise.all(['a', 'b', 'c', 'd'].map((name) => atomicWriteJson(join(dir, `${name}.json`), { name })))
    expect((await readdir(dir)).sort()).toEqual(['a.json', 'b.json', 'c.json', 'd.json'])
  })

  it('restores a saved live state', async () => {
    const path = join(await tempDir(), 'live-state.json')
    const state: EngineState = {
      ...initialState(decks, 'candle', 'sunday'),
      live: { slide: { itemId: decks[0]!.itemId, index: 3 }, audio: 'walk-in', background: 'candle', lowerThird: 'pastor' },
    }
    const saver = new CoalescingWriter<EngineState>(
      (value) => atomicWriteJson(path, value),
      (error) => {
        throw error
      },
    )
    saver.save(initialState(decks, null, 'sunday'))
    saver.save(state)
    await saver.flush()
    expect(await loadLiveState(path, starterLibrary)).toEqual(state)
  })

  it('drops references to content that no longer exists', async () => {
    const path = join(await tempDir(), 'live-state.json')
    const raw = { serviceId: 'sunday', preview: { itemId: 'gone', index: 0 }, live: { slide: { itemId: decks[0]!.itemId, index: 42 }, background: 'gone', audio: null, lowerThird: null } }
    await writeFile(path, JSON.stringify(raw))
    expect(await loadLiveState(path, starterLibrary)).toEqual({
      serviceId: 'sunday',
      preview: null,
      selectedItemId: null,
      live: { slide: null, audio: null, background: null, lowerThird: null },
    })
  })

  it('returns null for a missing or corrupt file, or a service that is gone', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'bad.json'), '{"preview":')
    await writeFile(join(dir, 'no-service.json'), JSON.stringify({ serviceId: 'deleted', live: {} }))
    expect(await loadLiveState(join(dir, 'missing.json'), starterLibrary)).toBeNull()
    expect(await loadLiveState(join(dir, 'bad.json'), starterLibrary)).toBeNull()
    expect(await loadLiveState(join(dir, 'no-service.json'), starterLibrary)).toBeNull()
  })

  it('coalesces rapid saves into the latest value', async () => {
    const written: number[] = []
    const writer = new CoalescingWriter<number>(
      async (value) => void written.push(value),
      () => {},
    )
    for (const value of [1, 2, 3, 4]) writer.save(value)
    await writer.flush()
    expect(written).toEqual([1, 4])
  })
})
