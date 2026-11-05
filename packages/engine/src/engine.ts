import {
  lookup,
  type ClientHello,
  type ClientMessage,
  type Command,
  type Deck,
  type DocumentKind,
  type DocumentTypes,
  type EngineMessage,
  type EngineState,
  type Id,
  type Library,
  type OperatorSnapshot,
  type RenderState,
  type Service,
  type ServiceItem,
  type Song,
  type SongEdit,
} from '@openstage/shared'
import { buildDecks } from './decks'
import { applySongEdit } from './edits'
import { outputs, resolveRender, type OutputId } from './resolve'
import { initialState, reduce, sanitize } from './state'
import { DocumentHistory } from './store/history'
import type { LibrarySearch } from './store/library-index'

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
  index?: LibrarySearch
  library: Library
  restored?: EngineState | null
  serviceId?: Id | null
  onItemLive?: (item: ServiceItem, service: Service) => void
  onStateChange?: (state: EngineState) => void
  onDocumentChange?: <K extends DocumentKind>(kind: K, document: DocumentTypes[K]) => void
}

const noService: Service = { id: '', name: 'No service', items: [] }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/**
 * Owns all live state. The operator window, outputs and (later) remotes are clients:
 * they send commands and receive resolved state, so any of them can reload without losing the show.
 */
export class Engine {
  private decks: Deck[]
  private library: Library
  private state: EngineState
  private readonly options: EngineOptions
  private readonly clients = new Set<Client>()
  private readonly channels = new Map<OutputId, OutputChannel>()
  private readonly histories = new Map<Id, DocumentHistory<Song, SongEdit>>()

  constructor(options: EngineOptions) {
    this.options = options
    this.library = options.library
    const services = Object.values(options.library.services).sort(byName)
    const serviceId = options.restored?.serviceId ?? lookup(options.library.services, options.serviceId)?.id ?? services[0]?.id ?? null
    this.decks = buildDecks(lookup(this.library.services, serviceId) ?? noService, this.library)
    const background = Object.values(options.library.backgrounds).sort(byName)[0]?.id ?? null
    this.state = options.restored ?? initialState(this.decks, background, serviceId)
    this.resolveOutputs()
  }

  get current(): EngineState {
    return this.state
  }

  get service(): Service {
    return lookup(this.library.services, this.state.serviceId) ?? noService
  }

  get documents(): Library {
    return this.library
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
    switch (command.type) {
      case 'song.edit':
        return this.editSong(command.songId, (history) => history.execute(command.edit))
      case 'document.undo':
        if (command.ref?.kind === 'songs') this.editSong(command.ref.id, (history) => history.undo())
        return
      case 'document.redo':
        if (command.ref?.kind === 'songs') this.editSong(command.ref.id, (history) => history.redo())
        return
    }
    const next = reduce(this.state, command, this.decks)
    if (next === this.state) return
    const previousItemId = this.state.live.slide?.itemId
    this.setState(next)
    const item = this.service.items.find((i) => i.id === next.live.slide?.itemId)
    if (item && item.id !== previousItemId) this.options.onItemLive?.(item, this.service)
    this.publish()
  }

  snapshot(): OperatorSnapshot {
    const projector = outputs[0]
    return {
      state: this.state,
      decks: this.decks,
      service: this.service,
      library: {
        audioCues: Object.values(this.library.audioCues).sort(byName),
        backgrounds: Object.values(this.library.backgrounds).sort(byName),
        lowerThirds: Object.values(this.library.lowerThirds).sort((a, b) => a.title.localeCompare(b.title)),
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
    } else if (message?.type === 'query' && client.hello.role === 'operator' && typeof message.requestId === 'number') {
      const { text, kind, limit } = message.query ?? {}
      const hits = typeof text === 'string' && this.options.index ? this.options.index.search(text, { kind, limit }) : []
      client.port.send({ type: 'result', requestId: message.requestId, hits })
    } else if (message?.type === 'ack' && client.hello.outputId) {
      const channel = this.channels.get(client.hello.outputId as OutputId)
      if (!channel || typeof message.seq !== 'number') return
      channel.ackedSeq = Math.max(channel.ackedSeq, Math.min(message.seq, channel.render.seq))
      this.sendSnapshots()
    }
  }

  private editSong(songId: Id, change: (history: DocumentHistory<Song, SongEdit>) => boolean): void {
    let history = this.histories.get(songId)
    if (!history) {
      const song = lookup(this.library.songs, songId)
      if (!song) return
      history = new DocumentHistory(song, applySongEdit)
      this.histories.set(songId, history)
    }
    if (!change(history)) return
    const song = history.document
    this.library = { ...this.library, songs: { ...this.library.songs, [songId]: song } }
    this.options.onDocumentChange?.('songs', song)
    this.decks = buildDecks(this.service, this.library)
    const next = sanitize(this.state, this.decks, this.library)
    if (JSON.stringify(next) !== JSON.stringify(this.state)) this.setState(next)
    this.publish()
  }

  private setState(next: EngineState): void {
    this.state = next
    this.options.onStateChange?.(next)
  }

  private publish(): void {
    for (const id of this.resolveOutputs()) this.sendRender(id)
    this.sendSnapshots()
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
