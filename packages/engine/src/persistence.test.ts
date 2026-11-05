import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDecks } from './decks'
import { demoLibrary, demoService } from './demo-library'
import { atomicWriteJson, loadLiveState, StateSaver } from './persistence'
import { initialState } from './state'

const decks = buildDecks(demoService, demoLibrary)

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

  it('restores a saved live state', async () => {
    const path = join(await tempDir(), 'live-state.json')
    const state = { ...initialState(decks, 'candle'), live: { slide: { itemId: decks[0]!.itemId, index: 3 }, audio: 'walk-in', background: 'candle', lowerThird: 'pastor' } }
    const saver = new StateSaver(path, (error) => {
      throw error
    })
    saver.save(initialState(decks, null))
    saver.save(state)
    await saver.flush()
    expect(await loadLiveState(path, decks, demoLibrary)).toEqual(state)
  })

  it('drops references to content that no longer exists', async () => {
    const path = join(await tempDir(), 'live-state.json')
    await writeFile(path, JSON.stringify({ preview: { itemId: 'gone', index: 0 }, live: { slide: { itemId: decks[0]!.itemId, index: 42 }, background: 'gone', audio: null, lowerThird: null } }))
    const restored = await loadLiveState(path, decks, demoLibrary)
    expect(restored).toEqual({ preview: null, selectedItemId: null, live: { slide: null, audio: null, background: null, lowerThird: null } })
  })

  it('returns null for a missing or corrupt file', async () => {
    const dir = await tempDir()
    await writeFile(join(dir, 'bad.json'), '{"preview":')
    expect(await loadLiveState(join(dir, 'missing.json'), decks, demoLibrary)).toBeNull()
    expect(await loadLiveState(join(dir, 'bad.json'), decks, demoLibrary)).toBeNull()
  })
})
