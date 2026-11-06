import type { CSSProperties } from 'react'
import { itemKinds, newId, type Id, type ItemKind, type ServiceTemplate, type TemplateEdit } from '@openstage/shared'
import { dispatch } from '../engine'
import { CommitField } from '../edit/CommitField'
import { NumberField } from '../edit/ThemeFields'

interface TemplatePanelProps {
  templates: ServiceTemplate[]
  selectedId: Id | null
  onSelect: (templateId: Id) => void
  onNewService: () => void
}

/** Templates are linked: editing one updates every service from today on that still follows it. */
export function TemplatePanel({ templates, selectedId, onSelect, onNewService }: TemplatePanelProps) {
  const selected = templates.find((t) => t.id === selectedId)
  const create = () => {
    const templateId = newId('template')
    dispatch({ type: 'template.create', templateId, name: 'New template' })
    onSelect(templateId)
  }
  return (
    <aside className="inspector template-panel" aria-label="Service templates">
      <div className="inspector-head">
        <span className="panel-title">Service templates</span>
        <button className="button-quiet button-small" onClick={create}>
          + Template
        </button>
      </div>
      <ul className="template-list">
        {templates.map((t) => {
          const minutes = t.slots.reduce((sum, s) => sum + s.minutes, 0)
          return (
            <li key={t.id}>
              <button className={`template-row${t.id === selectedId ? ' is-selected' : ''}`} style={{ '--template': t.color } as CSSProperties} onClick={() => onSelect(t.id)}>
                <span className="template-bar" aria-hidden="true" />
                <span className="template-name">{t.name}</span>
                <span className="muted">
                  {t.slots.length} items · {minutes} min
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {selected && <TemplateEditor key={selected.id} template={selected} onNewService={onNewService} />}
    </aside>
  )
}

function TemplateEditor({ template, onNewService }: { template: ServiceTemplate; onNewService: () => void }) {
  const edit = (change: TemplateEdit) => dispatch({ type: 'template.edit', templateId: template.id, edit: change })
  const minutes = template.slots.reduce((sum, s) => sum + s.minutes, 0)
  const addSlot = () => edit({ type: 'template.addSlot', slot: { id: newId('slot'), kind: 'song', title: 'Song', rule: 'Pick on the day', minutes: 5 } })
  return (
    <div className="template-editor">
      <div className="template-editor-head">
        <CommitField className="template-title" label="Template name" value={template.name} onCommit={(name) => edit({ type: 'template.setDetails', name })} />
        <span className="muted">{minutes} min</span>
      </div>
      <ol className="slot-list">
        {template.slots.map((slot, index) => (
          <li key={slot.id} className="slot-row">
            <select aria-label={`Kind of ${slot.title}`} className="slot-kind" value={slot.kind} onChange={(e) => edit({ type: 'template.updateSlot', slotId: slot.id, changes: { kind: e.target.value as ItemKind } })}>
              {itemKinds.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.badge} · {k.label}
                </option>
              ))}
            </select>
            <span className="slot-text">
              <CommitField label="Step title" value={slot.title} onCommit={(title) => edit({ type: 'template.updateSlot', slotId: slot.id, changes: { title } })} />
              <CommitField label={`Rule for ${slot.title}`} className="slot-rule" value={slot.rule} placeholder="Rule, like “Pick on the day”" onCommit={(rule) => edit({ type: 'template.updateSlot', slotId: slot.id, changes: { rule } })} />
            </span>
            <NumberField label={`Minutes for ${slot.title}`} min={1} max={240} value={slot.minutes} suffix="min" onCommit={(n) => edit({ type: 'template.updateSlot', slotId: slot.id, changes: { minutes: n } })} />
            <span className="slot-actions">
              <button className="icon-button" aria-label={`Move ${slot.title} up`} disabled={index === 0} onClick={() => edit({ type: 'template.moveSlot', slotId: slot.id, toIndex: index - 1 })}>
                ↑
              </button>
              <button className="icon-button" aria-label={`Remove ${slot.title}`} onClick={() => edit({ type: 'template.removeSlot', slotId: slot.id })}>
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="template-actions">
        <button className="button-quiet button-small" onClick={addSlot}>
          + Step
        </button>
        <button className="button-primary" onClick={onNewService}>
          New service from this
        </button>
      </div>
      <span className="inspector-note">Changes reach every service from today on that came from this template, except items you changed by hand.</span>
    </div>
  )
}
