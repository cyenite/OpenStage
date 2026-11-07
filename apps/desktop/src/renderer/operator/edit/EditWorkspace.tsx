import { useState } from 'react'
import type { Id, OperatorSnapshot } from '@openstage/shared'
import type { EditLibrary } from './LibraryTabs'
import { ImportDialog } from './ImportDialog'
import { NewSongDialog } from './NewSongDialog'
import { ScriptureEditor } from './ScriptureEditor'
import { ScriptureLibrary } from './ScriptureLibrary'
import { SongEditor } from './SongEditor'
import { SongLibrary } from './SongLibrary'
import { ThemeEditor } from './ThemeEditor'
import { ThemeLibrary } from './ThemeLibrary'

export interface EditSelection {
  songId: Id | null
  themeId: Id | null
  passageId: Id | null
  library: EditLibrary
}

interface EditWorkspaceProps {
  snapshot: OperatorSnapshot
  selection: EditSelection
  onSelection: (selection: EditSelection) => void
}

/** What is open lives in the app shell, so switching to Present and back keeps it open. */
export function EditWorkspace({ snapshot, selection, onSelection }: EditWorkspaceProps) {
  const [isCreating, setCreating] = useState(false)
  const [importFiles, setImportFiles] = useState<File[] | null>(null)
  const importDialog = importFiles && (
    <ImportDialog key={importFiles.map((f) => f.name).join('|')} files={importFiles} installedBibles={snapshot.bibles.map((b) => b.code)} onClose={() => setImportFiles(null)} />
  )
  const select = (change: Partial<EditSelection>) => onSelection({ ...selection, ...change })
  const openTheme = (themeId: Id) => select({ library: 'themes', themeId })
  const serviceSongIds = new Set(snapshot.service.items.flatMap((item) => (item.type === 'song' ? [item.songId] : [])))
  const { songId, themeId } = selection

  if (selection.library === 'scripture') {
    return (
      <>
        <ScriptureLibrary
          service={snapshot.service}
          revision={snapshot.libraryRevision}
          selectedId={selection.passageId}
          onLibrary={(library) => select({ library })}
          onSelect={(passageId) => select({ passageId })}
          onImport={setImportFiles}
        />
        <main className="main editor-main">
          {selection.passageId ? (
            <ScriptureEditor
              key={selection.passageId}
              bibles={snapshot.bibles}
              service={snapshot.service}
              revision={snapshot.libraryRevision}
              passageId={selection.passageId}
              onDeleted={() => select({ passageId: null })}
            />
          ) : (
            <div className="editor-empty">
              <h1>Scripture</h1>
              <p>Type a reference such as “jn 3 16-18” or “Yohana 3:16” in the box on the left. Bibles installed: {snapshot.bibles.map((b) => b.code).join(', ') || 'none'}.</p>
            </div>
          )}
        </main>
        {importDialog}
      </>
    )
  }

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
        serviceSongIds={serviceSongIds}
        onNew={() => setCreating(true)}
        onSelect={(id) => select({ songId: id })}
        onImport={setImportFiles}
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
      {importDialog}
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
