import type { BackgroundRender } from './render'

export type Id = string

export const sectionKinds = [
  { key: 'intro', label: 'Intro', color: '#8A8A92' },
  { key: 'verse', label: 'Verse', color: '#5C9CFF' },
  { key: 'preChorus', label: 'Pre-chorus', color: '#4FC1C9' },
  { key: 'chorus', label: 'Chorus', color: '#F2A93B' },
  { key: 'bridge', label: 'Bridge', color: '#E88AC2' },
  { key: 'tag', label: 'Tag', color: '#7BD88F' },
  { key: 'outro', label: 'Ending', color: '#C481FF' },
  { key: 'scripture', label: 'Scripture', color: '#F7C978' },
  { key: 'other', label: 'Other', color: '#A1A1A8' },
] as const

export type SectionKind = (typeof sectionKinds)[number]['key']

export interface SlideContent {
  lines: string[]
  notes?: string
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
  meta: { authors: string[]; copyright: string }
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

export interface Library {
  songs: Record<Id, Song>
  passages: Record<Id, ScripturePassage>
  backgrounds: Background[]
  lowerThirds: LowerThird[]
  audioCues: AudioCue[]
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
