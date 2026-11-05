import { useState } from 'react'
import type { OperatorSnapshot } from '@openstage/shared'
import { NewSongDialog } from './NewSongDialog'
import { SongEditor } from './SongEditor'
import { SongLibrary } from './SongLibrary'

interface EditWorkspaceProps {
  songId: string | null
  snapshot: OperatorSnapshot
  searchRequest: number
  onSongId: (songId: string | null) => void
}

/** The open song lives in the app shell, so switching to Present and back keeps it open. */
export function EditWorkspace({ songId, snapshot, searchRequest, onSongId: setSongId }: EditWorkspaceProps) {
  const [isCreating, setCreating] = useState(false)
  const serviceSongIds = new Set(snapshot.service.items.flatMap((item) => (item.type === 'song' ? [item.songId] : [])))
  return (
    <>
      <SongLibrary
        revision={snapshot.libraryRevision}
        selectedId={songId}
        searchRequest={searchRequest}
        serviceSongIds={serviceSongIds}
        onSelect={setSongId}
        onNew={() => setCreating(true)}
      />
      <main className="main editor-main">
        {songId ? (
          <SongEditor key={songId} songId={songId} service={snapshot.service} isInService={serviceSongIds.has(songId)} onDeleted={() => setSongId(null)} />
        ) : (
          <EmptyEditor onNew={() => setCreating(true)} />
        )}
      </main>
      {isCreating && (
        <NewSongDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setSongId(id)
          }}
        />
      )}
    </>
  )
}

function EmptyEditor({ onNew }: { onNew: () => void }) {
  return (
    <div className="editor-empty">
      <h1>Songs</h1>
      <p>Pick a song from the library to edit it, or paste lyrics to make a new one.</p>
      <button className="button-primary" onClick={onNew}>
        New song
      </button>
    </div>
  )
}
