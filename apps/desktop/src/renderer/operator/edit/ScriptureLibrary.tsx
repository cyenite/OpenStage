import { newId, type Id, type Service } from '@openstage/shared'
import { dispatch, useLibraryQuery } from '../engine'
import { DropZone, ImportButton } from './DropZone'
import { LibraryTabs, type EditLibrary } from './LibraryTabs'
import { ReferenceInput } from './ReferenceInput'

interface ScriptureLibraryProps {
  service: Service
  revision: number
  selectedId: Id | null
  onLibrary: (library: EditLibrary) => void
  onSelect: (passageId: Id) => void
  onImport: (files: File[]) => void
}

export function ScriptureLibrary({ service, revision, selectedId, onLibrary, onSelect, onImport }: ScriptureLibraryProps) {
  const passages = useLibraryQuery({ type: 'library.list', kind: 'passages' }, revision)
  const inService = new Set(service.items.flatMap((i) => (i.type === 'scripture' ? [i.passageId] : [])))
  return (
    <nav className="sidebar scripture-library" aria-label="Scripture passages">
      <div className="sidebar-head">
        <LibraryTabs library="scripture" onLibrary={onLibrary} />
      </div>
      <ReferenceInput
        className="sidebar-reference"
        label="New passage reference"
        placeholder="New: jn 3 16-18, Yohana 3:16"
        onSubmit={(ref, text) => {
          const passageId = newId(text)
          dispatch({ type: 'passage.create', passageId, ref, translations: service.translations ?? [] })
          onSelect(passageId)
        }}
      />
      <div className="sidebar-actions">
        <ImportButton label="Import a Bible" accept=".xml,.usfm,.sfm,.usx,.zip" onFiles={onImport} />
      </div>
      <DropZone hint="Drop OSIS, Zefania, USFX, USX or USFM files, or an eBible.org download, to add a Bible." onFiles={onImport}>
      <ul className="song-list">
        {passages.map((hit) => (
          <li key={hit.id}>
            <button className={`song-row${hit.id === selectedId ? ' is-selected' : ''}`} aria-current={hit.id === selectedId ? 'true' : undefined} onClick={() => onSelect(hit.id)}>
              <span className="song-row-title">{hit.title}</span>
              <span className="song-row-detail">{[hit.detail, inService.has(hit.id) ? 'in this service' : ''].filter(Boolean).join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>
      </DropZone>
    </nav>
  )
}
