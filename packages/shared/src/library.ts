import type { BackgroundRender } from './render'
import type { PassageRef } from './scripture'
import type { Theme } from './themes'

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
  /** Overrides the service's theme for this song; left out, the song follows the service. */
  themeId?: Id
  sections: Record<Id, Section>
  arrangements: Arrangement[]
}

/** A passage set: a reference and how to show it. The words always come from the installed Bibles. */
export interface ScripturePassage {
  id: Id
  ref: PassageRef
  splitLong: boolean
  /** Bible codes in display order: the first fills the main box, the second the second-language box. */
  translations: string[]
  versesPerSlide: number
}

/** What every service item can carry, whatever it shows. */
export interface ItemBase {
  id: Id
  notes?: string
  /** Planned length; the timeline falls back to the kind's usual length. */
  minutes?: number
  themeId?: Id
  /** Drawn in place of the theme's own fill while this item's slides show. */
  backgroundId?: Id
  /** The template slot this item came from. */
  slotId?: Id
  /** True while the item still follows its template slot; any edit to the item clears it. */
  isLinked?: boolean
}

export type ServiceItem = ItemBase &
  (
    | { type: 'song'; songId: Id; arrangementId: Id; languages?: string[] }
    | { type: 'scripture'; passageId: Id }
    /** A part of the service with no slides of its own yet: sermon, announcements, prayer. */
    | { type: 'heading'; kind: HeadingKind; title: string }
    /** A template placeholder still waiting for its song or passage. */
    | { type: 'slot'; kind: 'song' | 'scripture'; title: string; rule: string }
  )

export interface ServiceTeam {
  stage?: string
  operator?: string
}

export interface Service {
  id: Id
  name: string
  /** Local calendar date, `YYYY-MM-DD`. */
  date?: string
  /** Local start time, `HH:MM`. */
  time?: string
  team?: ServiceTeam
  themeId?: Id
  templateId?: Id
  /** Bible codes new passages in this service start with, in display order. */
  translations?: string[]
  items: ServiceItem[]
}

export interface TemplateSlot {
  id: Id
  kind: ItemKind
  title: string
  /** What to put here, in words: "Pick: not used in the last 3 weeks". */
  rule: string
  minutes: number
  /** Fixed content that every service from this template starts with. */
  songId?: Id
  passageId?: Id
}

export interface ServiceTemplate {
  id: Id
  name: string
  color: string
  /** Default start time for services made from it, `HH:MM`. */
  time?: string
  themeId?: Id
  translations?: string[]
  slots: TemplateSlot[]
}

/** Declaration order is the order item kinds are offered in. `minutes` is the usual length when none is planned. */
export const itemKinds = [
  { key: 'song', label: 'Song', badge: 'SG', minutes: 5 },
  { key: 'scripture', label: 'Scripture', badge: 'BK', minutes: 4 },
  { key: 'welcome', label: 'Welcome', badge: 'WL', minutes: 5 },
  { key: 'announcements', label: 'Announcements', badge: 'AN', minutes: 6 },
  { key: 'prayer', label: 'Prayer', badge: 'PR', minutes: 5 },
  { key: 'offering', label: 'Offering', badge: 'OF', minutes: 5 },
  { key: 'sermon', label: 'Sermon', badge: 'SM', minutes: 30 },
  { key: 'benediction', label: 'Benediction', badge: 'BN', minutes: 2 },
  { key: 'other', label: 'Other', badge: 'IT', minutes: 5 },
] as const

export type ItemKind = (typeof itemKinds)[number]['key']
export type HeadingKind = Exclude<ItemKind, 'song' | 'scripture'>

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
  themes: Theme
  templates: ServiceTemplate
}

export type DocumentKind = keyof DocumentTypes

export const documentKinds = {
  songs: { label: 'Songs' },
  passages: { label: 'Scripture passages' },
  services: { label: 'Services' },
  backgrounds: { label: 'Backgrounds' },
  lowerThirds: { label: 'Lower thirds' },
  audioCues: { label: 'Audio cues' },
  themes: { label: 'Themes' },
  templates: { label: 'Service templates' },
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
  kind: ItemKind
  /** The item's notes, shown on the stage screen. */
  notes: string
  minutes: number
  /** The song's key, for the stage screen. */
  musicalKey: string
  /** A template placeholder or heading: in the order and the timeline, but nothing to show yet. */
  isPlaceholder: boolean
  /** The song's theme, else the service's; may point nowhere, and then the classic theme is used. */
  themeId: Id | null
  /** The item's own background; may point nowhere, and then the theme's fill is used. */
  backgroundId: Id | null
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
