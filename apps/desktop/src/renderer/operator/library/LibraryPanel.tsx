import type { Id, OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'
import { BibleTab } from './BibleTab'
import { LibraryCard } from './LibraryCard'
import { SongsTab } from './SongsTab'
import { actionHint, actionLabel, applyResult, targetItem, useLibraryResults, type AddTarget, type LibraryFilter } from './results'
import { useStoredState } from './useStoredState'

/** Declaration order is tab order. `filter` is the Library search filter a layer tab lists. */
export const libraryTabs = [
  { key: 'songs', label: 'Songs', filter: null },
  { key: 'bible', label: 'Bible', filter: null },
  { key: 'backgrounds', label: 'Backgrounds', filter: 'backgrounds' },
  { key: 'lowerThirds', label: 'Lower thirds', filter: 'lowerThirds' },
  { key: 'audio', label: 'Audio', filter: 'audio' },
] as const satisfies readonly { key: string; label: string; filter: LibraryFilter | null }[]

type LibraryTab = (typeof libraryTabs)[number]['key']

const isTab = (value: unknown): value is LibraryTab => libraryTabs.some((t) => t.key === value)

interface LibraryPanelProps {
  snapshot: OperatorSnapshot
  onEditSong: (songId: Id) => void
  onManageBibles: () => void
  onGetSongs: () => void
}

/** Present's library, EasyWorship style: anything here goes to Preview or Live directly, and joins the service only on request. */
export function LibraryPanel({ snapshot, onEditSong, onManageBibles, onGetSongs }: LibraryPanelProps) {
  const [tab, setTab] = useStoredState<LibraryTab>('openstage.libraryTab', 'songs', isTab)
  const { service, decks, state } = snapshot
  const afterItemId = state.selectedItemId
  const target: AddTarget = { service, afterItemId, afterTitle: decks.find((d) => d.itemId === afterItemId)?.title ?? '', isOpen: true }
  const filter = libraryTabs.find((t) => t.key === tab)!.filter

  return (
    <section className="library-panel" aria-label="Library">
      <div className="library-tabs" role="tablist" aria-label="Library">
        {libraryTabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="library-tab-body" role="tabpanel">
        {tab === 'songs' && <SongsTab snapshot={snapshot} target={target} onEditSong={onEditSong} onGetSongs={onGetSongs} />}
        {tab === 'bible' && <BibleTab snapshot={snapshot} target={target} onManage={onManageBibles} />}
        {filter && <LayerTab snapshot={snapshot} target={target} filter={filter} />}
      </div>
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
            <span className="muted">Live shows it now without saving · drag onto a schedule item or onto Live</span>
          </>
        ) : (
          <span className="muted">Shows on the screens now; clear it with its F key</span>
        )}
      </p>
      <div className="library-results">
        {results.map((result) => (
          <LibraryCard
            key={result.key}
            result={result}
            label={actionLabel(result, target, snapshot)}
            hint={actionHint(result, target)}
            isActive={
              (result.filter === 'backgrounds' && targetItem(target)?.backgroundId === result.id) ||
              (result.filter === 'lowerThirds' && state.live.lowerThird === result.id) ||
              (result.filter === 'audio' && state.live.audio === result.id)
            }
            onAct={() => applyResult(result, target)}
            onLive={result.filter === 'backgrounds' ? () => dispatch({ type: 'background.set', backgroundId: result.id }) : undefined}
          />
        ))}
        {results.length === 0 && <p className="library-empty muted">Nothing here yet.</p>}
      </div>
    </div>
  )
}
