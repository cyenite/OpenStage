import type { Deck, Id, Library, Service } from './library'
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
  library: Pick<Library, 'backgrounds' | 'lowerThirds' | 'audioCues'>
  outputs: OutputStatus[]
  liveRender: RenderState
  previewRender: RenderState
}

export type ClientMessage =
  | { type: 'command'; command: Command }
  | { type: 'ack'; seq: number }

export type EngineMessage =
  | { type: 'render'; render: RenderState }
  | { type: 'snapshot'; snapshot: OperatorSnapshot }

/** Sent by the Electron main process to the engine with a MessagePort attached. */
export interface EngineConnect {
  type: 'connect'
  hello: ClientHello
}
