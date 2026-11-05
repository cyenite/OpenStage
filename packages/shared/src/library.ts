import type { BackgroundRender } from './render'

export type Id = string

/** Declaration order is display order. `aliases` are the heading words the lyrics parser recognises, Swahili included. */
export const sectionKinds = [
  { key: 'intro', label: 'Intro', color: '#8A8A92', aliases: ['intro'] },
  { key: 'verse', label: 'Verse', color: '#5C9CFF', aliases: ['verse', 'stanza', 'ubeti'] },
  { key: 'preChorus', label: 'Pre-chorus', color: '#4FC1C9', aliases: ['pre-chorus', 'prechorus', 'pre chorus'] },
  { key: 'chorus', label: 'Chorus', color: '#F2A93B', aliases: ['chorus', 'refrain', 'kiitikio', 'korasi'] },
  { key: 'bridge', label: 'Bridge', color: '#E88AC2', aliases: ['bridge'] },
  { key: 'tag', label: 'Tag', color: '#7BD88F', aliases: ['tag'] },
  { key: 'outro', label: 'Ending', color: '#C481FF', aliases: ['ending', 'outro', 'coda'] },
  { key: 'scripture', label: 'Scripture', color: '#F7C978', aliases: [] },
  { key: 'other', label: 'Other', color: '#A1A1A8', aliases: [] },
] as const satisfies readonly { key: string; label: string; color: string; aliases: readonly string[] }[]

export type SectionKind = (typeof sectionKinds)[number]['key']

export interface Chord {
  chord: string
  /** Character offset into the line's text that the chord sits above. */
  offset: number
}

export interface TextLine {
  text: string
  chords: Chord[]
}

export interface SlideContent {
  lines: TextLine[]
  notes?: string
  /** Lines in other languages, keyed by language code, aligned line for line with `lines`. */
  translations?: Record<string, string[]>
}

export interface Section {
  id: Id
  kind: SectionKind
  label: string
  slides: SlideContent[]
}

export interface Arrangement {
  id: Id
  name: string
  sectionIds: Id[]
}

export interface Song {
  id: Id
  title: string
  /** Language codes; the first is the language of `lines`, the rest are keys of `translations` in display order. */
  languages: string[]
  meta: { authors: string[]; copyright: string; ccli?: string; key?: string; tempo?: number }
  sections: Record<Id, Section>
  arrangements: Arrangement[]
}

export interface ScripturePassage {
  id: Id
  reference: string
  /** Translation codes in display order: the first is the main box, the second the secondary box. */
  translations: string[]
  verses: { number: number; text: Record<string, string> }[]
}

export type ServiceItem =
  | { id: Id; type: 'song'; songId: Id; arrangementId: Id }
  | { id: Id; type: 'scripture'; passageId: Id }

export interface Service {
  id: Id
  name: string
  items: ServiceItem[]
}

export interface Background {
  id: Id
  name: string
  render: BackgroundRender
}

export interface LowerThird {
  id: Id
  title: string
  subtitle: string
}

export interface AudioCue {
  id: Id
  name: string
}

/** Every kind of document the store keeps, one JSON file each. The key is also the folder name on disk. */
export interface DocumentTypes {
  songs: Song
  passages: ScripturePassage
  services: Service
  backgrounds: Background
  lowerThirds: LowerThird
  audioCues: AudioCue
}

export type DocumentKind = keyof DocumentTypes

export const documentKinds = {
  songs: { label: 'Songs' },
  passages: { label: 'Scripture passages' },
  services: { label: 'Services' },
  backgrounds: { label: 'Backgrounds' },
  lowerThirds: { label: 'Lower thirds' },
  audioCues: { label: 'Audio cues' },
} as const satisfies Record<DocumentKind, { label: string }>

export const documentKindKeys = Object.keys(documentKinds) as DocumentKind[]

export interface DocumentRef {
  kind: DocumentKind
  id: Id
}

export type Library = { [K in DocumentKind]: Record<Id, DocumentTypes[K]> }

/** Ids come from files and the wire, so never let one like `__proto__` reach the prototype. */
export function lookup<T>(records: Record<Id, T>, id: Id | null | undefined): T | undefined {
  return id != null && Object.hasOwn(records, id) ? records[id] : undefined
}

/** A service item flattened into the slides an operator steps through. */
export interface Deck {
  itemId: Id
  title: string
  subtitle: string
  slides: DeckSlide[]
}

export interface DeckSlide {
  label: string
  kind: SectionKind
  lines: string[]
  secondaryLines: string[]
  reference: string
}
