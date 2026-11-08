import { bookById, instantId, isSafeId, type EngineState, type Id, type InstantSource, type PassageRef } from '@openstage/shared'

const isCount = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= max

function cleanRef(raw: unknown): PassageRef | null {
  const ref = raw as Partial<PassageRef> | null
  const book = typeof ref?.book === 'string' ? bookById(ref.book) : undefined
  if (!book || !isCount(ref!.startChapter, book.chapters) || !isCount(ref!.endChapter, book.chapters) || ref!.endChapter < ref!.startChapter) return null
  const verse = (v: unknown) => (v === null ? null : isCount(v, 200) ? v : undefined)
  const startVerse = verse(ref!.startVerse)
  const endVerse = verse(ref!.endVerse)
  if (startVerse === undefined || endVerse === undefined) return null
  return { book: book.usfm, startChapter: ref!.startChapter, startVerse, endChapter: ref!.endChapter, endVerse }
}

/** Sources come from clients and from the saved live state, so only well-formed ones get through. */
export function cleanSource(raw: unknown): InstantSource | null {
  const source = raw as Partial<InstantSource> | null
  if (source?.type === 'song') {
    if (!isSafeId(source.songId) || (source.arrangementId !== undefined && !isSafeId(source.arrangementId))) return null
    return { type: 'song', songId: source.songId, ...(source.arrangementId && { arrangementId: source.arrangementId }) }
  }
  if (source?.type === 'scripture') {
    const ref = cleanRef(source.ref)
    const translations = Array.isArray(source.translations) ? source.translations.filter((c): c is string => typeof c === 'string' && /^[A-Za-z0-9-]{1,16}$/.test(c)).slice(0, 2) : []
    if (!ref || translations.length === 0 || !isCount(source.versesPerSlide, 6)) return null
    return { type: 'scripture', ref, translations, versesPerSlide: source.versesPerSlide }
  }
  return null
}

/** Keeps only the sources Preview or Live still point at, so the saved state never grows. */
export function pruneInstant(state: EngineState): EngineState {
  const used = new Set([state.preview?.itemId, state.live.slide?.itemId])
  const entries = Object.entries(state.instant ?? {}).filter(([id]) => used.has(id))
  return entries.length === Object.keys(state.instant ?? {}).length ? state : { ...state, instant: Object.fromEntries(entries) }
}

export function cleanInstant(raw: unknown): Record<Id, InstantSource> {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw).flatMap(([id, value]) => {
      const source = cleanSource(value)
      return source && instantId(source) === id ? [[id, source]] : []
    }),
  )
}
