import type { Chord, TextLine } from '@openstage/shared'
import type { ImportedSection, ImportedSong } from '../types'

interface FreeShowLine {
  text?: { value?: string }[]
  chords?: { pos?: number; key?: string }[]
}

interface FreeShowSlide {
  group?: string | null
  globalGroup?: string
  children?: string[]
  items?: { lines?: FreeShowLine[] }[]
}

interface FreeShowShow {
  name?: string
  meta?: Record<string, string>
  slides?: Record<string, FreeShowSlide>
  layouts?: Record<string, { name?: string; slides?: { id: string }[] }>
  settings?: { activeLayout?: string }
}

/**
 * FreeShow `.show`: JSON `[id, show]`. Slides with a `group` start a section and list their
 * `children`; the active layout gives the order. Chords sit at character positions.
 */
export function freeShow(fileTitle: string, json: string): ImportedSong {
  const parsed = JSON.parse(json) as unknown
  const show = (Array.isArray(parsed) ? parsed[1] : parsed) as FreeShowShow
  if (!show || typeof show !== 'object' || !show.slides) throw new Error('This file has no FreeShow slides')
  const slides = show.slides
  const meta = show.meta ?? {}
  const sections: ImportedSection[] = []
  const labelOf = new Map<string, string>()
  for (const [id, slide] of Object.entries(slides)) {
    if (!slide.group) continue
    const label = uniqueLabel(sections, slide.group)
    labelOf.set(id, label)
    const parts = [slide, ...(slide.children ?? []).map((child) => slides[child]).filter((s): s is FreeShowSlide => !!s)]
    sections.push({ label, slides: parts.map(slideLines).filter((lines) => lines.length > 0) })
  }
  const layout = show.layouts?.[show.settings?.activeLayout ?? ''] ?? Object.values(show.layouts ?? {})[0]
  const order = (layout?.slides ?? []).map((s) => labelOf.get(s.id)).filter((l): l is string => !!l)
  return {
    title: show.name || meta.title || fileTitle,
    authors: [meta.author, meta.artist].filter((a): a is string => !!a),
    copyright: meta.copyright ?? '',
    ...(meta.CCLI && { ccli: meta.CCLI }),
    ...(meta.key && { key: meta.key }),
    languages: ['en'],
    sections,
    order,
  }
}

function slideLines(slide: FreeShowSlide): TextLine[] {
  const item = slide.items?.find((i) => i.lines?.some((l) => l.text?.some((t) => t.value?.trim())))
  return (item?.lines ?? [])
    .map((line) => {
      const text = (line.text ?? []).map((t) => t.value ?? '').join('')
      const chords: Chord[] = (line.chords ?? []).filter((c) => c.key).map((c) => ({ chord: c.key!, offset: Math.min(c.pos ?? 0, text.length) }))
      return { text: text.trim(), chords }
    })
    .filter((line) => line.text || line.chords.length)
}

function uniqueLabel(sections: ImportedSection[], label: string): string {
  if (!sections.some((s) => s.label === label)) return label
  for (let n = 2; ; n++) if (!sections.some((s) => s.label === `${label} ${n}`)) return `${label} ${n}`
}
