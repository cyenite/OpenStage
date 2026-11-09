import { useEffect, useState } from 'react'
import type { Id, OperatorSnapshot, ServiceItem } from '@openstage/shared'
import { LibraryDrawer } from '../library/LibraryDrawer'
import type { AddTarget } from '../library/results'
import { OutputColumn } from './OutputColumn'
import { ServiceOrder } from './ServiceOrder'
import { ShowGrid } from './ShowGrid'
import { Timeline } from './Timeline'

interface PresentWorkspaceProps {
  snapshot: OperatorSnapshot
  /** Bumped by `/` and Ctrl/Cmd+L: open the Library and focus its search. */
  libraryRequest: number
  onAdd: () => void
  onEdit: (item: ServiceItem) => void
  onEditSong: (songId: Id) => void
  onManageBibles: () => void
  onGetSongs: () => void
  onOpenSongs: () => void
  onEditSlides: (presentationId: Id | null) => void
  onEditMedia: (mediaId: Id | null) => void
}

/** The live screen: service order, every slide in the middle, the screens and their layers on the right. */
export function PresentWorkspace({ snapshot, libraryRequest, onAdd, onEdit, onEditSong, onManageBibles, onGetSongs, onOpenSongs, onEditSlides, onEditMedia }: PresentWorkspaceProps) {
  const [isDrawerOpen, setDrawerOpen] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [libraryDeckId, setLibraryDeckId] = useState<Id | null>(null)
  const { service, decks, state } = snapshot
  const target: AddTarget = { service, afterItemId: state.selectedItemId, afterTitle: decks.find((d) => d.itemId === state.selectedItemId)?.title ?? '', isOpen: true }

  useEffect(() => {
    if (libraryRequest === 0) return
    setDrawerOpen(true)
    setFocusRequest((n) => n + 1)
  }, [libraryRequest])

  // Picking a service item goes back to the service, even with something from the Library open.
  useEffect(() => setLibraryDeckId(null), [state.selectedItemId])

  return (
    <>
      <ServiceOrder snapshot={snapshot} onAdd={onAdd} onEdit={onEdit} onOpenSongs={onOpenSongs} />
      <main className="present-main">
        <ShowGrid snapshot={snapshot} libraryDeckId={libraryDeckId} target={target} onCloseLibrary={() => setLibraryDeckId(null)} onEdit={onEdit} onEditSong={onEditSong} onEditSlides={onEditSlides} />
        <LibraryDrawer
          snapshot={snapshot}
          target={target}
          isOpen={isDrawerOpen}
          focusRequest={focusRequest}
          onOpenChange={setDrawerOpen}
          onOpenDeck={setLibraryDeckId}
          onManageBibles={onManageBibles}
          onGetSongs={onGetSongs}
          onEditSlides={onEditSlides}
          onEditMedia={onEditMedia}
        />
      </main>
      <OutputColumn snapshot={snapshot} />
      <Timeline snapshot={snapshot} />
    </>
  )
}
