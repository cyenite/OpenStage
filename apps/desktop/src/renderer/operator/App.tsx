import { useEffect, useState } from 'react'
import type { Id, OperatorSnapshot, ServiceItem } from '@openstage/shared'
import { ControlBar } from './components/ControlBar'
import { MonitorPane } from './components/MonitorPane'
import { PresentInspector } from './components/PresentInspector'
import { ServiceOrder } from './components/ServiceOrder'
import { SlideGrid } from './components/SlideGrid'
import { Timeline } from './components/Timeline'
import { TitleBar } from './components/TitleBar'
import { EditWorkspace, type EditSelection } from './edit/EditWorkspace'
import { editLibraries } from './edit/LibraryTabs'
import { EditorSheet, type SheetDocument } from './library/EditorSheet'
import { ImportDialog, type ImportSource } from './edit/ImportDialog'
import { BibleVersions } from './library/BibleVersions'
import { GetSongs } from './library/GetSongs'
import { LibraryPanel } from './library/LibraryPanel'
import { QuickAdd } from './library/QuickAdd'
import type { AddTarget } from './library/results'
import { initialPlanSelection, PlanWorkspace, type PlanSelection } from './plan/PlanWorkspace'
import { isMac, useAppearance, useWindowState, useWorkspace } from './chrome'
import { useShortcuts } from './useShortcuts'
import { VolunteerDialog } from './volunteer/PinDialogs'
import { VolunteerScreen } from './volunteer/VolunteerScreen'
import { dispatch, useSnapshot } from './engine'

export function App() {
  const snapshot = useSnapshot()
  const windowState = useWindowState()
  const [workspace, setWorkspace] = useWorkspace()
  const [appearance, setAppearance] = useAppearance()
  const [isLocking, setLocking] = useState(false)
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null)
  const [sheet, setSheet] = useState<SheetDocument | null>(null)
  const [isManagingBibles, setManagingBibles] = useState(false)
  const [isGettingSongs, setGettingSongs] = useState(false)
  const [importSource, setImportSource] = useState<ImportSource | null>(null)
  const [planSelection, setPlanSelection] = useState<PlanSelection>(initialPlanSelection)
  const [editSelection, setEditSelection] = useState<EditSelection>({ library: 'songs', songId: null, themeId: null, passageId: null })
  const isLocked = !!snapshot?.mode.isLocked
  // Esc closes an overlay, and must never also clear the screens.
  const isOverlayOpen = !!addTarget || !!sheet || isManagingBibles || isGettingSongs || !!importSource
  useShortcuts(isLocked || (workspace === 'present' && !isOverlayOpen) ? snapshot : null)

  /** Adds after the selected item of the open service, or into another service from Plan. */
  const openQuickAdd = (target?: AddTarget) => {
    if (!snapshot || isLocked) return
    const { service, state, decks } = snapshot
    const afterItemId = state.selectedItemId
    setAddTarget(target ?? { service, afterItemId, afterTitle: decks.find((d) => d.itemId === afterItemId)?.title ?? '', isOpen: true })
  }
  const openEditor = (item: ServiceItem) => {
    if (item.type === 'song') setSheet({ kind: 'song', id: item.songId })
    if (item.type === 'scripture') setSheet({ kind: 'passage', id: item.passageId })
  }
  const openTheme = (themeId: Id) => {
    setEditSelection((selection) => ({ ...selection, library: 'themes', themeId }))
    setWorkspace('edit')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!isOverlayOpen) openQuickAdd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const classes = [
    'app',
    isLocked ? 'workspace-volunteer' : `workspace-${workspace}`,
    isMac ? 'is-mac' : 'is-framed',
    windowState.isFocused ? '' : 'is-blurred',
    snapshot?.mode.isRehearsing ? 'is-rehearsing' : '',
  ]
  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {snapshot && isLocked ? (
        <VolunteerScreen snapshot={snapshot} windowState={windowState} />
      ) : snapshot ? (
        <>
          <TitleBar
            title={workspace === 'present' ? snapshot.service.name : workspace === 'plan' ? 'Planner' : editLibraries.find((l) => l.key === editSelection.library)!.label}
            subtitle={
              workspace === 'present'
                ? `${snapshot.service.items.length} items in the service`
                : workspace === 'plan'
                  ? `${snapshot.services.length} ${snapshot.services.length === 1 ? 'service' : 'services'} · ${snapshot.library.templates.length} templates`
                  : 'Library'
            }
            snapshot={snapshot}
            workspace={workspace}
            appearance={appearance}
            windowState={windowState}
            onLock={() => setLocking(true)}
            onSearch={() => openQuickAdd()}
            onWorkspace={setWorkspace}
            onAppearance={setAppearance}
          />
          {workspace === 'present' && (
            <PresentWorkspace
              snapshot={snapshot}
              onAdd={() => openQuickAdd()}
              onEdit={openEditor}
              onEditSong={(id) => setSheet({ kind: 'song', id })}
              onManageBibles={() => setManagingBibles(true)}
              onGetSongs={() => setGettingSongs(true)}
              onOpenSongs={() => setWorkspace('edit')}
            />
          )}
          {workspace === 'edit' && <EditWorkspace snapshot={snapshot} selection={editSelection} onSelection={setEditSelection} onGetSongs={() => setGettingSongs(true)} />}
          {workspace === 'plan' && (
            <PlanWorkspace snapshot={snapshot} selection={planSelection} onSelection={setPlanSelection} onQuickAdd={openQuickAdd} onPresent={() => setWorkspace('present')} />
          )}
          {addTarget && <QuickAdd snapshot={snapshot} target={addTarget} onClose={() => setAddTarget(null)} />}
          {isGettingSongs && <GetSongs onImport={setImportSource} onClose={() => setGettingSongs(false)} />}
          {importSource && <ImportDialog source={importSource} installedBibles={snapshot.bibles.map((b) => b.code)} onClose={() => setImportSource(null)} />}
          {isManagingBibles && <BibleVersions snapshot={snapshot} onClose={() => setManagingBibles(false)} />}
          {sheet && <EditorSheet key={`${sheet.kind}/${sheet.id}`} snapshot={snapshot} document={sheet} onClose={() => setSheet(null)} onOpenTheme={openTheme} />}
          {isLocking && <VolunteerDialog hasPin={snapshot.mode.hasPin} onClose={() => setLocking(false)} />}
        </>
      ) : (
        <ConnectingScreen />
      )}
    </div>
  )
}

function ConnectingScreen() {
  return (
    <>
      <header className="titlebar titlebar-empty" />
      <div className="connecting">Connecting to the engine…</div>
    </>
  )
}

interface PresentWorkspaceProps {
  snapshot: OperatorSnapshot
  onAdd: () => void
  onEdit: (item: ServiceItem) => void
  onEditSong: (songId: Id) => void
  onManageBibles: () => void
  onGetSongs: () => void
  onOpenSongs: () => void
}

function PresentWorkspace({ snapshot, onAdd, onEdit, onEditSong, onManageBibles, onGetSongs, onOpenSongs }: PresentWorkspaceProps) {
  const { state, decks, instant } = snapshot
  const sourceOf = (ref: typeof state.preview) => (!ref ? undefined : instant.some((d) => d.itemId === ref.itemId) ? 'Library' : 'Schedule')
  const describe = (ref: typeof state.preview) => {
    const deck = [...decks, ...instant].find((d) => d.itemId === ref?.itemId)
    const slide = ref ? deck?.slides[ref.index] : undefined
    return slide && ref ? `${deck!.title} · ${slide.label} · slide ${ref.index + 1}` : 'Nothing'
  }
  return (
    <>
      <ServiceOrder snapshot={snapshot} onAdd={onAdd} onEdit={onEdit} onOpenSongs={onOpenSongs} />
      <main className="main">
        <section className="monitors" aria-label="Preview and live">
          <MonitorPane kind="preview" caption={describe(state.preview)} source={sourceOf(state.preview)} render={snapshot.previewRender} />
          <MonitorPane
            kind="live"
            caption={describe(state.live.slide)}
            source={sourceOf(state.live.slide)}
            render={snapshot.liveRender}
            onDropBackground={(backgroundId) => dispatch({ type: 'background.set', backgroundId })}
          />
        </section>
        <ControlBar snapshot={snapshot} />
        <SlideGrid snapshot={snapshot} />
        <LibraryPanel snapshot={snapshot} onEditSong={onEditSong} onManageBibles={onManageBibles} onGetSongs={onGetSongs} />
      </main>
      <PresentInspector snapshot={snapshot} onEdit={onEdit} />
      <Timeline snapshot={snapshot} />
    </>
  )
}
