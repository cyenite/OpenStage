import { useEffect, useRef, useState } from 'react'
import { songSources, type CatalogSong, type SongLanguage, type SongSourceKey } from '@openstage/shared'
import { ask } from '../engine'
import type { ImportSource } from '../edit/ImportDialog'
import { useStoredState } from './useStoredState'

interface GetSongsProps {
  onImport: (source: ImportSource) => void
  onClose: () => void
}

type Loaded<T> = { items: T[]; error: string | null } | null

const shownAtOnce = 300
const isText = (value: unknown): value is string => typeof value === 'string'
const isYes = (value: unknown): value is boolean => typeof value === 'boolean'

/**
 * Browses an online song catalogue on this computer and hands the chosen songs to the usual import
 * preview, so duplicates are flagged and nothing is overwritten. Songs the catalogue marks as
 * copyrighted need the church's confirmation that it holds a licence.
 */
export function GetSongs({ onImport, onClose }: GetSongsProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [source, setSource] = useState<SongSourceKey>(songSources[0].key)
  const [language, setLanguage] = useStoredState('openstage.songLanguage', 'en', isText)
  const [hasRights, setRights] = useStoredState('openstage.songRights', false, isYes)
  const [languages, setLanguages] = useState<Loaded<SongLanguage>>(null)
  const [songs, setSongs] = useState<Loaded<CatalogSong>>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')
  const [attempt, setAttempt] = useState(0)
  const label = songSources.find((s) => s.key === source)!.label

  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => {
    let isCurrent = true
    setLanguages(null)
    void ask({ type: 'songs.languages', source }).then((result) => {
      if (isCurrent && result.type === 'songLanguages') setLanguages({ items: result.languages, error: result.error })
    })
    return () => {
      isCurrent = false
    }
  }, [source, attempt])
  useEffect(() => {
    let isCurrent = true
    setSongs(null)
    setChosen(new Set())
    void ask({ type: 'songs.catalog', source, language }).then((result) => {
      if (isCurrent && result.type === 'songCatalog') setSongs({ items: result.songs, error: result.error })
    })
    return () => {
      isCurrent = false
    }
  }, [source, language, attempt])

  const needle = filter.trim().toLowerCase()
  const matching = (songs?.items ?? []).filter((s) => !needle || `${s.title} ${s.authors.join(' ')} ${s.firstLine}`.toLowerCase().includes(needle))
  const canChoose = (song: CatalogSong) => hasRights || !song.isRestricted
  const toggle = (id: number) => setChosen((set) => (set.has(id) ? new Set([...set].filter((x) => x !== id)) : new Set([...set, id])))
  const importChosen = () => {
    const songIds = [...chosen]
    onImport({
      label: `${songIds.length} ${songIds.length === 1 ? 'song' : 'songs'} from ${label}`,
      load: async () => {
        const result = await ask({ type: 'songs.preview', source, language, songIds })
        return result.type === 'importPlan' ? result.plan : null
      },
    })
    dialog.current?.close()
  }

  return (
    <dialog ref={dialog} className="dialog get-songs" aria-labelledby="get-songs-title" onClose={onClose}>
      <div className="bible-versions-head">
        <h2 id="get-songs-title">Get songs</h2>
        <span className="muted">Downloaded to this computer, then checked for duplicates before anything is added</span>
        <button className="button-quiet" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
      </div>
      <div className="get-songs-body">
        <div className="catalog-controls get-songs-controls">
          <select aria-label="Song catalogue" value={source} onChange={(e) => setSource(e.target.value as SongSourceKey)}>
            {songSources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} · {s.site}
              </option>
            ))}
          </select>
          <select aria-label="Song language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {!languages?.items.some((l) => l.code === language) && <option value={language}>{language}</option>}
            {languages?.items.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} · {l.count} songs
              </option>
            ))}
          </select>
          <input type="search" aria-label="Search the song catalogue" placeholder="Title, author or first line" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <ul className="version-list catalog-list get-songs-list" aria-label="Catalogue songs">
          {(languages?.error || songs?.error) && (
            <li className="version-error">
              {songs?.error ?? languages?.error}{' '}
              <button className="button-quiet button-small" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </li>
          )}
          {songs === null && <li className="muted">Asking {label}… a large language can take a minute the first time.</li>}
          {songs && !songs.error && matching.length === 0 && <li className="muted">No songs found.</li>}
          {matching.slice(0, shownAtOnce).map((song) => (
            <li key={song.id} className={`version-row get-songs-row${canChoose(song) ? '' : ' is-locked'}`}>
              <input type="checkbox" aria-label={`Choose ${song.title}`} checked={chosen.has(song.id)} disabled={!canChoose(song)} onChange={() => toggle(song.id)} />
              <span className="version-text">
                <strong>{song.title}</strong>
                <span className="muted">{[song.authors.join(', '), song.firstLine].filter(Boolean).join(' · ')}</span>
              </span>
              {song.isRestricted && <span className="song-restricted">Copyrighted</span>}
            </li>
          ))}
          {matching.length > shownAtOnce && <li className="muted">Showing {shownAtOnce} of {matching.length}; search to narrow the list.</li>}
        </ul>
        <div className="rights-note">
          <strong>Songs marked Copyrighted need your church’s licence</strong>
          <span>Most churches cover this with a CCLI or similar licence. Songs without the mark are offered freely by {label}.</span>
          <label>
            <input type="checkbox" checked={hasRights} onChange={(e) => setRights(e.target.checked)} /> Our church is licensed to show the copyrighted songs we import
          </label>
        </div>
        <div className="get-songs-actions">
          <button className="button-quiet button-small" onClick={() => setChosen(new Set(matching.filter(canChoose).map((s) => s.id)))}>
            Choose all {needle ? 'matching' : ''} songs I can
          </button>
          {chosen.size > 0 && (
            <button className="button-quiet button-small" onClick={() => setChosen(new Set())}>
              Clear
            </button>
          )}
          <button className="button-primary" disabled={chosen.size === 0} onClick={importChosen}>
            Import {chosen.size || ''} {chosen.size === 1 ? 'song' : 'songs'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
