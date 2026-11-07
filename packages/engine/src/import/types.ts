import type { BibleText, TextLine } from '@openstage/shared'

export interface ImportedSection {
  label: string
  /** Slides, each a list of lines in the song's main language. */
  slides: TextLine[][]
  /** Other languages by code, slide for slide. */
  translations?: Record<string, string[][]>
}

/** What every song format is read into before it becomes a Song. */
export interface ImportedSong {
  title: string
  authors: string[]
  copyright: string
  ccli?: string
  key?: string
  tempo?: number
  languages: string[]
  sections: ImportedSection[]
  /** Section labels in the order they are sung; empty means the order of `sections`. */
  order: string[]
}

export type Parsed =
  | { kind: 'song'; file: string; format: string; song: ImportedSong; caution?: string }
  | { kind: 'bible'; file: string; format: string; bible: BibleText; caution?: string }
  | { kind: 'unreadable'; file: string; format: string; reason: string }

export interface SourceFile {
  name: string
  bytes: Uint8Array
}

export function text(file: SourceFile): string {
  const decoded = new TextDecoder('utf-8').decode(file.bytes)
  return decoded.replace(/^﻿/, '')
}

export function baseName(name: string): string {
  return name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
}
