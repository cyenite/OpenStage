import { join } from 'node:path'
import type { ClientMessage, EngineConnect, EngineMessage, EngineState } from '@openstage/shared'
import { Engine, type ClientPort } from './engine'
import { atomicWriteJson, CoalescingWriter, loadLiveState } from './persistence'
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

  const dataDir = process.argv.find((a) => a.startsWith('--data-dir='))?.slice('--data-dir='.length) ?? process.cwd()
  const statePath = join(dataDir, 'live-state.json')
  const report = (what: string) => (error: unknown) => console.error(`[engine] could not save ${what}`, error)
  const saver = new CoalescingWriter<EngineState>((state) => atomicWriteJson(statePath, state), report('live state'))
  const store = new DocumentStore(join(dataDir, 'library'), { onError: report('a document') })
  const usage = new UsageLog(join(dataDir, 'usage.jsonl'), report('song usage'))

  if (!(await store.exists())) await store.saveAll(starterLibrary)
  const { library, problems } = await store.loadAll()
  for (const problem of problems) console.warn('[engine] library:', problem)
  const index = new LibraryIndex()
  index.rebuild(library)
  for (const entry of await usage.read()) index.recordUsage(entry)
  const restored = await loadLiveState(statePath, library)

  const engine = new Engine({
    index,
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
  })

  parentPort.on('message', (event) => {
    const message = event.data as EngineConnect | { type: 'shutdown' }
    if (message.type === 'shutdown') {
      void Promise.all([saver.flush(), store.flush(), usage.flush()]).then(() => process.exit(0))
    } else if (message.type === 'connect' && event.ports[0]) {
      engine.connect(wrap(event.ports[0]), message.hello)
    }
  })
  parentPort.postMessage({ type: 'ready', restored: !!restored })
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
