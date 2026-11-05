import {
  isSafeId,
  lookup,
  type ClientHello,
  type ClientMessage,
  type Command,
  type Deck,
  type DocumentKind,
  type DocumentRef,
  type DocumentTypes,
  type EditableKind,
  type EngineMessage,
  type EngineState,
  type Id,
  type Library,
  type OperatorSnapshot,
  type RenderState,
  type SearchHit,
  type Service,
  type ServiceEdit,
  type ServiceItem,
  type SongEdit,
} from '@openstage/shared'
import { buildDecks } from './decks'
import { applyServiceEdit, applySongEdit, createSong } from './edits'
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
  watching: DocumentRef | null
}

interface Edits {
  songs: SongEdit
  services: ServiceEdit
}

type History = DocumentHistory<DocumentTypes[EditableKind], Edits[EditableKind]>

const appliers: { [K in EditableKind]: (document: DocumentTypes[K], edit: Edits[K]) => DocumentTypes[K] } = {
  songs: applySongEdit,
  services: applyServiceEdit,
}

const isEditable = (kind: unknown): kind is EditableKind => typeof kind === 'string' && Object.hasOwn(appliers, kind)

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
  onDocumentRemove?: (kind: DocumentKind, id: Id) => void
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
  private libraryRevision = 0
  private readonly options: EngineOptions
  private readonly clients = new Set<Client>()
  private readonly histories = new Map<string, History>()
  private readonly channels = new Map<OutputId, OutputChannel>()

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
    const client: Client = { port, hello, watching: null }
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
      case 'song.create':
        return this.createSong(command)
      case 'song.delete':
        return this.deleteSong(command.songId)
      case 'song.edit':
        return this.edit('songs', command.songId, (history) => history.execute(command.edit))
      case 'service.edit':
        return this.edit('services', command.serviceId, (history) => history.execute(this.completeServiceEdit(command.edit)))
      case 'document.undo':
        if (isEditable(command.ref?.kind)) this.edit(command.ref.kind, command.ref.id, (history) => history.undo())
        return
      case 'document.redo':
        if (isEditable(command.ref?.kind)) this.edit(command.ref.kind, command.ref.id, (history) => history.redo())
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
      libraryRevision: this.libraryRevision,
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
      client.port.send({ type: 'result', requestId: message.requestId, hits: this.query(message.query) })
    } else if (message?.type === 'watch' && client.hello.role === 'operator') {
      const ref = message.ref
      client.watching = ref && typeof ref.id === 'string' && typeof ref.kind === 'string' ? { kind: ref.kind, id: ref.id } : null
      if (client.watching) this.sendDocument(client, client.watching)
    } else if (message?.type === 'ack' && client.hello.outputId) {
      const channel = this.channels.get(client.hello.outputId as OutputId)
      if (!channel || typeof message.seq !== 'number') return
      channel.ackedSeq = Math.max(channel.ackedSeq, Math.min(message.seq, channel.render.seq))
      this.sendSnapshots()
    }
  }

  private query(query: Extract<ClientMessage, { type: 'query' }>['query']): SearchHit[] {
    const index = this.options.index
    if (!index || !query) return []
    if (query.type === 'library.list') return index.list(query.kind)
    if (query.type === 'library.search' && typeof query.text === 'string') return index.search(query.text, { kind: query.kind, limit: query.limit })
    return []
  }

  private history(kind: EditableKind, id: Id): History | null {
    const key = `${kind}/${id}`
    let history = this.histories.get(key)
    if (!history) {
      const document = lookup(this.library[kind] as Record<Id, DocumentTypes[EditableKind]>, id)
      if (!document) return null
      history = new DocumentHistory(document, appliers[kind] as (d: DocumentTypes[EditableKind], e: Edits[EditableKind]) => DocumentTypes[EditableKind])
      this.histories.set(key, history)
    }
    return history
  }

  private edit(kind: EditableKind, id: Id, change: (history: History) => boolean): void {
    const history = this.history(kind, id)
    if (history && change(history)) this.store(kind, history.document)
  }

  /** Adds what a service item needs that only the engine knows: the song's first arrangement. */
  private completeServiceEdit(edit: ServiceEdit): ServiceEdit {
    if (edit?.type !== 'service.addSong' || edit.arrangementId) return edit
    const song = lookup(this.library.songs, edit.songId)
    return song?.arrangements[0] ? { ...edit, arrangementId: song.arrangements[0].id } : edit
  }

  private createSong(command: Extract<Command, { type: 'song.create' }>): void {
    if (!isSafeId(command.songId) || Object.hasOwn(this.library.songs, command.songId)) return
    this.store('songs', createSong(command.songId, command.title, command.lyrics, command.language))
  }

  /** Refused while any service still uses the song, so no service is left pointing at nothing. */
  private deleteSong(songId: Id): void {
    if (!Object.hasOwn(this.library.songs, songId) || this.isSongInUse(songId)) return
    const { [songId]: _removed, ...songs } = this.library.songs
    this.library = { ...this.library, songs }
    this.histories.delete(`songs/${songId}`)
    this.options.onDocumentRemove?.('songs', songId)
    this.afterLibraryChange({ kind: 'songs', id: songId })
  }

  isSongInUse(songId: Id): boolean {
    return Object.values(this.library.services).some((service) => service.items.some((i) => i.type === 'song' && i.songId === songId))
  }

  private store<K extends DocumentKind>(kind: K, document: DocumentTypes[K]): void {
    this.library = { ...this.library, [kind]: { ...this.library[kind], [document.id]: document } }
    this.options.onDocumentChange?.(kind, document)
    this.afterLibraryChange({ kind, id: document.id })
  }

  private afterLibraryChange(ref: DocumentRef): void {
    this.libraryRevision++
    this.decks = buildDecks(this.service, this.library)
    const next = sanitize(this.state, this.decks, this.library)
    if (JSON.stringify(next) !== JSON.stringify(this.state)) this.setState(next)
    for (const client of this.clients) {
      if (client.watching?.kind === ref.kind && client.watching.id === ref.id) this.sendDocument(client, ref)
    }
    this.publish()
  }

  private sendDocument(client: Client, ref: DocumentRef): void {
    const records = Object.hasOwn(this.library, ref.kind) ? (this.library[ref.kind] as Record<Id, DocumentTypes[DocumentKind]>) : {}
    const history = isEditable(ref.kind) ? this.histories.get(`${ref.kind}/${ref.id}`) : undefined
    const document = lookup(records, ref.id) ?? null
    client.port.send({ type: 'document', ref, document, canUndo: history?.canUndo ?? false, canRedo: history?.canRedo ?? false })
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
