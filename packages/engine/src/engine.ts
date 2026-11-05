import type {
  ClientHello,
  ClientMessage,
  Command,
  Deck,
  EngineMessage,
  EngineState,
  Library,
  OperatorSnapshot,
  RenderState,
  Service,
} from '@openstage/shared'
import { buildDecks } from './decks'
import { outputs, resolveRender, type OutputId } from './resolve'
import { initialState, reduce } from './state'

export interface ClientPort {
  send(message: EngineMessage): void
  onMessage(listener: (message: ClientMessage) => void): void
  onClose(listener: () => void): void
}

interface Client {
  port: ClientPort
  hello: ClientHello
}

interface OutputChannel {
  json: string
  render: RenderState
  ackedSeq: number
}

export interface EngineOptions {
  library: Library
  service: Service
  restored?: EngineState | null
  onStateChange?: (state: EngineState) => void
}

/**
 * Owns all live state. The operator window, outputs and (later) remotes are clients:
 * they send commands and receive resolved state, so any of them can reload without losing the show.
 */
export class Engine {
  readonly decks: Deck[]
  private state: EngineState
  private readonly library: Library
  private readonly service: Service
  private readonly clients = new Set<Client>()
  private readonly channels = new Map<OutputId, OutputChannel>()
  private readonly onStateChange: ((state: EngineState) => void) | undefined

  constructor(options: EngineOptions) {
    this.library = options.library
    this.service = options.service
    this.onStateChange = options.onStateChange
    this.decks = buildDecks(options.service, options.library)
    this.state = options.restored ?? initialState(this.decks, options.library.backgrounds[0]?.id ?? null)
    this.resolveOutputs()
  }

  get current(): EngineState {
    return this.state
  }

  private get context() {
    return { decks: this.decks, library: this.library }
  }

  connect(port: ClientPort, hello: ClientHello): void {
    const client = { port, hello }
    this.clients.add(client)
    port.onClose(() => {
      this.clients.delete(client)
      this.sendSnapshots()
    })
    port.onMessage((message) => this.receive(client, message))
    const channel = hello.outputId ? this.channels.get(hello.outputId as OutputId) : undefined
    if (hello.role === 'output' && channel) port.send({ type: 'render', render: channel.render })
    this.sendSnapshots()
  }

  dispatch(command: Command): void {
    const next = reduce(this.state, command, this.decks)
    if (next === this.state) return
    this.state = next
    this.onStateChange?.(next)
    for (const id of this.resolveOutputs()) this.sendRender(id)
    this.sendSnapshots()
  }

  snapshot(): OperatorSnapshot {
    const projector = outputs[0]
    return {
      state: this.state,
      decks: this.decks,
      service: this.service,
      library: {
        audioCues: this.library.audioCues,
        backgrounds: this.library.backgrounds,
        lowerThirds: this.library.lowerThirds,
      },
      outputs: outputs.map((o) => {
        const channel = this.channels.get(o.id)
        return {
          id: o.id,
          name: o.name,
          sentSeq: channel?.render.seq ?? 0,
          ackedSeq: channel?.ackedSeq ?? 0,
          isConnected: [...this.clients].some((c) => c.hello.outputId === o.id),
        }
      }),
      liveRender: this.channels.get(projector.id)!.render,
      previewRender: { seq: 0, ...resolveRender(this.state, this.context, projector, this.state.preview) },
    }
  }

  private receive(client: Client, message: ClientMessage): void {
    if (message?.type === 'command' && client.hello.role === 'operator') {
      this.dispatch(message.command)
    } else if (message?.type === 'ack' && client.hello.outputId) {
      const channel = this.channels.get(client.hello.outputId as OutputId)
      if (!channel || typeof message.seq !== 'number') return
      channel.ackedSeq = Math.max(channel.ackedSeq, Math.min(message.seq, channel.render.seq))
      this.sendSnapshots()
    }
  }

  /** Returns the outputs whose frame actually changed; only those get a new seq. */
  private resolveOutputs(): OutputId[] {
    const changed: OutputId[] = []
    for (const profile of outputs) {
      const resolved = resolveRender(this.state, this.context, profile)
      const json = JSON.stringify(resolved)
      const channel = this.channels.get(profile.id)
      if (channel?.json === json) continue
      const seq = (channel?.render.seq ?? 0) + 1
      this.channels.set(profile.id, { json, render: { seq, ...resolved }, ackedSeq: channel?.ackedSeq ?? 0 })
      changed.push(profile.id)
    }
    return changed
  }

  private sendRender(id: OutputId): void {
    const render = this.channels.get(id)!.render
    for (const client of this.clients) {
      if (client.hello.role === 'output' && client.hello.outputId === id) client.port.send({ type: 'render', render })
    }
  }

  private sendSnapshots(): void {
    const operators = [...this.clients].filter((c) => c.hello.role === 'operator')
    if (operators.length === 0) return
    const snapshot = this.snapshot()
    for (const client of operators) client.port.send({ type: 'snapshot', snapshot })
  }
}
