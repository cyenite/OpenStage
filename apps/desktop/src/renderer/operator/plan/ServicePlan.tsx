import { useState } from 'react'
import {
  forecast,
  itemKind,
  itemKinds,
  itemMinutes,
  newId,
  serviceStart,
  type HeadingKind,
  type ItemChanges,
  type OperatorSnapshot,
  type Service,
  type ServiceEdit,
  type ServiceItem,
  type SongOutline,
  type Theme,
} from '@openstage/shared'
import { dispatch, useDocument, useLibraryQuery, useSongOutlines } from '../engine'
import { CommitField } from '../edit/CommitField'
import { languageName } from '../edit/languages'
import { ReferenceInput } from '../edit/ReferenceInput'
import { NumberField } from '../edit/ThemeFields'
import { clockTime, longDay } from './dates'

interface ServicePlanProps {
  serviceId: string
  snapshot: OperatorSnapshot
  onBack: () => void
  onPresent: () => void
}

const headingKinds = itemKinds.filter((k) => k.key !== 'song' && k.key !== 'scripture')

/** The order of one service: fill placeholders, add parts, set lengths, notes and per-item overrides. */
export function ServicePlan({ serviceId, snapshot, onBack, onPresent }: ServicePlanProps) {
  const { document: service, canUndo, canRedo, isLoaded } = useDocument('services', serviceId)
  const revision = snapshot.libraryRevision
  const songs = useLibraryQuery({ type: 'library.list', kind: 'songs' }, revision)
  const passages = useLibraryQuery({ type: 'library.list', kind: 'passages' }, revision)
  const outlines = useSongOutlines(service?.items.flatMap((i) => (i.type === 'song' ? [i.songId] : [])) ?? [], revision)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [headingKind, setHeadingKind] = useState<HeadingKind>('sermon')
  const [isConfirmingDelete, setConfirmingDelete] = useState(false)

  if (!service) return <div className="editor-empty">{isLoaded ? 'This service is no longer in the library.' : 'Opening…'}</div>

  const edit = (change: ServiceEdit) => dispatch({ type: 'service.edit', serviceId, edit: change })
  const ref = { kind: 'services', id: serviceId } as const
  const isOpen = snapshot.service.id === serviceId
  const plan = forecast(service, null, null, Date.now())
  const start = serviceStart(service)
  const titleOf = (item: ServiceItem) => {
    if (item.type === 'heading' || item.type === 'slot') return item.title
    if (item.type === 'song') return outlines.find((o) => o.id === item.songId)?.title ?? songs.find((s) => s.id === item.songId)?.title ?? 'Missing song'
    return passages.find((p) => p.id === item.passageId)?.title ?? 'Missing passage'
  }

  return (
    <div className="service-plan">
      <div className="editor-head">
        <button className="button-quiet button-small" onClick={onBack}>
          ‹ Calendar
        </button>
        <div className="editor-title">
          <CommitField className="title-field" label="Service name" value={service.name} onCommit={(name) => edit({ type: 'service.setDetails', name })} />
          <span className="muted">
            {service.items.length} items · {plan.plannedMinutes} min{start !== null && plan.plannedEnd !== null ? ` · ${clockTime(start)} to ${clockTime(plan.plannedEnd)}` : ''}
          </span>
        </div>
        <div className="editor-actions">
          <input type="date" aria-label="Service date" value={service.date ?? ''} onChange={(e) => e.target.value && edit({ type: 'service.setDetails', date: e.target.value })} />
          <input type="time" aria-label="Start time" value={service.time ?? ''} onChange={(e) => e.target.value && edit({ type: 'service.setDetails', time: e.target.value })} />
          <button className="icon-button" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={() => dispatch({ type: 'document.undo', ref })}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></svg>
          </button>
          <button className="icon-button" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={() => dispatch({ type: 'document.redo', ref })}>
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></svg>
          </button>
          {isConfirmingDelete ? (
            <button className="button-danger" onClick={() => (dispatch({ type: 'service.delete', serviceId }), onBack())}>
              Delete service
            </button>
          ) : (
            <button className="button-quiet" disabled={isOpen} title={isOpen ? 'Open another service in Present first' : undefined} onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
          <button className="button-primary" onClick={onPresent}>
            {isOpen ? 'Back to Present' : 'Open to present'}
          </button>
        </div>
      </div>
      {service.date && <span className="muted">{longDay(service.date)}</span>}

      <ol className="plan-items">
        {service.items.map((item, index) => (
          <li
            key={item.id}
            className={`plan-item${dragFrom === index ? ' is-dragging' : ''}${item.type === 'slot' ? ' is-open' : ''}`}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragEnd={() => setDragFrom(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragFrom !== null && dragFrom !== index && edit({ type: 'service.moveItem', itemId: service.items[dragFrom]!.id, toIndex: index })}
          >
            <PlanItem
              item={item}
              title={titleOf(item)}
              index={index}
              count={service.items.length}
              themes={snapshot.library.themes}
              outline={item.type === 'song' ? outlines.find((o) => o.id === item.songId) : undefined}
              songs={songs.map((s) => ({ id: s.id, title: s.title }))}
              service={service}
              onEdit={edit}
            />
          </li>
        ))}
      </ol>

      <div className="plan-add">
        <span className="panel-title">Add</span>
        <select aria-label="Add a song" value="" onChange={(e) => e.target.value && edit({ type: 'service.addSong', itemId: newId('song'), songId: e.target.value })}>
          <option value="">+ Song</option>
          {songs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <ReferenceInput
          className="plan-reference"
          label="Add a passage"
          placeholder="+ Passage: jn 3 16"
          onSubmit={(passageRef, text) => {
            const passageId = newId(text)
            dispatch({ type: 'passage.create', passageId, ref: passageRef, translations: service.translations ?? [] })
            edit({ type: 'service.addPassage', itemId: newId(text), passageId })
          }}
        />
        <select aria-label="Kind of part to add" value={headingKind} onChange={(e) => setHeadingKind(e.target.value as HeadingKind)}>
          {headingKinds.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          className="button-quiet button-small"
          onClick={() => edit({ type: 'service.addHeading', itemId: newId(headingKind), kind: headingKind, title: itemKinds.find((k) => k.key === headingKind)!.label })}
        >
          + Part
        </button>
      </div>
    </div>
  )
}

interface PlanItemProps {
  item: ServiceItem
  title: string
  index: number
  count: number
  themes: Theme[]
  songs: { id: string; title: string }[]
  outline: SongOutline | undefined
  service: Service
  onEdit: (edit: ServiceEdit) => void
}

function PlanItem({ item, title, index, count, themes, songs, outline, service, onEdit }: PlanItemProps) {
  const kind = itemKinds.find((k) => k.key === itemKind(item))!
  const update = (changes: ItemChanges) => onEdit({ type: 'service.updateItem', itemId: item.id, changes })
  const move = (to: number) => onEdit({ type: 'service.moveItem', itemId: item.id, toIndex: to })
  const languages = item.type === 'song' ? item.languages ?? outline?.languages ?? [] : []
  return (
    <div
      className="plan-item-body"
      onKeyDown={(e) => {
        if (e.altKey && e.key === 'ArrowUp' && index > 0) move(index - 1)
        if (e.altKey && e.key === 'ArrowDown' && index < count - 1) move(index + 1)
      }}
    >
      <span className="order-kind" title={kind.label}>
        {kind.badge}
      </span>
      <div className="plan-item-main">
        <div className="plan-item-title">
          {item.type === 'heading' || item.type === 'slot' ? (
            <CommitField label="Item title" value={item.title} onCommit={(t) => update({ title: t })} />
          ) : (
            <strong>{title}</strong>
          )}
          {item.isLinked && <span className="linked-tag" title="Follows its template step until you change it">template</span>}
        </div>
        {item.type === 'slot' && (
          <div className="slot-fill">
            <span className="muted">{item.rule || `Choose a ${item.kind}`}</span>
            {item.kind === 'song' ? (
              <select aria-label={`Choose the song for ${item.title}`} value="" onChange={(e) => e.target.value && onEdit({ type: 'service.fillSlot', itemId: item.id, songId: e.target.value })}>
                <option value="">Choose a song…</option>
                {songs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            ) : (
              <ReferenceInput
                label={`Passage for ${item.title}`}
                placeholder="Type a reference and Enter"
                onSubmit={(ref, text) => {
                  const passageId = newId(text)
                  dispatch({ type: 'passage.create', passageId, ref, translations: service.translations ?? [] })
                  onEdit({ type: 'service.fillSlot', itemId: item.id, passageId })
                }}
              />
            )}
          </div>
        )}
        {item.type === 'song' && outline && (
          <div className="item-overrides">
            {outline.arrangements.length > 1 && (
              <select aria-label={`Arrangement of ${title}`} value={item.arrangementId} onChange={(e) => update({ arrangementId: e.target.value })}>
                {outline.arrangements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
            {outline.languages.length > 1 && (
              <select
                aria-label={`Language order of ${title}`}
                value={languages.join(',')}
                onChange={(e) => update({ languages: e.target.value === outline.languages.join(',') ? null : e.target.value.split(',') })}
              >
                {[outline.languages, [...outline.languages].reverse(), [outline.languages[0]!], [outline.languages[1]!]].map((order) => (
                  <option key={order.join(',')} value={order.join(',')}>
                    {order.map(languageName).join(order.length > 1 ? ', then ' : '')}
                    {order.length === 1 ? ' only' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <CommitField className="item-notes" label={`Notes for ${title}`} value={item.notes ?? ''} placeholder="Notes for the stage screen" onCommit={(notes) => update({ notes })} />
      </div>
      <div className="plan-item-side">
        <NumberField label={`Minutes for ${title}`} min={0.5} max={600} step={0.5} value={itemMinutes(item)} suffix="min" onCommit={(n) => update({ minutes: n })} />
        <select aria-label={`Theme for ${title}`} value={item.themeId ?? ''} onChange={(e) => update({ themeId: e.target.value || null })}>
          <option value="">Usual theme</option>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="icon-button" aria-label={`Remove ${title}`} onClick={() => onEdit({ type: 'service.removeItem', itemId: item.id })}>
          ×
        </button>
      </div>
    </div>
  )
}

