import { useEffect, useState } from 'react'
import {
  bibleBooks,
  bookById,
  bookName,
  formatReference,
  instantId,
  parseReference,
  type BookId,
  type ChapterView,
  type InstantSource,
  type OperatorSnapshot,
  type PassageRef,
  type SlideRef,
} from '@openstage/shared'
import { dispatch, useChapter } from '../engine'
import { applyResult, type AddTarget } from './results'
import { useStoredState } from './useStoredState'

interface BibleTabProps {
  snapshot: OperatorSnapshot
  target: AddTarget
  onManage: () => void
}

interface BiblePlace {
  main: string
  second: string
  book: BookId
  chapter: number
}

interface VerseRange {
  from: number
  to: number
}

const isPlace = (value: unknown): value is BiblePlace => {
  const place = value as Partial<BiblePlace> | null
  return !!place && typeof place.main === 'string' && typeof place.second === 'string' && !!bookById(String(place.book)) && Number.isInteger(place.chapter)
}

/** Scrolls only the list, never the page around it, so the current book is in view. */
function revealInList(element: HTMLElement | null) {
  const list = element?.closest('ul')
  if (!element || !list) return
  const top = element.offsetTop - list.offsetTop
  if (top < list.scrollTop || top + element.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 2
}

/** The verse a slide of the chapter deck starts in: long verses span several slides. */
function verseAt(chapter: ChapterView, index: number): number | null {
  let found: number | null = null
  for (const verse of chapter.verses) if (verse.slideIndex <= index) found = verse.verse
  return found
}

/** A Bible reader in Present: pick a version, book and chapter, then click a verse for Preview or double-click for Live. */
export function BibleTab({ snapshot, target, onManage }: BibleTabProps) {
  const [place, setPlace] = useStoredState<BiblePlace>('openstage.bible', { main: '', second: '', book: 'JHN', chapter: 3 }, isPlace)
  const [range, setRange] = useState<VerseRange | null>(null)
  const [reference, setReference] = useState('')
  const [pending, setPending] = useState<{ verse: number; isLive: boolean } | null>(null)
  const codes = snapshot.bibles.map((b) => b.code)
  const main = codes.includes(place.main) ? place.main : snapshot.service.translations?.find((c) => codes.includes(c)) ?? codes[0] ?? ''
  const second = place.second !== main && codes.includes(place.second) ? place.second : ''
  const translations = [main, second].filter(Boolean)
  const chapter = useChapter(place.book, place.chapter, translations, snapshot.libraryRevision)
  const language = snapshot.bibles.find((b) => b.code === main)?.language ?? 'en'
  const book = bookById(place.book)!
  const isCurrent = !!chapter && chapter.source.ref.book === place.book && chapter.source.ref.startChapter === place.chapter
  const chapterCount = isCurrent ? chapter.chapterCount : book.chapters
  const { state } = snapshot

  const move = (change: Partial<BiblePlace>) => {
    setPlace({ ...place, main, second, ...change })
    setRange(null)
  }
  const rangeRef = (r: VerseRange): PassageRef => ({ book: place.book, startChapter: place.chapter, startVerse: r.from, endChapter: place.chapter, endVerse: r.to })
  const rangeSource = (r: VerseRange): InstantSource => ({ type: 'scripture', ref: rangeRef(r), translations, versesPerSlide: Math.min(6, r.to - r.from + 1) })
  const showVerse = (verse: number, isLive: boolean) => {
    const row = isCurrent ? chapter.verses.find((v) => v.verse === verse) : undefined
    if (!row) return
    setRange({ from: verse, to: verse })
    dispatch({ type: 'instant.show', source: chapter!.source, index: row.slideIndex, isLive })
  }
  const showRange = (r: VerseRange, isLive: boolean) => {
    if (r.from === r.to) return showVerse(r.from, isLive)
    setRange(r)
    dispatch({ type: 'instant.show', source: rangeSource(r), index: 0, isLive })
  }

  // A typed reference to a single verse waits for its chapter to arrive before it can be shown.
  useEffect(() => {
    if (!pending || !isCurrent) return
    showVerse(pending.verse, pending.isLive)
    setPending(null)
  }, [pending, isCurrent, chapter])

  const chapterId = isCurrent ? instantId(chapter.source) : null
  const rangeId = range && range.from !== range.to ? instantId(rangeSource(range)) : null
  const shown = (ref: SlideRef | null): VerseRange | null => {
    if (!ref) return null
    if (ref.itemId === rangeId) return range
    if (ref.itemId !== chapterId) return null
    const verse = verseAt(chapter!, ref.index)
    return verse === null ? null : { from: verse, to: verse }
  }
  const previewShown = shown(state.preview)
  const liveShown = shown(state.live.slide)
  const isIn = (verse: number, r: VerseRange | null) => !!r && verse >= r.from && verse <= r.to

  const parsed = reference.trim() ? parseReference(reference) : null
  const goTo = (isLive: boolean) => {
    if (!parsed?.ok) return
    const { ref } = parsed
    move({ book: ref.book, chapter: ref.startChapter })
    setReference('')
    if (ref.startVerse === null) return
    const isRange = ref.endChapter === ref.startChapter && ref.endVerse !== null && ref.endVerse > ref.startVerse
    if (isRange) {
      const r = { from: ref.startVerse, to: ref.endVerse! }
      setRange(r)
      dispatch({ type: 'instant.show', source: { type: 'scripture', ref: { ...ref, endChapter: ref.startChapter }, translations, versesPerSlide: Math.min(6, r.to - r.from + 1) }, index: 0, isLive })
    } else {
      setPending({ verse: ref.startVerse, isLive })
    }
  }

  if (codes.length === 0) {
    return (
      <div className="library-tab library-empty-tab">
        <p className="muted">No Bible is installed on this computer.</p>
        <button className="button-primary" onClick={onManage}>
          Get Bible versions
        </button>
      </div>
    )
  }

  const title = range ? formatReference(rangeRef(range), language) : ''
  return (
    <div className="library-tab bible-tab">
      <div className="library-browser">
        <div className="bible-versions">
          <label>
            <span>Version</span>
            <select aria-label="Bible version" value={main} onChange={(e) => move({ main: e.target.value })}>
              {snapshot.bibles.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Side by side</span>
            <select aria-label="Second Bible version" value={second} onChange={(e) => move({ second: e.target.value })}>
              <option value="">None</option>
              {snapshot.bibles
                .filter((b) => b.code !== main)
                .map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} · {b.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <button className="link-button" onClick={onManage}>
          Manage versions · get more…
        </button>
        <label className={`library-search${parsed && !parsed.ok ? ' is-invalid' : ''}`}>
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19V5" /></svg>
          <input
            type="text"
            value={reference}
            aria-label="Go to reference"
            placeholder="Reference: ps 23 4, jn 3 16-18"
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setReference('')
              if (e.key !== 'Enter') return
              e.preventDefault()
              goTo(e.shiftKey)
            }}
          />
        </label>
        {parsed && <span className={`reference-hint${parsed.ok ? ' is-ok' : ''}`}>{parsed.ok ? `${formatReference(parsed.ref, language)} · Enter to preview, Shift Enter to go live` : parsed.error}</span>}
        <div className="bible-pickers">
          <ul className="browser-list" aria-label="Books">
            {bibleBooks.map((b) => (
              <li key={b.usfm}>
                <button
                  ref={b.usfm === place.book ? revealInList : undefined}
                  className={`browser-row is-compact${b.usfm === place.book ? ' is-selected' : ''}`}
                  aria-current={b.usfm === place.book ? 'true' : undefined}
                  onClick={() => move({ book: b.usfm, chapter: 1 })}
                >
                  {bookName(b.usfm, language)}
                </button>
              </li>
            ))}
          </ul>
          <div className="chapter-grid" aria-label="Chapters">
            {Array.from({ length: chapterCount }, (_, i) => i + 1).map((n) => (
              <button key={n} className={n === place.chapter ? 'is-selected' : undefined} aria-label={`Chapter ${n}`} aria-current={n === place.chapter ? 'true' : undefined} onClick={() => move({ chapter: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="library-detail">
        <div className="library-detail-head">
          <strong>
            {bookName(place.book, language)} {place.chapter}
          </strong>
          <span className="muted">{translations.join(' with ')} · click to preview · double-click to go live · Shift-click a range</span>
          {range && (
            <span className="library-detail-actions">
              <button
                className="button-quiet button-small"
                onClick={() => applyResult({ filter: 'scripture', key: title, ref: rangeRef(range), text: title, title, detail: '', snippet: '', translations }, target)}
              >
                + Add {title} to schedule
              </button>
            </span>
          )}
        </div>
        <ol className="verse-list" aria-label="Verses">
          {isCurrent &&
            chapter.verses.map((v) => {
              const isLive = isIn(v.verse, liveShown)
              const isPreview = !isLive && isIn(v.verse, previewShown)
              return (
                <li key={v.verse}>
                  <button
                    className={`verse-item${isLive ? ' is-live' : isPreview ? ' is-preview' : ''}${second ? ' has-second' : ''}`}
                    aria-label={`Verse ${v.verse}`}
                    aria-pressed={isIn(v.verse, range)}
                    onClick={(e) => (e.shiftKey && range ? showRange({ from: Math.min(range.from, v.verse), to: Math.max(range.from, v.verse) }, false) : showVerse(v.verse, false))}
                    onDoubleClick={() => showVerse(v.verse, true)}
                  >
                    <span className="verse-number">{v.verse}</span>
                    <span className="verse-text">{v.main || <em className="muted">Not in {main}</em>}</span>
                    {second && <span className="verse-second">{v.secondary}</span>}
                    <span className="verse-tag">{isLive ? 'LIVE' : isPreview ? 'PREVIEW' : ''}</span>
                  </button>
                </li>
              )
            })}
          {isCurrent && chapter.verses.length === 0 && <li className="library-empty muted">{main} has no text for this chapter.</li>}
          {!isCurrent && <li className="library-empty muted">Opening…</li>}
        </ol>
      </div>
    </div>
  )
}
