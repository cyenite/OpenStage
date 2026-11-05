import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '@openstage/shared'
import { useLibraryQuery } from '../engine'
import { LibraryTabs, type EditLibrary } from './LibraryTabs'

interface SongLibraryProps {
  revision: number
  selectedId: string | null
  searchRequest: number
  serviceSongIds: Set<string>
  onNew: () => void
  onSelect: (songId: string) => void
  onLibrary: (library: EditLibrary) => void
}

export function SongLibrary({ revision, selectedId, searchRequest, serviceSongIds, onNew, onSelect, onLibrary }: SongLibraryProps) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const all = useLibraryQuery({ type: 'library.list', kind: 'songs' }, revision)
  const found = useLibraryQuery({ type: 'library.search', text, kind: 'songs', limit: 100 }, revision)
  const hits = text.trim() ? found : all

  useEffect(() => {
    if (searchRequest > 0) input.current?.focus()
  }, [searchRequest])

  return (
    <nav className="sidebar song-library" aria-label="Song library">
      <div className="sidebar-head">
        <LibraryTabs library="songs" onLibrary={onLibrary} />
        <button className="button-small" onClick={onNew}>
          New song
        </button>
      </div>
      <div className="search-field">
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          ref={input}
          type="search"
          value={text}
          aria-label="Search songs or lyrics"
          placeholder={`Search ${all.length} ${all.length === 1 ? 'song' : 'songs'} or lyrics`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) onSelect(hits[0].id)
            if (e.key === 'Escape') setText('')
          }}
        />
      </div>
      <ul className="song-list">
        {hits.map((hit) => (
          <li key={hit.id}>
            <SongRow hit={hit} isSelected={hit.id === selectedId} isInService={serviceSongIds.has(hit.id)} onSelect={() => onSelect(hit.id)} />
          </li>
        ))}
        {text.trim() && hits.length === 0 && <li className="song-list-empty">No song matches “{text.trim()}”.</li>}
      </ul>
    </nav>
  )
}

interface SongRowProps {
  hit: SearchHit
  isSelected: boolean
  isInService: boolean
  onSelect: () => void
}

function SongRow({ hit, isSelected, isInService, onSelect }: SongRowProps) {
  const detail = [hit.detail, isInService ? 'in this service' : ''].filter(Boolean).join(' · ')
  return (
    <button className={`song-row${isSelected ? ' is-selected' : ''}`} aria-current={isSelected ? 'true' : undefined} onClick={onSelect}>
      <span className="song-row-title">{hit.title}</span>
      {detail && <span className="song-row-detail">{detail}</span>}
      {hit.snippet && <Snippet text={hit.snippet} />}
    </button>
  )
}

function Snippet({ text }: { text: string }) {
  const parts = text.split(/\u0001|\u0002/)
  return (
    <span className="song-row-snippet">
      {parts.map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>))}
    </span>
  )
}
