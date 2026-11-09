import { useEffect, useRef, useState } from 'react'
import type { OperatorSnapshot } from '@openstage/shared'
import { NewSongDialog } from '../edit/NewSongDialog'
import { Snippet } from '../edit/SongLibrary'
import { isMac } from '../chrome'
import { FilterChips } from './FilterChips'
import { actionHint, applyResult, libraryFilters, resultBadge, swatchCss, targetItem, useLibraryResults, type AddTarget, type LibraryFilter, type LibraryResult } from './results'

interface QuickAddProps {
  snapshot: OperatorSnapshot
  target: AddTarget
  onClose: () => void
}

const filters = libraryFilters.filter((f) => !f.isLive)

/** Ctrl/Cmd+K from anywhere: type, pick, Enter. Adds after the target item, or fills it when it is a placeholder. */
export function QuickAdd({ snapshot, target, onClose }: QuickAddProps) {
  const anchor = targetItem(target)
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>(anchor?.type === 'slot' ? (anchor.kind === 'song' ? 'songs' : 'scripture') : 'all')
  const [active, setActive] = useState(0)
  const [isCreating, setCreating] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const { results: found, isFresh } = useLibraryResults(snapshot, text, filter, false)
  const results = found.slice(0, 60)
  // Enter pressed before the search answered waits for it, so a fast typist never adds the previous list's first song.
  const [pendingEnter, setPendingEnter] = useState<{ atEnd: boolean } | null>(null)
  const index = Math.min(active, results.length - 1)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  useEffect(() => setActive(0), [text, filter])
  useEffect(() => {
    if (!pendingEnter || !isFresh) return
    setPendingEnter(null)
    choose(results[0], pendingEnter.atEnd)
  }, [pendingEnter, isFresh])

  const choose = (result: LibraryResult | undefined, atEnd = false) => {
    if (!result) return
    applyResult(result, target, atEnd)
    // Unmount now: a dialog's close event arrives a task later, and until then Ctrl/Cmd+K is ignored as if it were still open.
    onClose()
  }
  const where = anchor?.type === 'slot' ? `fills ${target.afterTitle}` : anchor ? `after ${target.afterTitle}` : 'at the end'

  return (
    <dialog ref={dialog} className="dialog quick-add" aria-label="Add to the service" onClose={onClose}>
      <div className="quick-add-head">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          autoFocus
          type="text"
          value={text}
          aria-label="Search everything to add"
          placeholder="Songs, Bible, backgrounds, parts… or a reference like jn 3 16"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((n) => Math.max(0, Math.min(results.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (isFresh) choose(results[index], e.shiftKey)
              else setPendingEnter({ atEnd: e.shiftKey })
            } else if (e.key === 'Tab') {
              e.preventDefault()
              const at = filters.findIndex((f) => f.key === filter)
              setFilter(filters[(at + (e.shiftKey ? filters.length - 1 : 1)) % filters.length]!.key)
            }
          }}
        />
        <span className="quick-add-where">
          {target.service.name} · {where}
        </span>
      </div>
      <FilterChips filters={filters} filter={filter} onFilter={setFilter} />
      <ul className="quick-add-results" aria-label="Results">
        {results.map((result, i) => (
          <li key={result.key}>
            <button className={`quick-add-row${i === index ? ' is-active' : ''}`} aria-label={actionHint(result, target)} onMouseMove={() => setActive(i)} onClick={() => choose(result)}>
              {result.filter === 'backgrounds' ? (
                <span className="library-swatch" style={{ background: swatchCss(result.render) }} aria-hidden="true" />
              ) : (
                <span className="order-kind">{resultBadge(result)}</span>
              )}
              <span className="library-card-text">
                <span className="library-card-title">{result.title}</span>
                {'snippet' in result && result.snippet ? (
                  <Snippet text={result.snippet} className="library-card-detail" />
                ) : (
                  <span className="library-card-detail">{'detail' in result ? result.detail : 'Background for the item'}</span>
                )}
              </span>
              {i === index && <kbd>Enter</kbd>}
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="library-empty muted">{text.trim() ? `Nothing matches “${text.trim()}”.` : 'Nothing here yet.'}</li>}
      </ul>
      <div className="quick-add-foot">
        <button className="button-quiet button-small" onClick={() => setCreating(true)}>
          + New song from pasted lyrics
        </button>
        <span className="muted">
          <kbd>Enter</kbd> {where} · <kbd>Shift Enter</kbd> at the end · <kbd>Tab</kbd> next kind · <kbd>Esc</kbd> close · <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd> from anywhere
        </span>
      </div>
      {isCreating && (
        <NewSongDialog
          onClose={() => setCreating(false)}
          onCreated={(songId) => choose({ filter: 'songs', key: songId, id: songId, title: 'song', detail: '', snippet: '' })}
        />
      )}
    </dialog>
  )
}
