import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { Id, OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'
import { BibleTab } from './BibleTab'
import { LibraryCard } from './LibraryCard'
import { MediaTab } from './MediaTab'
import { SlidesTab } from './SlidesTab'
import { SongsTab } from './SongsTab'
import { actionHint, actionLabel, applyResult, targetItem, useLibraryResults, type AddTarget, type LibraryFilter } from './results'
import { useStoredState } from './useStoredState'

/** Declaration order is tab order. `filter` is the Library search filter a layer tab lists. */
export const libraryTabs = [
  { key: 'songs', label: 'Songs', filter: null },
  { key: 'bible', label: 'Bible', filter: null },
  { key: 'slides', label: 'Slides', filter: null },
  { key: 'media', label: 'Media', filter: null },
  { key: 'backgrounds', label: 'Backgrounds', filter: 'backgrounds' },
  { key: 'audio', label: 'Audio', filter: 'audio' },
] as const satisfies readonly { key: string; label: string; filter: LibraryFilter | null }[]

type LibraryTab = (typeof libraryTabs)[number]['key']

const isTab = (value: unknown): value is LibraryTab => libraryTabs.some((t) => t.key === value)
const isHeight = (value: unknown): value is number => typeof value === 'number' && value >= 160 && value <= 2000

interface LibraryDrawerProps {
  snapshot: OperatorSnapshot
  target: AddTarget
  isOpen: boolean
  /** Bumped to move focus into the open tab's search box. */
  focusRequest: number
  onOpenChange: (isOpen: boolean) => void
  /** A song or passage was opened: the slide grid shows it, cued but not on screen. */
  onOpenDeck: (deckId: Id) => void
  onManageBibles: () => void
  onGetSongs: () => void
  /** Opens Edit on these slides, or on the slides library when null. */
  onEditSlides: (presentationId: Id | null) => void
  onEditMedia: (mediaId: Id | null) => void
}

/** Present's Library, closed under the slide grid until it is needed; nothing in it changes the screens until a slide is clicked. */
export function LibraryDrawer({ snapshot, target, isOpen, focusRequest, onOpenChange, onOpenDeck, onManageBibles, onGetSongs, onEditSlides, onEditMedia }: LibraryDrawerProps) {
  const [tab, setTab] = useStoredState<LibraryTab>('openstage.libraryTab', 'songs', isTab)
  const [height, setHeight] = useStoredState<number>('openstage.drawerHeight', 300, isHeight)
  const drawer = useRef<HTMLElement>(null)
  const filter = libraryTabs.find((t) => t.key === tab)!.filter

  const startResize = (event: ReactPointerEvent) => {
    const bottom = drawer.current!.getBoundingClientRect().bottom
    const onMove = (move: PointerEvent) => setHeight(Math.round(Math.min(window.innerHeight * 0.7, Math.max(160, bottom - move.clientY))))
    const onUp = () => (window.removeEventListener('pointermove', onMove), window.removeEventListener('pointerup', onUp))
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    event.preventDefault()
  }

  return (
    <section ref={drawer} className={`library-drawer${isOpen ? ' is-open' : ''}`} aria-label="Library" style={isOpen ? { height } : undefined}>
      {isOpen && <div className="drawer-handle" role="separator" aria-orientation="horizontal" aria-label="Resize the Library" onPointerDown={startResize} />}
      <div className="drawer-bar">
        <span className="panel-title">Library</span>
        <div className="library-tabs" role="tablist" aria-label="Library">
          {libraryTabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={isOpen && tab === t.key}
              onClick={() => (isOpen && tab === t.key ? onOpenChange(false) : (setTab(t.key), onOpenChange(true)))}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="drawer-hint muted">
          <kbd>/</kbd> or <kbd>Ctrl L</kbd>
        </span>
        <button className="icon-button" aria-label={isOpen ? 'Close the Library' : 'Open the Library'} aria-expanded={isOpen} onClick={() => onOpenChange(!isOpen)}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={isOpen ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'} />
          </svg>
        </button>
      </div>
      {isOpen && (
        <div className="library-tab-body" role="tabpanel">
          {tab === 'songs' && <SongsTab snapshot={snapshot} focusRequest={focusRequest} onOpenDeck={onOpenDeck} onGetSongs={onGetSongs} />}
          {tab === 'bible' && <BibleTab snapshot={snapshot} target={target} focusRequest={focusRequest} onOpenDeck={onOpenDeck} onManage={onManageBibles} />}
          {tab === 'slides' && <SlidesTab snapshot={snapshot} focusRequest={focusRequest} onOpenDeck={onOpenDeck} onEditSlides={onEditSlides} />}
          {tab === 'media' && <MediaTab snapshot={snapshot} onManage={onEditMedia} />}
          {filter && <LayerTab snapshot={snapshot} target={target} filter={filter} />}
        </div>
      )}
    </section>
  )
}

interface LayerTabProps {
  snapshot: OperatorSnapshot
  target: AddTarget
  filter: LibraryFilter
}

function LayerTab({ snapshot, target, filter }: LayerTabProps) {
  const { results } = useLibraryResults(snapshot, '', filter, true)
  const { state } = snapshot
  return (
    <div className="library-tab">
      <p className="library-target">
        {filter === 'backgrounds' ? (
          <>
            <span>
              Use sets the background of <strong>{target.afterTitle || 'the selected item'}</strong>
            </span>
            <span className="muted">Show now changes the screen until the next item · drag onto a service item</span>
          </>
        ) : (
          <span className="muted">Plays now; stop it with F4</span>
        )}
      </p>
      <div className="library-results">
        {results.map((result) => (
          <LibraryCard
            key={result.key}
            result={result}
            label={actionLabel(result, target, snapshot)}
            hint={actionHint(result, target)}
            isActive={(result.filter === 'backgrounds' && targetItem(target)?.backgroundId === result.id) || (result.filter === 'audio' && state.live.audio === result.id)}
            onAct={() => applyResult(result, target)}
            onLive={result.filter === 'backgrounds' ? () => dispatch({ type: 'background.set', backgroundId: result.id }) : undefined}
          />
        ))}
        {results.length === 0 && <p className="library-empty muted">Nothing here yet.</p>}
      </div>
    </div>
  )
}
