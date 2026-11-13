import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { elementKinds, newElement, newId, newPage, type ElementKind, type Id, type OperatorSnapshot, type Page, type PageElement, type PresentationEdit, type Rect01 } from '@openstage/shared'
import { RenderView } from '../components/RenderView'
import { CommitField } from '../edit/CommitField'
import { dispatch, useDocument } from '../engine'
import { isMac } from '../chrome'
import { addInstantToService, type AddTarget } from '../library/results'
import { pageView } from './pageView'
import { describe, SlideInspector } from './SlideInspector'

interface SlideEditorProps {
  snapshot: OperatorSnapshot
  presentationId: Id
  onDeleted: () => void
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type Guides = { x: number[]; y: number[] }

const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const snapDistance = 0.008
const noGuides: Guides = { x: [], y: [] }

/** A pages editor in the manner of a design tool: page strip, canvas with handles and snapping, inspector. */
export function SlideEditor({ snapshot, presentationId, onDeleted }: SlideEditorProps) {
  const { document: deck, canUndo, canRedo, isLoaded } = useDocument('presentations', presentationId)
  const [pageId, setPageId] = useState<Id | null>(null)
  const [selectedId, setSelectedId] = useState<Id | null>(null)
  const [draft, setDraft] = useState<Page | null>(null)
  const [guides, setGuides] = useState<Guides>(noGuides)
  const [playCount, setPlayCount] = useState(0)
  const [isConfirmingDelete, setConfirmingDelete] = useState(false)
  const clipboard = useRef<PageElement | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const latest = useRef<Page | null>(null)

  const saved = deck?.pages.find((p) => p.id === pageId) ?? deck?.pages[0]
  const page = draft?.id === saved?.id ? draft : saved
  latest.current = page ?? null
  const savedJson = JSON.stringify(saved)
  useEffect(() => setDraft(null), [savedJson])

  if (!deck || !page || !saved) return <div className="editor-empty">{isLoaded ? 'These slides are no longer in the library.' : 'Opening…'}</div>

  const ref = { kind: 'presentations', id: presentationId } as const
  const edit = (change: PresentationEdit) => dispatch({ type: 'presentation.edit', presentationId, edit: change })
  const commit = (next: Page) => {
    setDraft(next)
    edit({ type: 'presentation.setPage', page: next })
  }
  const media = snapshot.library.media
  const element = page.elements.find((e) => e.id === selectedId)
  const pageIndex = deck.pages.findIndex((p) => p.id === page.id)
  const updateElement = (id: Id, patch: Partial<PageElement>) => commit({ ...page, elements: page.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as PageElement) : e)) })
  const withElements = (elements: PageElement[]) => commit({ ...page, elements })

  const insert = (kind: ElementKind) => {
    const type = kind === 'image' || kind === 'video' ? kind : null
    const created = newElement(kind, newId(kind), type ? media.find((m) => m.type === type)?.id : undefined)
    withElements([...page.elements, created])
    setSelectedId(created.id)
  }
  const duplicate = (source: PageElement) => {
    const copy = { ...source, id: newId(source.kind), frame: { ...source.frame, x: source.frame.x + 0.02, y: source.frame.y + 0.02 } } as PageElement
    withElements([...page.elements, copy])
    setSelectedId(copy.id)
  }
  const remove = (id: Id) => {
    withElements(page.elements.filter((e) => e.id !== id))
    setSelectedId(null)
  }
  const reorder = (id: Id, to: 'front' | 'forward' | 'backward' | 'back') => {
    const from = page.elements.findIndex((e) => e.id === id)
    const last = page.elements.length - 1
    const target = { front: last, forward: Math.min(last, from + 1), backward: Math.max(0, from - 1), back: 0 }[to]
    if (from < 0 || target === from) return
    const elements = [...page.elements]
    const [moved] = elements.splice(from, 1)
    elements.splice(target, 0, moved!)
    withElements(elements)
  }
  const align = (id: Id, where: 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom') => {
    const e = page.elements.find((x) => x.id === id)!
    const f = e.frame
    const frame = { left: { ...f, x: 0 }, centre: { ...f, x: (1 - f.w) / 2 }, right: { ...f, x: 1 - f.w }, top: { ...f, y: 0 }, middle: { ...f, y: (1 - f.h) / 2 }, bottom: { ...f, y: 1 - f.h } }[where]
    updateElement(id, { frame })
  }

  const addPage = (source?: Page) => {
    const id = newId('page')
    const created = source
      ? { ...source, id, name: `${source.name} copy`, elements: source.elements.map((e) => ({ ...e, id: newId(e.kind) })) }
      : newPage(id, `Page ${deck.pages.length + 1}`)
    edit({ type: 'presentation.addPage', page: created, afterPageId: page.id })
    setPageId(id)
    setSelectedId(null)
  }
  const removePage = () => {
    const neighbour = deck.pages[pageIndex + 1] ?? deck.pages[pageIndex - 1]
    edit({ type: 'presentation.removePage', pageId: page.id })
    setPageId(neighbour?.id ?? null)
    setSelectedId(null)
  }

  /** Drags move or resize the element locally and save once, on release, as one undo step. */
  const startDrag = (event: ReactPointerEvent, target: PageElement, handle: Handle | null) => {
    if (event.button !== 0) return
    event.stopPropagation()
    setSelectedId(target.id)
    stage.current?.parentElement?.focus()
    if (target.isLocked) return
    const rect = stage.current!.getBoundingClientRect()
    const origin = { x: event.clientX, y: event.clientY }
    const start = target.frame
    const others = page.elements.filter((e) => e.id !== target.id && !e.isHidden)
    const xs = [0, 0.5, 1, ...others.flatMap((e) => [e.frame.x, e.frame.x + e.frame.w / 2, e.frame.x + e.frame.w])]
    const ys = [0, 0.5, 1, ...others.flatMap((e) => [e.frame.y, e.frame.y + e.frame.h / 2, e.frame.y + e.frame.h])]
    let hasMoved = false
    const onMove = (move: PointerEvent) => {
      const dx = (move.clientX - origin.x) / rect.width
      const dy = (move.clientY - origin.y) / rect.height
      if (!hasMoved && Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < 3) return
      hasMoved = true
      const { frame, guides: found } = handle ? resize(start, handle, dx, dy, move.shiftKey, xs, ys) : drag(start, dx, dy, move.altKey ? [] : xs, move.altKey ? [] : ys)
      setGuides(found)
      const current = latest.current!
      setDraft({ ...current, elements: current.elements.map((e) => (e.id === target.id ? { ...e, frame } : e)) })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setGuides(noGuides)
      if (hasMoved && latest.current) edit({ type: 'presentation.setPage', page: latest.current })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('input, textarea, select')) return
    const isCommand = isMac ? event.metaKey : event.ctrlKey
    const key = event.key.toLowerCase()
    if (isCommand && key === 'z') {
      event.preventDefault()
      return dispatch({ type: event.shiftKey ? 'document.redo' : 'document.undo', ref })
    }
    if (isCommand && key === 'y') return event.preventDefault(), dispatch({ type: 'document.redo', ref })
    if (isCommand && key === 'v' && clipboard.current) {
      event.preventDefault()
      return duplicate(clipboard.current)
    }
    if (!element) return
    const step = event.shiftKey ? 0.02 : 0.005
    const nudge: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }
    if (nudge[key] && !element.isLocked) {
      event.preventDefault()
      const [dx, dy] = nudge[key]
      return updateElement(element.id, { frame: { ...element.frame, x: element.frame.x + dx, y: element.frame.y + dy } })
    }
    if (key === 'delete' || key === 'backspace') return event.preventDefault(), remove(element.id)
    if (key === 'escape') return setSelectedId(null)
    if (isCommand && key === 'd') return event.preventDefault(), duplicate(element)
    if (isCommand && key === 'c') return void (clipboard.current = element)
    if (key === ']') return reorder(element.id, event.shiftKey ? 'front' : 'forward')
    if (key === '[') return reorder(element.id, event.shiftKey ? 'back' : 'backward')
  }

  const target: AddTarget = { service: snapshot.service, afterItemId: snapshot.state.selectedItemId, afterTitle: snapshot.decks.find((d) => d.itemId === snapshot.state.selectedItemId)?.title ?? '', isOpen: true }
  const isUsed = snapshot.services.length > 0 && snapshot.service.items.some((i) => i.type === 'presentation' && i.presentationId === presentationId)

  return (
    <div className="slide-editor">
      <div className="slide-editor-head">
        <CommitField label="Slides title" className="slide-title-field" value={deck.title} onCommit={(title) => edit({ type: 'presentation.setTitle', title })} />
        <label className="check">
          <input type="checkbox" checked={deck.isLooping} onChange={(e) => edit({ type: 'presentation.setLooping', isLooping: e.target.checked })} />
          Loop after the last page
        </label>
        <span className="spacer" />
        <button className="button-quiet button-small" disabled={!canUndo} onClick={() => dispatch({ type: 'document.undo', ref })}>
          Undo
        </button>
        <button className="button-quiet button-small" disabled={!canRedo} onClick={() => dispatch({ type: 'document.redo', ref })}>
          Redo
        </button>
        <button className="button-quiet button-small" onClick={() => dispatch({ type: 'instant.show', source: { type: 'presentation', presentationId }, index: pageIndex, isLive: true })}>
          Show this page now
        </button>
        <button className="button-small button-accent" onClick={() => addInstantToService({ type: 'presentation', presentationId }, deck.title, target)}>
          {isUsed ? 'Add again to the service' : 'Add to the service'}
        </button>
        {isConfirmingDelete ? (
          <span className="confirm-row">
            <span className="muted">{isUsed ? 'Remove it from the service first.' : 'Delete these slides?'}</span>
            {!isUsed && (
              <button className="button-small button-danger" onClick={() => (dispatch({ type: 'presentation.delete', presentationId }), onDeleted())}>
                Delete
              </button>
            )}
            <button className="button-quiet button-small" onClick={() => setConfirmingDelete(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button className="button-quiet button-small is-destructive" onClick={() => setConfirmingDelete(true)}>
            Delete…
          </button>
        )}
      </div>

      <div className="slide-editor-body">
        <ol className="page-strip" aria-label="Pages">
          {deck.pages.map((p, index) => (
            <li key={p.id}>
              <button className={`page-thumb${p.id === page.id ? ' is-selected' : ''}`} aria-current={p.id === page.id ? 'true' : undefined} onClick={() => (setPageId(p.id), setSelectedId(null))}>
                <RenderView key={JSON.stringify(p)} className="page-thumb-screen" isStatic render={pageView(p, media, `thumb-${p.id}`)} />
                <span className="page-thumb-name">
                  {index + 1}. {p.name}
                  {p.advanceAfter !== null && <span className="muted"> · {p.advanceAfter}s</span>}
                </span>
              </button>
            </li>
          ))}
          <li className="page-strip-actions">
            <button className="button-small" onClick={() => addPage()}>
              + Page
            </button>
            <button className="button-quiet button-small" onClick={() => addPage(page)}>
              Duplicate
            </button>
            <button className="button-quiet button-small" disabled={pageIndex === 0} aria-label="Move page up" onClick={() => edit({ type: 'presentation.movePage', pageId: page.id, toIndex: pageIndex - 1 })}>
              ↑
            </button>
            <button className="button-quiet button-small" disabled={pageIndex === deck.pages.length - 1} aria-label="Move page down" onClick={() => edit({ type: 'presentation.movePage', pageId: page.id, toIndex: pageIndex + 1 })}>
              ↓
            </button>
            <button className="button-quiet button-small is-destructive" disabled={deck.pages.length === 1} onClick={removePage}>
              Delete page
            </button>
          </li>
        </ol>

        <div className="slide-canvas-column">
          <div className="slide-toolbar" role="toolbar" aria-label="Insert and arrange">
            <span className="panel-title">Insert</span>
            {elementKinds.map((k) => (
              <button key={k.key} className="button-quiet button-small" onClick={() => insert(k.key)}>
                {k.label}
              </button>
            ))}
            <span className="spacer" />
            <button className="button-quiet button-small" onClick={() => setPlayCount((n) => n + 1)} title="Play the entrances and motion once more">
              ▶ Preview
            </button>
          </div>
          {element && (
            <div className="slide-toolbar is-arrange" role="toolbar" aria-label="Arrange the selected element">
              <span className="panel-title">{describe(element)}</span>
              {(['left', 'centre', 'right', 'top', 'middle', 'bottom'] as const).map((where) => (
                <button key={where} className="button-quiet button-small" disabled={element.isLocked} onClick={() => align(element.id, where)}>
                  {where[0]!.toUpperCase() + where.slice(1)}
                </button>
              ))}
              <span className="toolbar-gap" />
              <button className="button-quiet button-small" onClick={() => reorder(element.id, 'front')}>
                To front
              </button>
              <button className="button-quiet button-small" onClick={() => reorder(element.id, 'back')}>
                To back
              </button>
              <button className="button-quiet button-small" onClick={() => duplicate(element)}>
                Duplicate
              </button>
              <button className="button-quiet button-small is-destructive" onClick={() => remove(element.id)}>
                Delete
              </button>
            </div>
          )}
          <div className="slide-stage-wrap" tabIndex={0} aria-label="Page canvas" onKeyDown={onKeyDown} onPointerDown={() => setSelectedId(null)}>
            <div className="slide-stage" ref={stage}>
              <RenderView key={`${page.id}-${playCount}`} className="slide-stage-screen" isStatic={playCount === 0} render={pageView(page, media)} />
              <div className="slide-handles">
                {page.elements.map((e) =>
                  e.isHidden ? null : (
                    <div
                      key={e.id}
                      className={`slide-box${e.id === selectedId ? ' is-selected' : ''}${e.isLocked ? ' is-locked' : ''}`}
                      style={boxStyle(e.frame, e.rotation)}
                      role="button"
                      aria-label={`Select ${e.name || describe(e)}`}
                      tabIndex={-1}
                      onPointerDown={(event) => startDrag(event, e, null)}
                      onDoubleClick={() => document.querySelector<HTMLElement>('.slide-inspector textarea')?.focus()}
                    >
                      {e.id === selectedId &&
                        !e.isLocked &&
                        handles.map((h) => <span key={h} className={`slide-handle is-${h}`} onPointerDown={(event) => startDrag(event, e, h)} />)}
                    </div>
                  ),
                )}
                {guides.x.map((x) => (
                  <span key={`x${x}`} className="slide-guide is-vertical" style={{ left: `${x * 100}%` }} />
                ))}
                {guides.y.map((y) => (
                  <span key={`y${y}`} className="slide-guide is-horizontal" style={{ top: `${y * 100}%` }} />
                ))}
              </div>
            </div>
          </div>
          <p className="slide-hint muted">
            Drag to move, drag a corner to resize (Shift keeps the shape, Alt turns off snapping). Arrows nudge, {isMac ? '⌘' : 'Ctrl'} D duplicates, [ and ] change the order, Delete removes.
          </p>
        </div>

        <SlideInspector page={page} element={element} media={media} onPage={commit} onElement={(patch) => element && updateElement(element.id, patch)} onSelect={setSelectedId} />
      </div>
    </div>
  )
}

function boxStyle(frame: Rect01, rotation: number): CSSProperties {
  return { left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.w * 100}%`, height: `${frame.h * 100}%`, transform: rotation ? `rotate(${rotation}deg)` : undefined }
}

/** The nearest snap target within reach, as the shift that lands on it. */
function nearest(edges: number[], targets: number[]): { shift: number; guide: number } | null {
  let best: { shift: number; guide: number } | null = null
  for (const edge of edges) {
    for (const target of targets) {
      const shift = target - edge
      if (Math.abs(shift) <= snapDistance && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, guide: target }
    }
  }
  return best
}

function drag(start: Rect01, dx: number, dy: number, xs: number[], ys: number[]): { frame: Rect01; guides: Guides } {
  const frame = { ...start, x: start.x + dx, y: start.y + dy }
  const sx = nearest([frame.x, frame.x + frame.w / 2, frame.x + frame.w], xs)
  const sy = nearest([frame.y, frame.y + frame.h / 2, frame.y + frame.h], ys)
  return { frame: { ...frame, x: frame.x + (sx?.shift ?? 0), y: frame.y + (sy?.shift ?? 0) }, guides: { x: sx ? [sx.guide] : [], y: sy ? [sy.guide] : [] } }
}

function resize(start: Rect01, handle: Handle, dx: number, dy: number, keepShape: boolean, xs: number[], ys: number[]): { frame: Rect01; guides: Guides } {
  const min = 0.01
  let { x, y, w, h } = start
  if (handle.includes('e')) w = start.w + dx
  if (handle.includes('w')) (x = start.x + dx), (w = start.w - dx)
  if (handle.includes('s')) h = start.h + dy
  if (handle.includes('n')) (y = start.y + dy), (h = start.h - dy)
  const guides: Guides = { x: [], y: [] }
  const sx = handle.includes('e') ? nearest([x + w], xs) : handle.includes('w') ? nearest([x], xs) : null
  if (sx) {
    if (handle.includes('e')) w += sx.shift
    else (x += sx.shift), (w -= sx.shift)
    guides.x.push(sx.guide)
  }
  const sy = handle.includes('s') ? nearest([y + h], ys) : handle.includes('n') ? nearest([y], ys) : null
  if (sy) {
    if (handle.includes('s')) h += sy.shift
    else (y += sy.shift), (h -= sy.shift)
    guides.y.push(sy.guide)
  }
  if (keepShape && handle.length === 2) {
    const ratio = start.w / start.h
    const height = w / ratio
    if (handle.includes('n')) y += h - height
    h = height
  }
  return { frame: { x: w < min ? x + w - min : x, y: h < min ? y + h - min : y, w: Math.max(min, w), h: Math.max(min, h) }, guides }
}
