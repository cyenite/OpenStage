import { useEffect, useState } from 'react'
import type { OperatorSnapshot } from '@openstage/shared'
import { ControlBar } from './components/ControlBar'
import { Drawer } from './components/Drawer'
import { MonitorPane } from './components/MonitorPane'
import { ServiceOrder } from './components/ServiceOrder'
import { ShortcutHints } from './components/ShortcutHints'
import { SlideGrid } from './components/SlideGrid'
import { TitleBar } from './components/TitleBar'
import { EditWorkspace, type EditSelection } from './edit/EditWorkspace'
import { isMac, useAppearance, useWindowState, useWorkspace } from './chrome'
import { useShortcuts } from './useShortcuts'
import { useSnapshot } from './engine'

export function App() {
  const snapshot = useSnapshot()
  const windowState = useWindowState()
  const [workspace, setWorkspace] = useWorkspace()
  const [appearance, setAppearance] = useAppearance()
  const [searchRequest, setSearchRequest] = useState(0)
  const [editSelection, setEditSelection] = useState<EditSelection>({ library: 'songs', songId: null, themeId: null })
  useShortcuts(workspace === 'present' ? snapshot : null)

  const openSearch = () => {
    setWorkspace('edit')
    setEditSelection((selection) => ({ ...selection, library: 'songs' }))
    setSearchRequest((n) => n + 1)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const classes = ['app', `workspace-${workspace}`, isMac ? 'is-mac' : 'is-framed', windowState.isFocused ? '' : 'is-blurred']
  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {snapshot ? (
        <>
          <TitleBar
            title={workspace === 'present' ? snapshot.service.name : editSelection.library === 'songs' ? 'Songs' : 'Themes'}
            subtitle={workspace === 'present' ? `${snapshot.service.items.length} items in the service` : 'Library'}
            snapshot={snapshot}
            workspace={workspace}
            appearance={appearance}
            windowState={windowState}
            onSearch={openSearch}
            onWorkspace={setWorkspace}
            onAppearance={setAppearance}
          />
          {workspace === 'present' ? (
            <PresentWorkspace snapshot={snapshot} onOpenSongs={() => setWorkspace('edit')} />
          ) : (
            <EditWorkspace snapshot={snapshot} selection={editSelection} searchRequest={searchRequest} onSelection={setEditSelection} />
          )}
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

function PresentWorkspace({ snapshot, onOpenSongs }: { snapshot: OperatorSnapshot; onOpenSongs: () => void }) {
  const { state, decks } = snapshot
  const describe = (ref: typeof state.preview) => {
    const deck = decks.find((d) => d.itemId === ref?.itemId)
    const slide = ref ? deck?.slides[ref.index] : undefined
    return slide && ref ? `${deck!.title} · ${slide.label} · slide ${ref.index + 1}` : 'Nothing'
  }
  return (
    <>
      <ServiceOrder snapshot={snapshot} onOpenSongs={onOpenSongs} />
      <main className="main">
        <section className="monitors" aria-label="Preview and live">
          <MonitorPane kind="preview" caption={describe(state.preview)} render={snapshot.previewRender} />
          <MonitorPane kind="live" caption={describe(state.live.slide)} render={snapshot.liveRender} />
        </section>
        <ControlBar snapshot={snapshot} />
        <SlideGrid snapshot={snapshot} />
        <Drawer snapshot={snapshot} />
      </main>
      <ShortcutHints />
    </>
  )
}
