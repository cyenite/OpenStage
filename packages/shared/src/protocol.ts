import type { BackgroundRender } from './render'
import type { BibleInfo, PassageRef } from './scripture'
import type { ServiceReadiness } from './services'
import type { StageLayoutKey, StageState } from './stage'
import type { BoxPatch, Theme, ThemeBoxRole } from './themes'
import type { AudioCue, Background, Deck, DeckSlide, DocumentKind, DocumentRef, DocumentTypes, HeadingKind, Id, LowerThird, SectionKind, Service, ServiceTeam, ServiceTemplate, Song, TemplateSlot } from './library'
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

/** When the live item and the service went live, for the timeline; epoch milliseconds. */
export interface Timing {
  itemId: Id | null
  itemStartedAt: number | null
  serviceStartedAt: number | null
}

export interface EngineState {
  stage: StageState
  serviceId: Id | null
  timing: Timing
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
  /** Locks the operator window to volunteer controls; a PIN must be given the first time, to set it. */
  | { type: 'volunteer.lock'; pin?: string }
  /** Only while unlocked. */
  | { type: 'volunteer.setPin'; pin: string }
  /** Runs the service off-air: the screens keep what they showed, and stopping puts everything back. */
  | { type: 'rehearsal.start' }
  | { type: 'rehearsal.stop' }
  | { type: 'stage.layout'; layout: StageLayoutKey }
  /** Null clears the message. */
  | { type: 'stage.message'; text: string | null }
  | { type: 'stage.timer'; action: 'start' | 'pause' | 'reset' }
  /** Sets a new countdown, paused at its full length. */
  | { type: 'stage.timerSet'; label: string; minutes: number }
  | { type: 'song.create'; songId: Id; title: string; lyrics: string; language: string }
  | { type: 'song.delete'; songId: Id }
  | { type: 'song.edit'; songId: Id; edit: SongEdit }
  | { type: 'service.edit'; serviceId: Id; edit: ServiceEdit }
  /** Starts from a copy of `fromThemeId` when given, else from the classic theme. */
  /** Builds the items from the template when one is given. */
  | { type: 'service.create'; serviceId: Id; name: string; date: string; time: string; templateId?: Id }
  | { type: 'service.open'; serviceId: Id }
  /** Refused for the open service. */
  | { type: 'service.delete'; serviceId: Id }
  | { type: 'template.create'; templateId: Id; name: string; fromTemplateId?: Id }
  | { type: 'template.delete'; templateId: Id }
  | { type: 'template.edit'; templateId: Id; edit: TemplateEdit }
  | { type: 'theme.create'; themeId: Id; name: string; fromThemeId?: Id }
  | { type: 'theme.delete'; themeId: Id }
  | { type: 'theme.edit'; themeId: Id; edit: ThemeEdit }
  | { type: 'passage.create'; passageId: Id; ref: PassageRef; translations: string[] }
  | { type: 'passage.delete'; passageId: Id }
  | { type: 'passage.edit'; passageId: Id; edit: PassageEdit }
  /**
   * Quick verse: makes a passage from typed text in the service's translations, puts it in the
   * service after the selected item and previews its first slide.
   */
  | { type: 'scripture.quick'; text: string; itemId: Id; passageId: Id }
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
  /** Null makes the song follow the service's theme again. */
  | { type: 'song.setTheme'; themeId: Id | null }

export type ServiceEdit =
  /** The engine fills in the song's first arrangement when `arrangementId` is left out. */
  | { type: 'service.addSong'; itemId: Id; songId: Id; arrangementId?: Id; afterItemId?: Id }
  | { type: 'service.removeItem'; itemId: Id }
  | { type: 'service.setTheme'; themeId: Id }
  | { type: 'service.addPassage'; itemId: Id; passageId: Id; afterItemId?: Id }
  | { type: 'service.setTranslations'; translations: string[] }
  | { type: 'service.setDetails'; name?: string; date?: string; time?: string }
  | { type: 'service.setTeam'; team: ServiceTeam }
  | { type: 'service.moveItem'; itemId: Id; toIndex: number }
  | { type: 'service.addHeading'; itemId: Id; kind: HeadingKind; title: string; afterItemId?: Id }
  | { type: 'service.updateItem'; itemId: Id; changes: ItemChanges }
  /** Puts a song or passage in a template placeholder; the engine fills in the song's first arrangement. */
  | { type: 'service.fillSlot'; itemId: Id; songId?: Id; passageId?: Id; arrangementId?: Id }
  /** One background for several items at once, as one undo step; null puts them back on their theme's fill. */
  | { type: 'service.setBackground'; itemIds: Id[]; backgroundId: Id | null }

/** Null clears an override. */
export interface ItemChanges {
  notes?: string
  title?: string
  minutes?: number | null
  themeId?: Id | null
  backgroundId?: Id | null
  languages?: string[] | null
  arrangementId?: Id
}

export type TemplateEdit =
  | { type: 'template.setDetails'; name?: string; color?: string; time?: string }
  | { type: 'template.addSlot'; slot: TemplateSlot; afterSlotId?: Id }
  | { type: 'template.updateSlot'; slotId: Id; changes: Partial<Omit<TemplateSlot, 'id'>> }
  | { type: 'template.removeSlot'; slotId: Id }
  | { type: 'template.moveSlot'; slotId: Id; toIndex: number }

export type PassageEdit =
  | { type: 'passage.setRef'; ref: PassageRef }
  | { type: 'passage.setTranslations'; translations: string[] }
  | { type: 'passage.setVersesPerSlide'; versesPerSlide: number }
  | { type: 'passage.setSplitLong'; splitLong: boolean }

export type ThemeEdit =
  | { type: 'theme.setName'; name: string }
  | { type: 'theme.setFill'; fill: BackgroundRender | null }
  | { type: 'theme.setBox'; role: ThemeBoxRole; style: BoxPatch }

export type EditableKind = 'songs' | 'services' | 'themes' | 'passages' | 'templates'

export type LibraryQuery =
  | { type: 'library.search'; text: string; kind?: DocumentKind; limit?: number }
  | { type: 'library.list'; kind: DocumentKind }
  | { type: 'scripture.slides'; passageId: Id }
  | { type: 'song.outlines'; songIds: Id[] }
  | { type: 'volunteer.unlock'; pin: string }
  /** Reads dropped or picked files and says what importing them would do; nothing is saved yet. */
  | { type: 'import.preview'; files: ImportFile[] }
  /** Carries out a preview with the operator's choices and reports what happened. */
  | { type: 'import.apply'; importId: Id; decisions: Record<string, ImportDecision>; bibles: Record<string, BibleInfo> }

export interface ImportFile {
  name: string
  data: ArrayBuffer
}

/** Add a new item, merge into the matching song (its lyrics stay; empty details are filled), keep both, or skip. */
export type ImportDecision = 'add' | 'merge' | 'keepBoth' | 'skip'

export type ImportStatus = 'new' | 'duplicate' | 'unreadable'

export interface ImportItem {
  key: string
  file: string
  kind: 'song' | 'bible'
  /** The format it was read as, like "OpenLyrics" or "ChordPro". */
  format: string
  title: string
  status: ImportStatus
  /** Why it is a duplicate, why it could not be read, or a caution about the format. */
  reason: string
  /** First lines of each section, for Compare. */
  preview: string[]
  /** Set for duplicates. */
  existing?: { id: Id; title: string; preview: string[] }
  /** Set for Bibles: what the file says about itself, for the operator to confirm. */
  bible?: BibleInfo & { books: number; verses: number }
}

export interface ImportPlan {
  importId: Id
  items: ImportItem[]
}

export interface ImportReport {
  added: string[]
  merged: string[]
  skipped: string[]
  failed: { title: string; reason: string }[]
}
/** Just enough of a song to offer its arrangements and languages as service-item overrides. */
export interface SongOutline {
  id: Id
  title: string
  languages: string[]
  arrangements: { id: Id; name: string }[]
}

export type QueryResult =
  | { type: 'hits'; hits: SearchHit[] }
  | { type: 'slides'; slides: DeckSlide[] }
  | { type: 'outlines'; outlines: SongOutline[] }
  | { type: 'importPlan'; plan: ImportPlan }
  | { type: 'importReport'; report: ImportReport }
  /** `waitSeconds` is set after too many wrong PINs. */
  | { type: 'unlock'; isUnlocked: boolean; waitSeconds: number }

export interface SearchHit {
  kind: DocumentKind
  id: Id
  title: string
  /** A second line for lists: authors for a song, translations for a passage. */
  detail: string
  /** Matched terms are wrapped in \u0001 and \u0002 so the UI can highlight them. */
  snippet: string
}

/** Commands a locked operator window may still send: presenting, clearing and rehearsing, nothing that changes the library. */
export const volunteerCommands = new Set<Command['type']>([
  'item.select',
  'preview.set',
  'live.take',
  'live.next',
  'live.previous',
  'layer.clear',
  'layer.clearAll',
  'rehearsal.start',
  'rehearsal.stop',
  'volunteer.lock',
])

export interface ServiceSummary {
  id: Id
  name: string
  date: string | null
  time: string | null
  team: ServiceTeam
  items: number
  minutes: number
  readiness: ServiceReadiness
  templateId: Id | null
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
  library: { themes: Theme[]; templates: ServiceTemplate[]; backgrounds: Background[]; lowerThirds: LowerThird[]; audioCues: AudioCue[] }
  bibles: BibleInfo[]
  mode: { isLocked: boolean; hasPin: boolean; isRehearsing: boolean }
  /** Every service, for the calendar, ordered by date and time. */
  services: ServiceSummary[]
  /** How many songs and services point at each theme, so the UI can say why one cannot be deleted. */
  themeUses: Record<Id, number>
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
  | { type: 'result'; requestId: number; result: QueryResult }
  | { type: 'document'; ref: DocumentRef; document: DocumentTypes[DocumentKind] | null; canUndo: boolean; canRedo: boolean }

/** Sent by the Electron main process to the engine with a MessagePort attached. */
export interface EngineConnect {
  type: 'connect'
  hello: ClientHello
}
