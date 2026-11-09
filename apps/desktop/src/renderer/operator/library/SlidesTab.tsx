import { useEffect, useRef, useState } from 'react'
import { instantId, type Id, type InstantSource, type OperatorSnapshot } from '@openstage/shared'
import { dispatch, useLibraryQuery } from '../engine'

interface SlidesTabProps {
  snapshot: OperatorSnapshot
  focusRequest: number
  onOpenDeck: (deckId: Id) => void
  onEditSlides: (presentationId: Id | null) => void
}

/** Slides decks: click opens one in the slide grid without showing it, double-click shows its first page. */
export function SlidesTab({ snapshot, focusRequest, onOpenDeck, onEditSlides }: SlidesTabProps) {
  const [text, setText] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const revision = snapshot.libraryRevision
  const all = useLibraryQuery({ type: 'library.list', kind: 'presentations' }, revision)
  const found = useLibraryQuery({ type: 'library.search', text, kind: 'presentations', limit: 100 }, revision)
  const hits = text.trim() ? found : all

  useEffect(() => search.current?.focus(), [focusRequest])

  const open = (presentationId: Id, isLive: boolean) => {
    const source: InstantSource = { type: 'presentation', presentationId }
    dispatch({ type: 'instant.show', source, index: 0, isLive })
    onOpenDeck(instantId(source))
  }
  const isOnScreen = (presentationId: Id) => snapshot.state.live.slide?.itemId === instantId({ type: 'presentation', presentationId })

  return (
    <div className="library-tab songs-tab">
      <div className="library-search-row">
        <label className="library-search">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            ref={search}
            type="search"
            value={text}
            aria-label="Search slides"
            placeholder="Title or any words on a page · Enter opens the first"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && text) (e.stopPropagation(), setText(''))
              if (e.key === 'Enter' && hits[0]) open(hits[0].id, e.shiftKey)
            }}
          />
        </label>
        <button className="link-button" onClick={() => onEditSlides(null)}>
          Design new slides…
        </button>
      </div>
      <ul className="browser-list song-list" aria-label="Slides decks">
        {hits.map((hit) => (
          <li key={hit.id} className="browser-row-with-action">
            <button className="browser-row" onClick={() => open(hit.id, false)} onDoubleClick={() => open(hit.id, true)}>
              <span className="browser-row-title">
                {hit.title}
                {isOnScreen(hit.id) && <strong className="tag-live">LIVE</strong>}
              </span>
              <span className="browser-row-detail">{hit.detail}</span>
            </button>
            <button className="button-quiet button-small" aria-label={`Edit ${hit.title}`} onClick={() => onEditSlides(hit.id)}>
              Edit
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="library-empty muted">{text.trim() ? `Nothing matches “${text.trim()}”.` : 'No slides yet.'}</li>}
      </ul>
    </div>
  )
}
