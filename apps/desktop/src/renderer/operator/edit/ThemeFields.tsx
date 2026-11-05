import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Splits `#rrggbb` or `rgba(r, g, b, a)` into the hex a colour input needs and an opacity. */
export function parseColor(value: string): { hex: string; alpha: number } {
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value)
  if (rgba) {
    const hex = `#${rgba.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
    return { hex, alpha: rgba[4] === undefined ? 1 : Number(rgba[4]) }
  }
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (short) return { hex: `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase(), alpha: 1 }
  return { hex: /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7).toLowerCase() : '#ffffff', alpha: 1 }
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return alpha >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`
}

/**
 * A colour input that commits once, when the picker closes. React's onChange fires on every
 * drag of the picker, which would make one undo step per pixel.
 */
export function ColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (hex: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(parseColor(value).hex)
  const commit = useRef(onCommit)
  commit.current = onCommit

  useEffect(() => setDraft(parseColor(value).hex), [value])

  useEffect(() => {
    const element = input.current!
    const onChange = () => commit.current(element.value)
    element.addEventListener('change', onChange)
    return () => element.removeEventListener('change', onChange)
  }, [])

  return (
    <span className="color-field">
      <input ref={input} type="color" aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <span className="color-hex">{draft.toUpperCase()}</span>
    </span>
  )
}

interface NumberFieldProps {
  min: number
  max: number
  step?: number
  value: number
  label: string
  suffix?: string
  onCommit: (value: number) => void
}

export function NumberField({ min, max, step = 1, value, label, suffix, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const number = Number(draft)
    if (Number.isFinite(number) && number !== value) onCommit(Math.min(Math.max(number, min), max))
    else setDraft(String(value))
  }
  return (
    <span className="number-field">
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {suffix && <span className="muted">{suffix}</span>}
    </span>
  )
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field-row">
      <span className="field-row-label">{label}</span>
      <span className="field-row-control">{children}</span>
    </div>
  )
}
