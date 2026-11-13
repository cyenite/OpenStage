import { useEffect, useRef, useState } from 'react'
import { instantId, type Id, type InstantSource, type OperatorSnapshot } from '@openstage/shared'
import { dispatch, useLibraryQuery } from '../engine'
import { Snippet } from '../edit/SongLibrary'

interface SongsTabProps {
  snapshot: OperatorSnapshot
  focusRequest: number
  onOpenDeck: (deckId: Id) => void
  onGetSongs: () => void
}

/** Every song in the library. Click opens it in the slide grid without showing it; double-click shows its first slide. */
export function SongsTab({ snapshot, focusRequest, onOpenDeck, onGetSongs }: SongsTabProps) {
  const [text, setText] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const revision = snapshot.libraryRevision
  const all = useLibraryQuery({ type: 'library.list', kind: 'songs' }, revision)
  const found = useLibraryQuery({ type: 'library.search', text, kind: 'songs', limit: 100 }, revision)
  const hits = text.trim() ? found : all
  const { state } = snapshot

  useEffect(() => search.current?.focus(), [focusRequest])

  const open = (songId: Id, isLive: boolean) => {
    const source: InstantSource = { type: 'song', songId }
    dispatch({ type: 'instant.show', source, index: 0, isLive })
    onOpenDeck(instantId(source))
  }
  const isOnScreen = (songId: Id) => state.live.slide?.itemId === instantId({ type: 'song', songId })

  return (
    <div className="library-tab songs-tab">
      <div className="library-search-row">
        <label className="library-search">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            ref={search}
            type="search"
            value={text}
            aria-label="Search songs and lyrics"
            placeholder="Title, first line or any lyric · Enter opens the first"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && text) {
                e.stopPropagation()
                setText('')
              }
              if (e.key !== 'Enter' || !hits[0]) return
              open(hits[0].id, e.shiftKey)
            }}
          />
        </label>
        <button className="link-button" onClick={onGetSongs}>
          Get more songs…
        </button>
      </div>
      <ul className="browser-list song-list" aria-label="Songs">
        {hits.map((hit) => (
          <li key={hit.id}>
            <button className="browser-row" onClick={() => open(hit.id, false)} onDoubleClick={() => open(hit.id, true)}>
              <span className="browser-row-title">
                {hit.title}
                {isOnScreen(hit.id) && <strong className="tag-live">LIVE</strong>}
              </span>
              {hit.snippet ? <Snippet text={hit.snippet} className="browser-row-detail" /> : <span className="browser-row-detail">{hit.detail}</span>}
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="library-empty muted">{text.trim() ? `No song matches “${text.trim()}”.` : 'No songs yet.'}</li>}
      </ul>
    </div>
  )
}
