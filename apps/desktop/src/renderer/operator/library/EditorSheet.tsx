import { useEffect, useRef } from 'react'
import type { Id, OperatorSnapshot } from '@openstage/shared'
import { ScriptureEditor } from '../edit/ScriptureEditor'
import { SongEditor } from '../edit/SongEditor'

export type SheetDocument = { kind: 'song'; id: Id } | { kind: 'passage'; id: Id }

interface EditorSheetProps {
  snapshot: OperatorSnapshot
  document: SheetDocument
  onClose: () => void
  onOpenTheme: (themeId: Id) => void
}

/** The full song or passage editor over the current workspace; the outputs keep running underneath. */
export function EditorSheet({ snapshot, document, onClose, onOpenTheme }: EditorSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const close = () => dialog.current?.close()
  const isInService = snapshot.service.items.some((i) => i.type === 'song' && i.songId === document.id)

  return (
    <dialog ref={dialog} className="dialog editor-sheet" aria-label={document.kind === 'song' ? 'Edit song' : 'Edit passage'} onClose={onClose}>
      <div className="editor-sheet-bar">
        <span className="muted">Changes save as you type</span>
        <button className="button-primary" onClick={close}>
          Done
        </button>
      </div>
      <div className="editor-sheet-body">
        {document.kind === 'song' ? (
          <SongEditor
            songId={document.id}
            themes={snapshot.library.themes}
            service={snapshot.service}
            isInService={isInService}
            onDeleted={close}
            onOpenTheme={(themeId) => (close(), onOpenTheme(themeId))}
          />
        ) : (
          <ScriptureEditor bibles={snapshot.bibles} service={snapshot.service} revision={snapshot.libraryRevision} passageId={document.id} onDeleted={close} />
        )}
      </div>
    </dialog>
  )
}
