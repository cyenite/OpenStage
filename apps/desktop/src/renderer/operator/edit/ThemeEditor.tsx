import { useState } from 'react'
import { fontFamilies, themeBoxRoles, type BackgroundRender, type DeckSlide, type Id, type Service, type Theme, type ThemeBoxRole, type ThemeEdit } from '@openstage/shared'
import { RenderView } from '../components/RenderView'
import { dispatch, useDocument } from '../engine'
import { CommitField } from './CommitField'
import { ColorField, FieldRow, NumberField, parseColor, withAlpha } from './ThemeFields'
import { previewBackground, previewRender } from './preview'

interface ThemeEditorProps {
  themeId: Id
  uses: number
  service: Service
  onDeleted: () => void
}

const fillKinds = [
  { key: 'none', label: 'None' },
  { key: 'color', label: 'Colour' },
  { key: 'gradient', label: 'Gradient' },
] as const

const weights = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra bold' },
] as const

const frameFields = [
  { key: 'x', label: 'Left' },
  { key: 'y', label: 'Top' },
  { key: 'w', label: 'Width' },
  { key: 'h', label: 'Height' },
] as const

const aligns = [
  { key: 'left', label: 'Left' },
  { key: 'center', label: 'Centre' },
  { key: 'right', label: 'Right' },
] as const

export function ThemeEditor({ themeId, uses, service, onDeleted }: ThemeEditorProps) {
  const { document: theme, canUndo, canRedo, isLoaded } = useDocument('themes', themeId)
  const [role, setRole] = useState<ThemeBoxRole>('main')
  const [hasSecondary, setHasSecondary] = useState(true)
  const [hasReference, setHasReference] = useState(false)
  const [isConfirmingDelete, setConfirmingDelete] = useState(false)

  if (!theme) return <div className="editor-empty">{isLoaded ? 'This theme is no longer in the library.' : 'Opening…'}</div>

  const edit = (change: ThemeEdit) => dispatch({ type: 'theme.edit', themeId, edit: change })
  const ref = { kind: 'themes', id: themeId } as const
  const isServiceTheme = service.themeId === themeId
  const sample: DeckSlide = {
    kind: 'verse',
    label: 'Verse 1',
    lines: ['Amazing grace, how sweet the sound', 'That saved a wretch like me'],
    secondaryLines: hasSecondary ? ['The second language shows here,', 'under the main lines'] : [],
    reference: hasReference ? 'John 3:16 KJV · WEB' : '',
  }

  return (
    <div className="song-editor theme-editor">
      <div className="editor-content">
        <div className="editor-head">
          <div className="editor-title">
            <CommitField className="title-field" label="Theme name" value={theme.name} onCommit={(name) => edit({ type: 'theme.setName', name })} />
            <span className="muted">
              {uses === 0 ? 'Not used yet' : uses === 1 ? 'Used by 1 song or service' : `Used by ${uses} songs and services`}
              {isServiceTheme ? ', including this service' : ''} · changes save automatically and update everything using it
            </span>
          </div>
          <div className="editor-actions">
            <button className="icon-button" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={() => dispatch({ type: 'document.undo', ref })}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></svg>
            </button>
            <button className="icon-button" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={() => dispatch({ type: 'document.redo', ref })}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></svg>
            </button>
            {isConfirmingDelete ? (
              <>
                <button className="button-danger" onClick={() => (dispatch({ type: 'theme.delete', themeId }), onDeleted())}>
                  Delete “{theme.name}”
                </button>
                <button className="button-quiet" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button
                className="button-quiet"
                disabled={uses > 0 || themeId === 'classic'}
                title={themeId === 'classic' ? 'The classic theme is the fallback and stays' : uses > 0 ? 'Songs or services still use it' : undefined}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            )}
            <button
              className="button-primary"
              disabled={isServiceTheme || !service.id}
              onClick={() => dispatch({ type: 'service.edit', serviceId: service.id, edit: { type: 'service.setTheme', themeId } })}
            >
              {isServiceTheme ? 'Used by this service' : 'Use for this service'}
            </button>
          </div>
        </div>

        <RenderView className="theme-preview" render={previewRender(theme, sample, previewBackground)} />
        <div className="preview-options" role="group" aria-label="Preview with">
          <label>
            <input type="checkbox" checked={hasSecondary} onChange={(e) => setHasSecondary(e.target.checked)} />
            Second language
          </label>
          <label>
            <input type="checkbox" checked={hasReference} onChange={(e) => setHasReference(e.target.checked)} />
            Scripture reference
          </label>
          <span className="muted">Without a second language, the main lines grow into its space.</span>
        </div>
      </div>

      <aside className="inspector" aria-label="Theme settings">
        <FillControls fill={theme.fill} onFill={(fill) => edit({ type: 'theme.setFill', fill })} />
        <div className="inspector-block">
          <span className="panel-title">Text</span>
          <div className="segmented" role="tablist" aria-label="Text box">
            {themeBoxRoles.map((r) => (
              <button key={r.key} role="tab" aria-selected={role === r.key} onClick={() => setRole(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
          <BoxControls key={role} theme={theme} role={role} onEdit={edit} />
        </div>
      </aside>
    </div>
  )
}

function FillControls({ fill, onFill }: { fill: BackgroundRender | null; onFill: (fill: BackgroundRender | null) => void }) {
  const kind = fill?.kind ?? 'none'
  const pick = (next: (typeof fillKinds)[number]['key']) => {
    if (next === 'none') onFill(null)
    else if (next === 'color') onFill({ kind: 'color', color: fill?.kind === 'gradient' ? fill.from : '#102033' })
    else onFill({ kind: 'gradient', from: fill?.kind === 'color' ? fill.color : '#22324A', to: '#0B1220', angle: 160 })
  }
  return (
    <div className="inspector-block">
      <span className="panel-title">Background</span>
      <div className="segmented" role="radiogroup" aria-label="Theme background">
        {fillKinds.map((k) => (
          <button key={k.key} role="radio" aria-checked={kind === k.key} aria-pressed={kind === k.key} onClick={() => pick(k.key)}>
            {k.label}
          </button>
        ))}
      </div>
      {fill === null && <span className="inspector-note">The background layer (the drawer’s backgrounds and videos) shows behind the text.</span>}
      {fill?.kind === 'color' && (
        <FieldRow label="Colour">
          <ColorField label="Background colour" value={fill.color} onCommit={(color) => onFill({ kind: 'color', color })} />
        </FieldRow>
      )}
      {fill?.kind === 'gradient' && (
        <>
          <FieldRow label="From">
            <ColorField label="Gradient start" value={fill.from} onCommit={(from) => onFill({ ...fill, from })} />
          </FieldRow>
          <FieldRow label="To">
            <ColorField label="Gradient end" value={fill.to} onCommit={(to) => onFill({ ...fill, to })} />
          </FieldRow>
          <FieldRow label="Angle">
            <NumberField label="Gradient angle" min={0} max={360} value={fill.angle} suffix="°" onCommit={(angle) => onFill({ ...fill, angle })} />
          </FieldRow>
        </>
      )}
    </div>
  )
}

interface BoxControlsProps {
  theme: Theme
  role: ThemeBoxRole
  onEdit: (edit: ThemeEdit) => void
}

function BoxControls({ theme, role, onEdit }: BoxControlsProps) {
  const box = theme.boxes[role]
  const set = (style: Extract<ThemeEdit, { type: 'theme.setBox' }>['style']) => onEdit({ type: 'theme.setBox', role, style })
  const percent = (n: number) => Math.round(n * 1000) / 10
  const backing = box.backing ? parseColor(box.backing) : null
  return (
    <div className="box-controls">
      <FieldRow label="Font">
        <select aria-label="Font" value={box.font.family} onChange={(e) => set({ font: { family: e.target.value } })}>
          {fontFamilies.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
          {!fontFamilies.some((f) => f.key === box.font.family) && <option value={box.font.family}>{box.font.family}</option>}
        </select>
      </FieldRow>
      <FieldRow label="Weight">
        <select aria-label="Weight" value={box.font.weight} onChange={(e) => set({ font: { weight: Number(e.target.value) } })}>
          {weights.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="Size">
        <NumberField label="Text size as a percentage of screen height" min={1} max={30} step={0.5} value={percent(box.font.size)} suffix="% of height" onCommit={(n) => set({ font: { size: n / 100 } })} />
      </FieldRow>
      <FieldRow label="Style">
        <label className="check">
          <input type="checkbox" checked={box.font.italic} onChange={(e) => set({ font: { italic: e.target.checked } })} />
          Italic
        </label>
        <label className="check">
          <input type="checkbox" checked={box.hasShadow} onChange={(e) => set({ hasShadow: e.target.checked })} />
          Shadow
        </label>
      </FieldRow>
      <FieldRow label="Align">
        <div className="segmented" role="radiogroup" aria-label="Alignment">
          {aligns.map((a) => (
            <button key={a.key} role="radio" aria-checked={box.align === a.key} aria-pressed={box.align === a.key} onClick={() => set({ align: a.key })}>
              {a.label}
            </button>
          ))}
        </div>
      </FieldRow>
      <FieldRow label="Colour">
        <ColorField label="Text colour" value={box.color} onCommit={(color) => set({ color })} />
      </FieldRow>
      <FieldRow label="Band">
        <label className="check">
          <input type="checkbox" checked={backing !== null} onChange={(e) => set({ backing: e.target.checked ? 'rgba(14, 14, 16, 0.78)' : null })} />
          Behind text
        </label>
        {backing && (
          <>
            <ColorField label="Band colour" value={box.backing!} onCommit={(hex) => set({ backing: withAlpha(hex, backing.alpha) })} />
            <NumberField label="Band opacity" min={5} max={100} value={Math.round(backing.alpha * 100)} suffix="%" onCommit={(n) => set({ backing: withAlpha(backing.hex, n / 100) })} />
          </>
        )}
      </FieldRow>
      <span className="panel-title box-position-title">Position, % of the screen</span>
      <div className="frame-grid">
        {frameFields.map((field) => (
          <label key={field.key}>
            <span>{field.label}</span>
            <NumberField label={`Box ${field.label.toLowerCase()}`} min={0} max={100} step={0.5} value={percent(box.frame[field.key])} onCommit={(n) => set({ frame: { [field.key]: n / 100 } })} />
          </label>
        ))}
      </div>
    </div>
  )
}
