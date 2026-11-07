import { useEffect, useState } from 'react'
import type { OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'
import { LibraryCard } from './LibraryCard'
import { FilterChips } from './FilterChips'
import { actionHint, actionLabel, applyResult, libraryFilters, targetItem, useLibraryResults, type AddTarget, type LibraryFilter, type LibraryResult } from './results'

/** Present's one place to find anything: songs, Bible, backgrounds, parts, and the live-only lower thirds and audio. */
export function LibraryDock({ snapshot }: { snapshot: OperatorSnapshot }) {
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const { service, decks, state } = snapshot
  const selected = service.items.find((i) => i.id === state.selectedItemId)
  const target: AddTarget = { service, afterItemId: selected?.id ?? null, afterTitle: decks.find((d) => d.itemId === selected?.id)?.title ?? '', isOpen: true }
  const results = useLibraryResults(snapshot, text, filter, true)

  // A selected placeholder narrows the dock to what fills it; the operator can still pick another filter.
  const slotKind = selected?.type === 'slot' ? selected.kind : null
  useEffect(() => {
    if (slotKind) setFilter(slotKind === 'song' ? 'songs' : 'scripture')
  }, [selected?.id, slotKind])

  const act = (result: LibraryResult, atEnd = false) => {
    applyResult(result, target, atEnd)
    if ('ref' in result) setText('')
  }
  const isActive = (result: LibraryResult) =>
    (result.filter === 'backgrounds' && targetItem(target)?.backgroundId === result.id) ||
    (result.filter === 'lowerThirds' && state.live.lowerThird === result.id) ||
    (result.filter === 'audio' && state.live.audio === result.id)

  return (
    <section className="library-dock" aria-label="Library">
      <div className="library-head">
        <h2 className="panel-title">Library</h2>
        <label className="library-search">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input
            type="search"
            value={text}
            aria-label="Search the library"
            placeholder="Search songs, Bible, backgrounds… or type ps 23 1"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setText('')
              if (e.key !== 'Enter' || !results[0]) return
              e.preventDefault()
              act(results[0], e.shiftKey)
            }}
          />
        </label>
        <FilterChips filters={libraryFilters} filter={filter} onFilter={setFilter} />
      </div>
      <p className="library-target">
        <span>
          {selected ? (
            <>
              {slotKind ? 'Fills' : 'Adds after'} <strong>{target.afterTitle}</strong>
            </>
          ) : (
            'Adds at the end of the service'
          )}
        </span>
        <span className="muted">Enter adds the first result · drag a background onto an item, or onto Live to show it now</span>
      </p>
      <div className="library-results" role="tabpanel" aria-label="Results">
        {results.map((result) => (
          <LibraryCard
            key={result.key}
            result={result}
            label={actionLabel(result, target, snapshot)}
            hint={actionHint(result, target)}
            isActive={isActive(result)}
            onAct={() => act(result)}
            onLive={result.filter === 'backgrounds' ? () => dispatch({ type: 'background.set', backgroundId: result.id }) : undefined}
          />
        ))}
        {results.length === 0 && <p className="library-empty muted">{text.trim() ? `Nothing matches “${text.trim()}”.` : 'Nothing here yet.'}</p>}
      </div>
    </section>
  )
}
