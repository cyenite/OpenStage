import { useState } from 'react'
import type { Id, OperatorSnapshot } from '@openstage/shared'
import type { EditLibrary } from './LibraryTabs'
import { NewSongDialog } from './NewSongDialog'
import { SongEditor } from './SongEditor'
import { SongLibrary } from './SongLibrary'
import { ThemeEditor } from './ThemeEditor'
import { ThemeLibrary } from './ThemeLibrary'

export interface EditSelection {
  songId: Id | null
  themeId: Id | null
  library: EditLibrary
}

interface EditWorkspaceProps {
  snapshot: OperatorSnapshot
  selection: EditSelection
  searchRequest: number
  onSelection: (selection: EditSelection) => void
}

/** What is open lives in the app shell, so switching to Present and back keeps it open. */
export function EditWorkspace({ snapshot, selection, searchRequest, onSelection }: EditWorkspaceProps) {
  const [isCreating, setCreating] = useState(false)
  const select = (change: Partial<EditSelection>) => onSelection({ ...selection, ...change })
  const openTheme = (themeId: Id) => select({ library: 'themes', themeId })
  const serviceSongIds = new Set(snapshot.service.items.flatMap((item) => (item.type === 'song' ? [item.songId] : [])))
  const { songId, themeId } = selection

  if (selection.library === 'themes') {
    return (
      <>
        <ThemeLibrary
          themes={snapshot.library.themes}
          service={snapshot.service}
          selectedId={themeId}
          onLibrary={(library) => select({ library })}
          onSelect={openTheme}
        />
        <main className="main editor-main">
          {themeId ? (
            <ThemeEditor key={themeId} themeId={themeId} service={snapshot.service} uses={snapshot.themeUses[themeId] ?? 0} onDeleted={() => select({ themeId: null })} />
          ) : (
            <div className="editor-empty">
              <h1>Themes</h1>
              <p>A theme sets the fonts, colours and layout of slides. Songs and services point at a theme, so changing it updates them all.</p>
            </div>
          )}
        </main>
      </>
    )
  }

  return (
    <>
      <SongLibrary
        revision={snapshot.libraryRevision}
        selectedId={songId}
        searchRequest={searchRequest}
        serviceSongIds={serviceSongIds}
        onNew={() => setCreating(true)}
        onSelect={(id) => select({ songId: id })}
        onLibrary={(library) => select({ library })}
      />
      <main className="main editor-main">
        {songId ? (
          <SongEditor
            key={songId}
            songId={songId}
            themes={snapshot.library.themes}
            service={snapshot.service}
            isInService={serviceSongIds.has(songId)}
            onDeleted={() => select({ songId: null })}
            onOpenTheme={openTheme}
          />
        ) : (
          <EmptyEditor onNew={() => setCreating(true)} />
        )}
      </main>
      {isCreating && (
        <NewSongDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            select({ songId: id })
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
