import { useState } from 'react'
import { instantId, type Id, type InstantSource, type OperatorSnapshot } from '@openstage/shared'
import { dispatch, useLibraryQuery, useSongSlides } from '../engine'
import { Snippet } from '../edit/SongLibrary'
import { applyResult, type AddTarget } from './results'

interface SongsTabProps {
  snapshot: OperatorSnapshot
  target: AddTarget
  onEditSong: (songId: Id) => void
  onGetSongs: () => void
}

/** Every song in the library: click a slide for Preview, double-click for Live, without adding the song to the service. */
export function SongsTab({ snapshot, target, onEditSong, onGetSongs }: SongsTabProps) {
  const [text, setText] = useState('')
  const [songId, setSongId] = useState<Id | null>(null)
  const revision = snapshot.libraryRevision
  const all = useLibraryQuery({ type: 'library.list', kind: 'songs' }, revision)
  const found = useLibraryQuery({ type: 'library.search', text, kind: 'songs', limit: 100 }, revision)
  const hits = text.trim() ? found : all
  const chosen = songId ?? hits[0]?.id ?? null
  const slides = useSongSlides(chosen, revision)
  const title = hits.find((h) => h.id === chosen)?.title ?? all.find((h) => h.id === chosen)?.title ?? ''
  const { state } = snapshot

  const sourceOf = (id: Id): InstantSource => ({ type: 'song', songId: id })
  const show = (id: Id, index: number, isLive: boolean) => dispatch({ type: 'instant.show', source: sourceOf(id), index, isLive })
  const deckId = chosen ? instantId(sourceOf(chosen)) : null
  const previewIndex = state.preview?.itemId === deckId ? state.preview.index : -1
  const liveIndex = state.live.slide?.itemId === deckId ? state.live.slide.index : -1

  return (
    <div className="library-tab songs-tab">
      <div className="library-browser">
        <label className="library-search">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            type="search"
            value={text}
            aria-label="Search songs and lyrics"
            placeholder="Title, first line or any lyric"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !hits[0]) return
              setSongId(hits[0].id)
              show(hits[0].id, 0, e.shiftKey)
            }}
          />
        </label>
        <button className="link-button" onClick={onGetSongs}>
          Get more songs…
        </button>
        <ul className="browser-list" aria-label="Songs">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                className={`browser-row${hit.id === chosen ? ' is-selected' : ''}`}
                aria-current={hit.id === chosen ? 'true' : undefined}
                onClick={() => (setSongId(hit.id), show(hit.id, 0, false))}
                onDoubleClick={() => show(hit.id, 0, true)}
              >
                <span className="browser-row-title">{hit.title}</span>
                {hit.snippet ? <Snippet text={hit.snippet} className="browser-row-detail" /> : <span className="browser-row-detail">{hit.detail}</span>}
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="library-empty muted">{text.trim() ? `No song matches “${text.trim()}”.` : 'No songs yet.'}</li>}
        </ul>
      </div>
      <div className="library-detail">
        {chosen && (
          <div className="library-detail-head">
            <strong>{title}</strong>
            <span className="muted">Click a slide to preview · double-click to go live</span>
            <span className="library-detail-actions">
              <button className="button-quiet button-small" onClick={() => onEditSong(chosen)}>
                Edit lyrics
              </button>
              <button className="button-quiet button-small" onClick={() => applyResult({ filter: 'songs', key: chosen, id: chosen, title, detail: '', snippet: '' }, target)}>
                + Add to schedule
              </button>
            </span>
          </div>
        )}
        <div className="library-slides" aria-label="Song slides">
          {slides.map((slide, index) => (
            <button
              key={index}
              className={`library-slide${index === liveIndex ? ' is-live' : index === previewIndex ? ' is-preview' : ''}`}
              aria-label={`${slide.label}, slide ${index + 1}`}
              onClick={() => show(chosen!, index, false)}
              onDoubleClick={() => show(chosen!, index, true)}
            >
              <span className="library-slide-text">{slide.lines.join('\n')}</span>
              <span className="library-slide-label">
                {slide.label}
                {index === liveIndex ? <strong className="tag-live">LIVE</strong> : index === previewIndex ? <strong className="tag-preview">PREVIEW</strong> : <span>{index + 1}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
