import type { ClientHello, ClientMessage, EngineMessage } from '@openstage/shared'

type Listener = (message: EngineMessage) => void

/**
 * The page's end of its MessagePort to the engine. The port arrives after every page load and
 * again whenever the engine restarts, so a new port simply replaces the old one.
 */
class EngineClient {
  hello: ClientHello | null = null
  private port: MessagePort | null = null
  private readonly listeners = new Set<Listener>()

  constructor() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.type !== 'openstage:engine-port' || !event.ports[0]) return
      this.port?.close()
      this.hello = event.data.hello
      this.port = event.ports[0]
      this.port.onmessage = (message) => this.listeners.forEach((listener) => listener(message.data))
    })
  }

  send(message: ClientMessage): void {
    this.port?.postMessage(message)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const engine = new EngineClient()
