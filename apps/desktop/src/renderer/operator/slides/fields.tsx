import { useRef } from 'react'
import { fontFamilies, type Id, type MediaItem, type TextStyle } from '@openstage/shared'
import { CommitField } from '../edit/CommitField'
import { ColorField, FieldRow, NumberField, parseColor, withAlpha } from '../edit/ThemeFields'
import { importMediaFiles } from '../library/media'

interface SelectFieldProps<T extends string | number> {
  label: string
  value: T
  options: readonly { key: T; label: string }[]
  onChange: (value: T) => void
}

export function SelectField<T extends string | number>({ label, value, options, onChange }: SelectFieldProps<T>) {
  return (
    <FieldRow label={label}>
      <select aria-label={label} value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.key) === e.target.value)!.key)}>
        {options.map((o) => (
          <option key={String(o.key)} value={String(o.key)}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  )
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="check slide-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

interface NumberRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}

export function NumberRow({ label, value, min, max, step, suffix, onChange }: NumberRowProps) {
  return (
    <FieldRow label={label}>
      <NumberField label={label} value={value} min={min} max={max} step={step} suffix={suffix} onCommit={onChange} />
    </FieldRow>
  )
}

/** A fraction stored 0..1 and edited as a percentage, rounded to one decimal. */
export function PercentRow({ label, value, min = 0, max = 100, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <NumberRow label={label} value={Math.round(value * 1000) / 10} min={min} max={max} step={0.5} suffix="%" onChange={(v) => onChange(v / 100)} />
}

/** A colour with its opacity, stored as `#rrggbb` or `rgba(...)`. */
export function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { hex, alpha } = parseColor(value)
  return (
    <FieldRow label={label}>
      <ColorField label={label} value={hex} onCommit={(next) => onChange(withAlpha(next, alpha))} />
      <NumberField label={`${label} opacity`} value={Math.round(alpha * 100)} min={0} max={100} suffix="%" onCommit={(next) => onChange(withAlpha(hex, next / 100))} />
    </FieldRow>
  )
}

export function TextRow({ label, value, isMultiline = false, onChange }: { label: string; value: string; isMultiline?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="slide-text-field">
      <span className="inspector-label">{label}</span>
      <CommitField label={label} value={value} isMultiline={isMultiline} onCommit={onChange} />
    </label>
  )
}

const weights = [
  { key: 300, label: 'Light' },
  { key: 400, label: 'Regular' },
  { key: 500, label: 'Medium' },
  { key: 600, label: 'Semibold' },
  { key: 700, label: 'Bold' },
  { key: 800, label: 'Extra bold' },
  { key: 900, label: 'Black' },
] as const

const aligns = [
  { key: 'left', label: 'Left' },
  { key: 'center', label: 'Centre' },
  { key: 'right', label: 'Right' },
] as const

const valigns = [
  { key: 'top', label: 'Top' },
  { key: 'middle', label: 'Middle' },
  { key: 'bottom', label: 'Bottom' },
] as const

const families = fontFamilies.map((f) => ({ key: f.key as string, label: f.label }))

/** Every text setting a text, clock or scrolling element has. */
export function TextStyleFields({ style, onChange }: { style: TextStyle; onChange: (patch: Partial<TextStyle>) => void }) {
  return (
    <>
      <SelectField label="Font" value={style.family} options={families.some((f) => f.key === style.family) ? families : [...families, { key: style.family, label: style.family }]} onChange={(family) => onChange({ family })} />
      <SelectField label="Weight" value={style.weight} options={weights} onChange={(weight) => onChange({ weight })} />
      <NumberRow label="Size" value={Math.round(style.size * 1000) / 10} min={1} max={50} step={0.5} suffix="% of height" onChange={(v) => onChange({ size: v / 100 })} />
      <ColorRow label="Colour" value={style.color} onChange={(color) => onChange({ color })} />
      <SelectField label="Align" value={style.align} options={aligns} onChange={(align) => onChange({ align })} />
      <SelectField label="Vertical" value={style.valign} options={valigns} onChange={(valign) => onChange({ valign })} />
      <NumberRow label="Line height" value={style.lineHeight} min={0.7} max={3} step={0.05} onChange={(lineHeight) => onChange({ lineHeight })} />
      <NumberRow label="Letter spacing" value={style.letterSpacing} min={-0.2} max={1} step={0.01} suffix="em" onChange={(letterSpacing) => onChange({ letterSpacing })} />
      <div className="slide-checks">
        <CheckField label="Italic" value={style.isItalic} onChange={(isItalic) => onChange({ isItalic })} />
        <CheckField label="Capitals" value={style.isUppercase} onChange={(isUppercase) => onChange({ isUppercase })} />
        <CheckField label="Shadow" value={style.hasShadow} onChange={(hasShadow) => onChange({ hasShadow })} />
        <CheckField label="Band behind" value={style.backing !== null} onChange={(isOn) => onChange({ backing: isOn ? 'rgba(0, 0, 0, 0.6)' : null })} />
      </div>
      {style.backing !== null && <ColorRow label="Band colour" value={style.backing} onChange={(backing) => onChange({ backing })} />}
    </>
  )
}

interface MediaPickerProps {
  label: string
  type: MediaItem['type']
  media: MediaItem[]
  value: Id
  onChange: (mediaId: Id) => void
}

/** Picks an image or video from the media library, or adds a new file and picks it straight away. */
export function MediaPicker({ label, type, media, value, onChange }: MediaPickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const choices = media.filter((m) => m.type === type)
  return (
    <FieldRow label={label}>
      <select aria-label={label} value={choices.some((m) => m.id === value) ? value : ''} onChange={(e) => e.target.value && onChange(e.target.value)}>
        <option value="">{choices.length === 0 ? `No ${type}s yet` : `Choose ${type === 'image' ? 'an image' : 'a video'}`}</option>
        {choices.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button className="button-quiet button-small" onClick={() => input.current?.click()}>
        Add…
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={`${type}/*`}
        onChange={async (e) => {
          const [mediaId] = await importMediaFiles([...(e.target.files ?? [])])
          e.target.value = ''
          if (mediaId) onChange(mediaId)
        }}
      />
    </FieldRow>
  )
}
