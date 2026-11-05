import type { Song, SongEdit } from '@openstage/shared'

const isText = (value: unknown) => typeof value === 'string'
const isLines = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)

const metaValidators: Record<keyof Song['meta'], (value: unknown) => boolean> = {
  key: isText,
  ccli: isText,
  tempo: (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
  authors: isLines,
  copyright: isText,
}

/** Pure, and returns the same song when an edit changes nothing, so no-ops never reach the undo log. */
export function applySongEdit(song: Song, edit: SongEdit): Song {
  switch (edit.type) {
    case 'song.setTitle': {
      const title = typeof edit.title === 'string' ? edit.title.trim() : ''
      return title && title !== song.title ? { ...song, title } : song
    }
    case 'song.setMeta': {
      const changes = Object.entries(edit.meta ?? {}).filter(
        ([key, value]) =>
          Object.hasOwn(metaValidators, key) &&
          metaValidators[key as keyof Song['meta']](value) &&
          JSON.stringify(song.meta[key as keyof Song['meta']]) !== JSON.stringify(value),
      )
      return changes.length > 0 ? { ...song, meta: { ...song.meta, ...Object.fromEntries(changes) } } : song
    }
    case 'song.setSlideLines': {
      const section = Object.hasOwn(song.sections, edit.sectionId) ? song.sections[edit.sectionId] : undefined
      const slide = section?.slides[edit.index]
      if (!section || !slide || !isLines(edit.lines) || JSON.stringify(slide.lines) === JSON.stringify(edit.lines)) return song
      const slides = section.slides.with(edit.index, { ...slide, lines: edit.lines })
      return { ...song, sections: { ...song.sections, [section.id]: { ...section, slides } } }
    }
    default:
      return song
  }
}
