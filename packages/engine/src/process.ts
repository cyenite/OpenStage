import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ClientMessage, EngineConnect, EngineMessage, EngineState, Library } from '@openstage/shared'
import { BibleComClient } from './bibles/biblecom'
import { loadBibles, removeBible, saveBible } from './bibles/store'
import { Engine, type ClientPort, type EngineSettings } from './engine'
import { atomicWriteJson, CoalescingWriter, loadLiveState } from './persistence'
import { loadSongPacks, songsToInstall } from './song-packs'
import { WorshipLeaderClient } from './import/worship-leader'
import { starterLibrary } from './starter-library'
import { DocumentStore } from './store/document-store'
import { LibraryIndex } from './store/library-index'
import { usageEntry, UsageLog } from './store/usage-log'

/** The parts of Electron's MessagePortMain and parentPort this process uses; avoids depending on electron here. */
interface MainPort {
  on(event: 'message', listener: (event: { data: unknown; ports: MainPort[] }) => void): void
  on(event: 'close', listener: () => void): void
  postMessage(message: unknown): void
  start(): void
}

export async function startEngineProcess(): Promise<void> {
  const parentPort = (process as unknown as { parentPort?: MainPort }).parentPort
  if (!parentPort) throw new Error('The engine must run as an Electron utility process')

  const argument = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const dataDir = argument('data-dir') ?? process.cwd()
  const statePath = join(dataDir, 'live-state.json')
  const report = (what: string) => (error: unknown) => console.error(`[engine] could not save ${what}`, error)
  const saver = new CoalescingWriter<EngineState>((state) => atomicWriteJson(statePath, state), report('live state'))
  const store = new DocumentStore(join(dataDir, 'library'), { onError: report('a document') })
  const usage = new UsageLog(join(dataDir, 'usage.jsonl'), report('song usage'))

  await store.saveAll(datedStarter(new Date()), await store.missingKinds())
  const { library: loaded, problems } = await store.loadAll()
  for (const problem of problems) console.warn('[engine] library:', problem)
  const library = await installSongPacks(loaded, store, argument('songs-dir'), join(dataDir, 'song-packs.json'))
  const index = new LibraryIndex()
  index.rebuild(library)
  for (const entry of await usage.read()) index.recordUsage(entry)
  const bundledFolder = argument('bibles-dir')
  const userBibles = join(dataDir, 'bibles')
  const onBadBible = (file: string, error: unknown) => console.warn('[engine] could not read Bible', file, error)
  const bundled = bundledFolder ? await loadBibles([bundledFolder], onBadBible) : []
  const bibles = await loadBibles([...(bundledFolder ? [bundledFolder] : []), userBibles], onBadBible)
  const restored = await loadLiveState(statePath, library, bibles)
  const settingsPath = join(dataDir, 'settings.json')
  const settings = await loadSettings(settingsPath)
  const settingsSaver = new CoalescingWriter<EngineSettings>((value) => atomicWriteJson(settingsPath, value), report('settings'))

  const engine = new Engine({
    index,
    bibles,
    settings,
    onSettingsChange: (value) => settingsSaver.save(value),
    library,
    restored,
    onStateChange: (state) => saver.save(state),
    onItemLive: (item, service) => {
      const entry = usageEntry(item, service, new Date())
      if (entry && index.recordUsage(entry)) usage.append(entry)
    },
    onDocumentChange: (kind, document) => {
      store.save(kind, document)
      index.upsert(kind, document)
    },
    onBibleImported: (bible) => {
      saveBible(userBibles, bible).catch(report('an imported Bible'))
    },
    onBibleRemoved: (code) => {
      removeBible(userBibles, code).catch(report('a removed Bible'))
    },
    bundledBibles: bundled.map((b) => b.code),
    // Tests set this so they never reach bible.com or a song catalogue.
    bibleCom: process.env['OPENSTAGE_OFFLINE'] ? undefined : { client: new BibleComClient(), stagingDir: join(dataDir, 'bible-downloads') },
    songSources: process.env['OPENSTAGE_OFFLINE'] ? {} : { worshipLeader: new WorshipLeaderClient() },
    onDocumentRemove: (kind, id) => {
      index.remove(kind, id)
      store.remove(kind, id).catch(report('a removed document'))
    },
  })

  parentPort.on('message', (event) => {
    const message = event.data as EngineConnect | { type: 'shutdown' }
    if (message.type === 'shutdown') {
      void Promise.all([saver.flush(), store.flush(), usage.flush(), settingsSaver.flush()]).then(() => process.exit(0))
    } else if (message.type === 'connect' && event.ports[0]) {
      engine.connect(wrap(event.ports[0]), message.hello)
    }
  })
  parentPort.postMessage({ type: 'ready', restored: !!restored })
}

/** A settings file that does not read leaves the window unlocked with no PIN, rather than locked with no way in. */
async function loadSettings(path: string): Promise<EngineSettings> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Partial<EngineSettings>
    const hasPin = typeof raw.pinHash === 'string' && typeof raw.pinSalt === 'string'
    return hasPin ? { pinHash: raw.pinHash!, pinSalt: raw.pinSalt!, isLocked: raw.isLocked === true } : { isLocked: false }
  } catch {
    return { isLocked: false }
  }
}

/** Adds each bundled song pack's songs the first time this library sees that pack. */
async function installSongPacks(library: Library, store: DocumentStore, folder: string | undefined, recordPath: string): Promise<Library> {
  if (!folder) return library
  const installed: string[] = await readFile(recordPath, 'utf8').then((text) => JSON.parse(text), () => [])
  const packs = await loadSongPacks(folder, (file, error) => console.warn('[engine] could not read song pack', file, error))
  const fresh = packs.filter((pack) => !installed.includes(pack.id))
  if (fresh.length === 0) return library
  let next = library
  for (const pack of fresh) {
    const songs = songsToInstall(pack, next)
    for (const song of songs) store.save('songs', song)
    next = { ...next, songs: { ...next.songs, ...Object.fromEntries(songs.map((s) => [s.id, s])) } }
  }
  await store.flush()
  await atomicWriteJson(recordPath, [...installed, ...fresh.map((p) => p.id)])
  return next
}

/** The starter service lands on the coming Sunday, so a new calendar has something on it. */
function datedStarter(today: Date): typeof starterLibrary {
  const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + ((7 - today.getDay()) % 7))
  const date = [sunday.getFullYear(), sunday.getMonth() + 1, sunday.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
  const services = Object.fromEntries(Object.entries(starterLibrary.services).map(([id, s]) => [id, { ...s, date, time: '09:00' }]))
  return { ...starterLibrary, services }
}

function wrap(port: MainPort): ClientPort {
  const client: ClientPort = {
    send: (message: EngineMessage) => port.postMessage(message),
    onMessage: (listener) => port.on('message', (event) => listener(event.data as ClientMessage)),
    onClose: (listener) => port.on('close', listener),
  }
  port.start()
  return client
}
