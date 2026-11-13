import type { Id } from './library'
import type { InstantSource } from './protocol'

const prefix = 'instant-'

export const isInstantId = (id: Id | null | undefined): boolean => !!id && id.startsWith(prefix)

/**
 * The same source always gets the same id, in the engine and in the operator window alike, so showing
 * it again reuses its deck and the UI can tell which library slide is in Preview or Live.
 */
export function instantId(source: InstantSource): Id {
  const parts =
    source.type === 'song'
      ? [source.type, source.songId, source.arrangementId ?? '']
      : source.type === 'presentation'
        ? [source.type, source.presentationId]
        : [source.type, source.ref.book, source.ref.startChapter, source.ref.startVerse, source.ref.endChapter, source.ref.endVerse, ...source.translations, source.versesPerSlide]
  const text = JSON.stringify(parts)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return `${prefix}${source.type}-${(hash >>> 0).toString(36)}`
}
