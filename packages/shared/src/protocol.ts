import type { AudioCue, Background, Deck, DocumentKind, DocumentRef, Id, LowerThird, Service, Song } from './library'
import type { LayerKey } from './layers'
import type { RenderState } from './render'

export interface SlideRef {
  itemId: Id
  index: number
}

export interface LiveLayers {
  slide: SlideRef | null
  audio: Id | null
  background: Id | null
  lowerThird: Id | null
}

export interface EngineState {
  serviceId: Id | null
  preview: SlideRef | null
  selectedItemId: Id | null
  live: LiveLayers
}

/** Every input (operator keys, remotes, API, timers) ends up as one of these. */
export type Command =
  | { type: 'item.select'; itemId: Id }
  | { type: 'preview.set'; ref: SlideRef }
  | { type: 'live.take' }
  | { type: 'live.next' }
  | { type: 'live.previous' }
  | { type: 'layer.clear'; layer: LayerKey }
  | { type: 'layer.clearAll' }
  | { type: 'background.set'; backgroundId: Id }
  | { type: 'lowerThird.set'; lowerThirdId: Id }
  | { type: 'audio.set'; audioCueId: Id }
  | { type: 'song.edit'; songId: Id; edit: SongEdit }
  | { type: 'document.undo'; ref: DocumentRef }
  | { type: 'document.redo'; ref: DocumentRef }

export type SongEdit =
  | { type: 'song.setTitle'; title: string }
  | { type: 'song.setMeta'; meta: Partial<Song['meta']> }
  | { type: 'song.setSlideLines'; sectionId: Id; index: number; lines: string[] }

export interface LibraryQuery {
  type: 'library.search'
  text: string
  kind?: DocumentKind
  limit?: number
}

export interface SearchHit {
  kind: DocumentKind
  id: Id
  title: string
  /** Matched terms are wrapped in \u0001 and \u0002 so the UI can highlight them. */
  snippet: string
}

export type ClientRole = 'operator' | 'output'

export interface ClientHello {
  role: ClientRole
  outputId?: string
}

export interface OutputStatus {
  id: string
  name: string
  sentSeq: number
  ackedSeq: number
  isConnected: boolean
}

export interface OperatorSnapshot {
  state: EngineState
  decks: Deck[]
  service: Service
  library: { backgrounds: Background[]; lowerThirds: LowerThird[]; audioCues: AudioCue[] }
  outputs: OutputStatus[]
  liveRender: RenderState
  previewRender: RenderState
}

export type ClientMessage =
  | { type: 'command'; command: Command }
  | { type: 'ack'; seq: number }
  | { type: 'query'; requestId: number; query: LibraryQuery }

export type EngineMessage =
  | { type: 'render'; render: RenderState }
  | { type: 'snapshot'; snapshot: OperatorSnapshot }
  | { type: 'result'; requestId: number; hits: SearchHit[] }

/** Sent by the Electron main process to the engine with a MessagePort attached. */
export interface EngineConnect {
  type: 'connect'
  hello: ClientHello
}
