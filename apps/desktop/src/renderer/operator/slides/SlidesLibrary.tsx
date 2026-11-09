import { useState } from 'react'
import { newId, type Id, type Service } from '@openstage/shared'
import { dispatch, useLibraryQuery } from '../engine'
import { LibraryTabs, type EditLibrary } from '../edit/LibraryTabs'

interface SlidesLibraryProps {
  service: Service
  revision: number
  selectedId: Id | null
  onLibrary: (library: EditLibrary) => void
  onSelect: (presentationId: Id) => void
}

/** Every slides deck, searchable by title and by the words on its pages. */
export function SlidesLibrary({ service, revision, selectedId, onLibrary, onSelect }: SlidesLibraryProps) {
  const [text, setText] = useState('')
  const all = useLibraryQuery({ type: 'library.list', kind: 'presentations' }, revision)
  const found = useLibraryQuery({ type: 'library.search', text, kind: 'presentations', limit: 100 }, revision)
  const hits = text.trim() ? found : all
  const inService = new Set(service.items.flatMap((i) => (i.type === 'presentation' ? [i.presentationId] : [])))
  const create = () => {
    const presentationId = newId('slides')
    dispatch({ type: 'presentation.create', presentationId, title: 'New slides' })
    onSelect(presentationId)
  }
  return (
    <nav className="sidebar slides-library" aria-label="Slides library">
      <div className="sidebar-head">
        <LibraryTabs library="slides" onLibrary={onLibrary} />
      </div>
      <label className="search-field">
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input type="search" value={text} aria-label="Search slides" placeholder="Title or any words on a page" onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="sidebar-actions">
        <button className="button-small" onClick={create}>
          New slides
        </button>
      </div>
      <ul className="song-list" aria-label="Slides decks">
        {hits.map((hit) => (
          <li key={hit.id}>
            <button className={`song-row${hit.id === selectedId ? ' is-selected' : ''}`} aria-current={hit.id === selectedId ? 'true' : undefined} onClick={() => onSelect(hit.id)}>
              <span className="song-row-title">{hit.title}</span>
              <span className="song-row-detail">{[hit.detail, inService.has(hit.id) ? 'in this service' : ''].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="library-empty muted">{text.trim() ? `Nothing matches “${text.trim()}”.` : 'No slides yet.'}</li>}
      </ul>
    </nav>
  )
}
