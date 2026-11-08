import { join } from 'node:path'
import { app, MessageChannelMain, utilityProcess, type UtilityProcess, type WebContents } from 'electron'
import type { ClientHello, EngineConnect } from '@openstage/shared'

/**
 * Runs the engine in a utility process and hands every window a direct MessagePort to it.
 * The main process only wires ports; it never relays show traffic. If the engine dies it is
 * restarted and every window is re-wired, while outputs keep showing their last frame.
 */
export class EngineHost {
  private isReady = false
  private isStopping = false
  private child: UtilityProcess | null = null
  private readonly loaded = new Set<WebContents>()
  private readonly clients = new Map<WebContents, ClientHello>()

  start(): void {
    this.isReady = false
    const child = utilityProcess.fork(join(__dirname, 'engine.js'), [`--data-dir=${app.getPath('userData')}`, `--bibles-dir=${join(app.getAppPath(), 'resources', 'bibles')}`, `--songs-dir=${join(app.getAppPath(), 'resources', 'songs')}`], {
      serviceName: 'OpenStage Engine',
      stdio: 'inherit',
    })
    this.child = child
    child.on('message', (message: { type?: string; restored?: boolean }) => {
      if (message?.type !== 'ready') return
      this.isReady = true
      if (message.restored) console.log('[main] engine restored the live state from the last run')
      for (const contents of this.clients.keys()) this.connect(contents)
    })
    child.on('exit', (code) => {
      if (this.child !== child) return
      this.child = null
      if (this.isStopping) return
      console.error(`[main] engine exited with code ${code}, restarting`)
      setTimeout(() => this.start(), 500)
    })
  }

  /** Call before loading the page: the window is connected after every load, reloads included. */
  attach(contents: WebContents, hello: ClientHello): void {
    this.clients.set(contents, hello)
    contents.on('did-start-loading', () => this.loaded.delete(contents))
    contents.on('did-finish-load', () => {
      this.loaded.add(contents)
      this.connect(contents)
    })
    contents.once('destroyed', () => {
      this.loaded.delete(contents)
      this.clients.delete(contents)
    })
  }

  async stop(): Promise<void> {
    this.isStopping = true
    const child = this.child
    if (!child) return
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill()
        resolve()
      }, 2000)
      child.once('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
      child.postMessage({ type: 'shutdown' })
    })
  }

  private connect(contents: WebContents): void {
    const hello = this.clients.get(contents)
    if (!hello || !this.child || !this.isReady || !this.loaded.has(contents) || contents.isDestroyed()) return
    const { port1, port2 } = new MessageChannelMain()
    const message: EngineConnect = { type: 'connect', hello }
    this.child.postMessage(message, [port1])
    contents.postMessage('engine-port', hello, [port2])
  }
}
