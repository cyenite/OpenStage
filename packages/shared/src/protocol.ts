import type { AudioCue, Background, Deck, DocumentKind, DocumentRef, DocumentTypes, Id, LowerThird, SectionKind, Service, Song } from './library'
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
  | { type: 'song.create'; songId: Id; title: string; lyrics: string; language: string }
  | { type: 'song.delete'; songId: Id }
  | { type: 'song.edit'; songId: Id; edit: SongEdit }
  | { type: 'service.edit'; serviceId: Id; edit: ServiceEdit }
  | { type: 'document.undo'; ref: DocumentRef }
  | { type: 'document.redo'; ref: DocumentRef }

export type SongEdit =
  | { type: 'song.setTitle'; title: string }
  | { type: 'song.setMeta'; meta: Partial<Song['meta']> }
  | { type: 'song.setLanguages'; languages: string[] }
  | { type: 'song.transpose'; semitones: number }
  /** `language` null edits the main lines with inline chords; a code edits that translation. */
  | { type: 'song.setSectionText'; sectionId: Id; language: string | null; text: string }
  /** Appends the new section to `arrangementId` when given. */
  | { type: 'song.addSection'; sectionId: Id; kind: SectionKind; label: string; arrangementId?: Id }
  | { type: 'song.updateSection'; sectionId: Id; kind: SectionKind; label: string }
  | { type: 'song.removeSection'; sectionId: Id }
  | { type: 'song.setArrangement'; arrangementId: Id; name: string; sectionIds: Id[] }
  | { type: 'song.removeArrangement'; arrangementId: Id }

export type ServiceEdit =
  /** The engine fills in the song's first arrangement when `arrangementId` is left out. */
  | { type: 'service.addSong'; itemId: Id; songId: Id; arrangementId?: Id }
  | { type: 'service.removeItem'; itemId: Id }

export type EditableKind = 'songs' | 'services'

export type LibraryQuery =
  | { type: 'library.search'; text: string; kind?: DocumentKind; limit?: number }
  | { type: 'library.list'; kind: DocumentKind }

export interface SearchHit {
  kind: DocumentKind
  id: Id
  title: string
  /** A second line for lists: authors for a song, translations for a passage. */
  detail: string
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
  /** Bumped on every document change, so library views know to query again. */
  libraryRevision: number
  outputs: OutputStatus[]
  liveRender: RenderState
  previewRender: RenderState
}

export type ClientMessage =
  | { type: 'command'; command: Command }
  | { type: 'ack'; seq: number }
  | { type: 'query'; requestId: number; query: LibraryQuery }
  /** Follow one document: the engine sends it now and after every change. Null stops. */
  | { type: 'watch'; ref: DocumentRef | null }

export type EngineMessage =
  | { type: 'render'; render: RenderState }
  | { type: 'snapshot'; snapshot: OperatorSnapshot }
  | { type: 'result'; requestId: number; hits: SearchHit[] }
  | { type: 'document'; ref: DocumentRef; document: DocumentTypes[DocumentKind] | null; canUndo: boolean; canRedo: boolean }

/** Sent by the Electron main process to the engine with a MessagePort attached. */
export interface EngineConnect {
  type: 'connect'
  hello: ClientHello
}
