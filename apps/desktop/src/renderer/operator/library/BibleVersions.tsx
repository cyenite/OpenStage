import { useEffect, useRef, useState } from 'react'
import { catalogLanguages, type OperatorSnapshot, type RemoteVersion } from '@openstage/shared'
import { ask, dispatch } from '../engine'
import { useStoredState } from './useStoredState'

interface BibleVersionsProps {
  snapshot: OperatorSnapshot
  onClose: () => void
}

type Catalog = { tag: string; versions: RemoteVersion[]; error: string | null } | null

const isTag = (value: unknown): value is string => catalogLanguages.some((l) => l.tag === value)
const isYes = (value: unknown): value is boolean => typeof value === 'boolean'

/** Installed Bibles, downloads in progress, and the bible.com catalogue, in the way the Chemichemi app manages them. */
export function BibleVersions({ snapshot, onClose }: BibleVersionsProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tag, setTag] = useStoredState('openstage.catalogLanguage', 'eng', isTag)
  const [hasRights, setRights] = useStoredState('openstage.bibleRights', false, isYes)
  const [catalog, setCatalog] = useState<Catalog>(null)
  const [filter, setFilter] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => {
    let isCurrent = true
    setCatalog(null)
    void ask({ type: 'bible.catalog', languageTag: tag }).then((result) => {
      if (isCurrent && result.type === 'catalog') setCatalog({ tag, versions: result.versions, error: result.error })
    })
    return () => {
      isCurrent = false
    }
  }, [tag, attempt])

  const { bibles, bundledBibles, downloads, downloadedVersionIds } = snapshot
  const needle = filter.trim().toLowerCase()
  const listed = (catalog?.versions ?? []).filter((v) => !needle || `${v.abbreviation} ${v.title}`.toLowerCase().includes(needle))

  return (
    <dialog ref={dialog} className="dialog bible-versions" aria-labelledby="bible-versions-title" onClose={onClose}>
      <div className="bible-versions-head">
        <h2 id="bible-versions-title">Bible versions</h2>
        <span className="muted">Everything here works offline once it is on this computer</span>
        <button className="button-primary" onClick={() => dialog.current?.close()}>
          Done
        </button>
      </div>
      <div className="bible-versions-body">
        <div className="bible-versions-column">
          <section aria-labelledby="installed-title">
            <h3 id="installed-title" className="panel-title">
              On this computer
            </h3>
            <ul className="version-list">
              {bibles.map((b) => {
                const isBundled = bundledBibles.includes(b.code)
                return (
                  <li key={b.code} className="version-row">
                    <span className="version-code">{b.code}</span>
                    <span className="version-text">
                      <strong>{b.name}</strong>
                      <span className="muted">{isBundled ? `Included · ${b.notice || 'public domain'}` : b.notice}</span>
                    </span>
                    {!isBundled &&
                      (removing === b.code ? (
                        <span className="version-actions">
                          <button className="button-danger button-small" onClick={() => (dispatch({ type: 'bible.remove', code: b.code }), setRemoving(null))}>
                            Remove {b.code}
                          </button>
                          <button className="button-quiet button-small" onClick={() => setRemoving(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button className="button-quiet button-small" title="Saved passages in this version will say it is not installed" onClick={() => setRemoving(b.code)}>
                          Remove
                        </button>
                      ))}
                  </li>
                )
              })}
            </ul>
          </section>
          {downloads.length > 0 && (
            <section aria-labelledby="downloading-title">
              <h3 id="downloading-title" className="panel-title">
                Downloading
              </h3>
              <ul className="version-list">
                {downloads.map((d) => (
                  <li key={d.version.id} className={`version-download${d.error ? ' is-stopped' : ''}`}>
                    <div className="version-row">
                      <span className="version-code">{d.version.abbreviation}</span>
                      <strong className="version-text">{d.version.title}</strong>
                      {d.error && !d.isRefused && (
                        <button className="button-primary button-small" onClick={() => dispatch({ type: 'bible.download', version: d.version })}>
                          Retry
                        </button>
                      )}
                      <button className="button-quiet button-small" onClick={() => dispatch({ type: 'bible.cancelDownload', versionId: d.version.id })}>
                        {d.error ? 'Dismiss' : 'Cancel'}
                      </button>
                    </div>
                    <progress max={d.total || 1} value={d.done} aria-label={`${d.version.title} download`} />
                    <span className={d.error ? 'version-error' : 'muted'}>
                      {d.total ? `${d.done} of ${d.total} chapters` : 'Reading the book list…'}
                      {d.error ? ` · ${d.error}` : ' · each finished chapter is saved, so a dropped connection resumes'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="bible-versions-column">
          <section aria-labelledby="catalog-title" className="catalog">
            <h3 id="catalog-title" className="panel-title">
              Get more from bible.com
            </h3>
            <div className="catalog-controls">
              <select aria-label="Catalogue language" value={tag} onChange={(e) => setTag(e.target.value)}>
                {catalogLanguages.map((l) => (
                  <option key={l.tag} value={l.tag}>
                    {l.label === l.name ? l.label : `${l.label} · ${l.name}`}
                  </option>
                ))}
              </select>
              <input type="search" aria-label="Search the catalogue" placeholder="Search versions" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <ul className="version-list catalog-list">
              {catalog === null && <li className="muted">Asking bible.com…</li>}
              {catalog?.error && (
                <li className="version-error">
                  {catalog.error}{' '}
                  <button className="button-quiet button-small" onClick={() => setAttempt((n) => n + 1)}>
                    Retry
                  </button>
                </li>
              )}
              {catalog && !catalog.error && listed.length === 0 && <li className="muted">No versions found.</li>}
              {listed.map((v) => {
                const isInstalled = downloadedVersionIds.includes(v.id)
                const isDownloading = downloads.some((d) => d.version.id === v.id && !d.error)
                return (
                  <li key={v.id} className="version-row">
                    <span className="version-code">{v.abbreviation}</span>
                    <span className="version-text">
                      <strong>{v.title}</strong>
                      <span className="muted">{v.languageName}</span>
                    </span>
                    {isInstalled ? (
                      <span className="version-state">Installed</span>
                    ) : isDownloading ? (
                      <span className="muted">Downloading</span>
                    ) : (
                      <button className="button-primary button-small" disabled={!hasRights} title={hasRights ? undefined : 'Confirm your church’s right to use downloaded versions first'} onClick={() => dispatch({ type: 'bible.download', version: v })}>
                        Get
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="rights-note">
              <strong>Most of these versions are copyrighted</strong>
              <span>They are saved on this computer only, with the copyright line bible.com gives. Showing one in your services may need the publisher’s permission.</span>
              <label>
                <input type="checkbox" checked={hasRights} onChange={(e) => setRights(e.target.checked)} /> Our church has the right to use the versions we download
              </label>
            </div>
          </section>
        </div>
      </div>
    </dialog>
  )
}
