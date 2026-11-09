import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { documentKindKeys, type Song } from '@openstage/shared'
import { applySongEdit } from '../edits'
import { starterLibrary } from '../starter-library'
import { DocumentStore } from './document-store'
import { DocumentHistory } from './history'
import { LibraryIndex, toMatchQuery } from './library-index'
import { usageEntry, UsageLog } from './usage-log'

const grace = starterLibrary.songs['amazing-grace']!

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'openstage-store-'))
}

function storeAt(root: string, clock = { now: 1_000_000 }) {
  const errors: unknown[] = []
  const store = new DocumentStore(root, { now: () => clock.now, onError: (e) => errors.push(e), backupCount: 3, backupIntervalMs: 1000 })
  return { store, clock, errors }
}

describe('DocumentStore', () => {
  it('round-trips a whole library, one file per document', async () => {
    const root = join(await tempDir(), 'library')
    const { store, errors } = storeAt(root)
    expect(await store.missingKinds()).toHaveLength(documentKindKeys.length)
    await store.saveAll(starterLibrary)
    expect(await store.missingKinds()).toEqual([])
    expect((await readdir(join(root, 'songs'))).sort()).toEqual(['amazing-grace.json', 'it-is-well.json'])
    const { library, problems } = await store.loadAll()
    expect(library).toEqual(starterLibrary)
    expect(problems).toEqual([])
    expect(errors).toEqual([])
  })

  it('keeps a rolling window of backups, at most one per interval', async () => {
    const root = await tempDir()
    const { store, clock } = storeAt(root)
    for (let version = 1; version <= 6; version++) {
      store.save('songs', { ...grace, title: `v${version}` })
      await store.flush()
      clock.now += version === 2 ? 10 : 2000
    }
    const backups = await readdir(join(root, 'songs', '.backups', 'amazing-grace'))
    const titles = await Promise.all(backups.sort().map(async (n) => JSON.parse(await readFile(join(root, 'songs', '.backups', 'amazing-grace', n), 'utf8')).title))
    expect(titles).toEqual(['v3', 'v4', 'v5'])
  })

  it('recovers a corrupt document from its newest good backup', async () => {
    const root = await tempDir()
    const { store, clock } = storeAt(root)
    store.save('songs', { ...grace, title: 'Good' })
    await store.flush()
    clock.now += 5000
    store.save('songs', { ...grace, title: 'Newer' })
    await store.flush()
    await writeFile(join(root, 'songs', 'amazing-grace.json'), '{"title": "Amaz')
    const { library, problems } = await store.loadAll()
    expect(library.songs['amazing-grace']!.title).toBe('Good')
    expect(problems).toEqual([{ kind: 'songs', id: 'amazing-grace', reason: 'File is not valid JSON', recoveredFrom: expect.stringMatching(/\.json$/) }])
  })

  it('never backs up a corrupt file over good backups', async () => {
    const root = await tempDir()
    const { store, clock } = storeAt(root)
    store.save('songs', grace)
    await store.flush()
    await writeFile(join(root, 'songs', 'amazing-grace.json'), 'not json')
    clock.now += 5000
    store.save('songs', { ...grace, title: 'Fixed' })
    await store.flush()
    expect(await readdir(join(root, 'songs', '.backups')).catch(() => [])).toEqual([])
  })

  it('reports and skips files that are not documents', async () => {
    const root = await tempDir()
    const { store } = storeAt(root)
    await mkdir(join(root, 'services'), { recursive: true })
    await writeFile(join(root, 'services', 'odd.json'), JSON.stringify({ id: 'odd', items: 'none' }))
    await writeFile(join(root, 'services', 'renamed.json'), JSON.stringify({ id: 'other', name: 'Renamed', items: [] }))
    await writeFile(join(root, 'services', 'has space.json'), JSON.stringify({ id: 'x', name: 'X', items: [] }))
    const { library, problems } = await store.loadAll()
    expect(Object.keys(library.services)).toEqual(['renamed'])
    expect(library.services.renamed!.id).toBe('renamed')
    expect(problems.map((p) => `${p.id}: ${p.reason}`)).toEqual([
      'has space: File name is not a valid document id',
      'odd: File is not a valid services document',
      'renamed: Document id "other" did not match its file name; the file name wins',
    ])
  })

  it('seeds only the kinds a library has never had', async () => {
    const root = await tempDir()
    const { store } = storeAt(root)
    await mkdir(join(root, 'songs'), { recursive: true })
    await store.saveAll(starterLibrary, await store.missingKinds())
    const { library } = await store.loadAll()
    expect(Object.keys(library.songs)).toEqual([])
    expect(Object.keys(library.themes)).toContain('classic')
  })

  it('fills in a theme missing boxes from the classic theme', async () => {
    const root = await tempDir()
    const { store } = storeAt(root)
    await mkdir(join(root, 'themes'), { recursive: true })
    await writeFile(join(root, 'themes', 'bare.json'), JSON.stringify({ id: 'bare', name: 'Bare', boxes: { main: { color: '#FF0000' } } }))
    const { library } = await store.loadAll()
    expect(library.themes.bare).toMatchObject({ fill: null, overrides: {}, boxes: { main: { color: '#FF0000', font: { family: 'newsreader' } }, reference: { align: 'center' } } })
  })

  it('upgrades songs saved with plain string lines', async () => {
    const root = await tempDir()
    const { store } = storeAt(root)
    await mkdir(join(root, 'songs'), { recursive: true })
    const old = { id: 'old', title: 'Old', meta: { authors: ['A'], copyright: '' }, sections: { v: { id: 'v', kind: 'verse', label: 'V', slides: [{ lines: ['Hello'] }] } }, arrangements: [] }
    await writeFile(join(root, 'songs', 'old.json'), JSON.stringify(old))
    const { library } = await store.loadAll()
    expect(library.songs.old).toMatchObject({ languages: ['en'], sections: { v: { slides: [{ lines: [{ text: 'Hello', chords: [] }] }] } } })
  })

  it('moves a removed document to the trash folder', async () => {
    const root = await tempDir()
    const { store } = storeAt(root)
    await store.saveAll(starterLibrary)
    await store.remove('songs', 'it-is-well')
    expect(await readdir(join(root, 'songs'))).not.toContain('it-is-well.json')
    expect(await readdir(join(root, '.trash', 'songs'))).toEqual([expect.stringMatching(/^it-is-well\.\d+\.json$/)])
    expect((await store.loadAll()).library.songs['it-is-well']).toBeUndefined()
  })

  it('refuses ids that could escape the library folder', async () => {
    const { store } = storeAt(await tempDir())
    expect(() => store.save('songs', { ...grace, id: '../evil' })).toThrow(/unsafe id/)
    await expect(store.remove('songs', '../evil')).rejects.toThrow(/unsafe id/)
  })
})

describe('LibraryIndex', () => {
  const index = new LibraryIndex()
  index.rebuild(starterLibrary)

  it('finds songs by lyrics, prefix and accents, ranking titles first', () => {
    expect(index.search('sea bill').map((h) => h.id)).toEqual(['it-is-well'])
    expect(index.search('twas grace').map((h) => h.id)).toEqual(['amazing-grace'])
    expect(index.search('GRÂCE', { kind: 'songs' }).map((h) => h.id)).toEqual(['amazing-grace'])
    expect(index.search('john 3').map((h) => h.id)).toEqual(['john-3-16'])
    expect(index.search('candle').map((h) => h.kind)).toEqual(['backgrounds'])
    expect(index.search('grace', { kind: 'songs' })[0]!.detail).toBe('John Newton')
  })

  it('marks matched words in the snippet', () => {
    expect(index.search('billows')[0]!.snippet).toContain('\u0001billows\u0002')
  })

  it('treats query syntax as plain words', () => {
    expect(toMatchQuery('grace" OR * NEAR(')).toBe('"grace"* "or"* "near"*')
    expect(index.search('"')).toEqual([])
    expect(() => index.search('grace AND (')).not.toThrow()
  })

  it('follows edits', () => {
    const local = new LibraryIndex()
    local.rebuild(starterLibrary)
    local.upsert('songs', { ...grace, title: 'Neema ya Ajabu' })
    expect(local.search('neema').map((h) => h.title)).toEqual(['Neema ya Ajabu'])
    expect(local.search('amazing', { kind: 'songs' }).map((h) => h.title)).toEqual(['Neema ya Ajabu'])
  })

  it('counts a song once per service per day for CCLI reports', () => {
    const local = new LibraryIndex()
    local.rebuild(starterLibrary)
    const at = '2026-11-08T08:00:00.000Z'
    expect(local.recordUsage({ songId: 'amazing-grace', serviceId: 'sunday', day: '2026-11-08', at })).toBe(true)
    expect(local.recordUsage({ songId: 'amazing-grace', serviceId: 'sunday', day: '2026-11-08', at })).toBe(false)
    local.recordUsage({ songId: 'amazing-grace', serviceId: 'sunday', day: '2026-11-15', at })
    local.recordUsage({ songId: 'it-is-well', serviceId: 'sunday', day: '2026-11-15', at })
    local.recordUsage({ songId: 'deleted-song', serviceId: 'sunday', day: '2026-11-15', at })
    expect(local.usageReport('2026-11-01', '2026-11-30')).toEqual([
      { songId: 'amazing-grace', title: 'Amazing Grace', count: 2 },
      { songId: 'deleted-song', title: 'deleted-song', count: 1 },
      { songId: 'it-is-well', title: 'It Is Well with My Soul', count: 1 },
    ])
    expect(local.usageReport('2026-11-09', '2026-11-14')).toEqual([])
  })
})

describe('UsageLog', () => {
  it('appends entries and skips a line cut short', async () => {
    const path = join(await tempDir(), 'usage.jsonl')
    const log = new UsageLog(path, (error) => {
      throw error
    })
    const service = starterLibrary.services.sunday!
    const entry = usageEntry(service.items[0]!, service, new Date(2026, 10, 8, 10, 30))!
    expect(entry).toMatchObject({ songId: 'amazing-grace', serviceId: 'sunday', day: '2026-11-08' })
    expect(usageEntry(service.items[1]!, service, new Date())).toBeNull()
    log.append(entry)
    await log.flush()
    await writeFile(path, `${await readFile(path, 'utf8')}{"songId":"it-is`)
    expect(await log.read()).toEqual([entry])
  })
})

describe('DocumentHistory', () => {
  const rename = (title: string) => ({ type: 'song.setTitle', title }) as const

  it('replays the log for undo and keeps redo until a new edit', () => {
    const history = new DocumentHistory<Song, ReturnType<typeof rename>>(grace, applySongEdit)
    history.execute(rename('A'))
    history.execute(rename('B'))
    expect(history.undo()).toBe(true)
    expect(history.document.title).toBe('A')
    expect(history.redo()).toBe(true)
    expect(history.document.title).toBe('B')
    history.undo()
    history.execute(rename('C'))
    expect(history.canRedo).toBe(false)
    history.undo()
    history.undo()
    expect(history.document).toBe(grace)
    expect(history.undo()).toBe(false)
  })

  it('records nothing for a command that changes nothing', () => {
    const history = new DocumentHistory(grace, applySongEdit)
    expect(history.execute(rename(grace.title))).toBe(false)
    expect(history.canUndo).toBe(false)
  })

  it('folds the oldest command into the base past its limit', () => {
    const history = new DocumentHistory(grace, applySongEdit, 2)
    for (const title of ['A', 'B', 'C']) history.execute(rename(title))
    history.undo()
    history.undo()
    expect(history.document.title).toBe('A')
    expect(history.canUndo).toBe(false)
  })
})
