import { ControlBar } from './components/ControlBar'
import { Drawer } from './components/Drawer'
import { Header } from './components/Header'
import { MonitorPane } from './components/MonitorPane'
import { ServiceOrder } from './components/ServiceOrder'
import { ShortcutHints } from './components/ShortcutHints'
import { SlideGrid } from './components/SlideGrid'
import { useShortcuts } from './useShortcuts'
import { useSnapshot } from './engine'

export function App() {
  const snapshot = useSnapshot()
  useShortcuts(snapshot)

  if (!snapshot) return <div className="connecting">Connecting to the engine…</div>

  const { state, decks } = snapshot
  const describe = (ref: typeof state.preview) => {
    const deck = decks.find((d) => d.itemId === ref?.itemId)
    const slide = ref ? deck?.slides[ref.index] : undefined
    return slide && ref ? `${deck!.title} · ${slide.label} · slide ${ref.index + 1}` : 'Nothing'
  }

  return (
    <div className="app">
      <Header snapshot={snapshot} />
      <ServiceOrder snapshot={snapshot} />
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
    </div>
  )
}
