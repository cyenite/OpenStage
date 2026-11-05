import { join } from 'node:path'
import type { ClientMessage, EngineConnect, EngineMessage } from '@openstage/shared'
import { demoLibrary, demoService } from './demo-library'
import { buildDecks } from './decks'
import { Engine, type ClientPort } from './engine'
import { loadLiveState, StateSaver } from './persistence'

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
  const saver = new StateSaver(statePath, (error) => console.error('[engine] could not save live state', error))
  const restored = await loadLiveState(statePath, buildDecks(demoService, demoLibrary), demoLibrary)

  const engine = new Engine({
    library: demoLibrary,
    service: demoService,
    restored,
    onStateChange: (state) => saver.save(state),
  })

  parentPort.on('message', (event) => {
    const message = event.data as EngineConnect | { type: 'shutdown' }
    if (message.type === 'shutdown') {
      void saver.flush().then(() => process.exit(0))
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
