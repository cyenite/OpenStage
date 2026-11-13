import { useState } from 'react'
import { bannerMotions, bannerPositions, bannerStyles, corners, fontFamilies, newId, newOverlay, overlayKinds, type MediaItem, type OperatorSnapshot, type Overlay } from '@openstage/shared'
import { dispatch } from '../engine'
import { CheckField, ColorRow, MediaPicker, NumberRow, PercentRow, SelectField, TextRow } from '../slides/fields'

const families = fontFamilies.map((f) => ({ key: f.key as string, label: f.label }))
const tickerPositions = [
  { key: 'bottom', label: 'Bottom' },
  { key: 'top', label: 'Top' },
] as const

/** Saved overlays: several can be on at once; each has its own Show/Hide and every setting, edited in place while it is on air. */
export function OverlaysPanel({ snapshot }: { snapshot: OperatorSnapshot }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const { overlays, media } = snapshot.library
  const onAir = snapshot.state.live.overlays
  const create = (kind: Overlay['kind']) => {
    const overlay = newOverlay(kind, newId(kind))
    dispatch({ type: 'overlay.save', overlay })
    setEditingId(overlay.id)
  }
  return (
    <div className="lower-thirds overlays-panel">
      <ul className="lower-third-list" aria-label="Overlays">
        {overlays.map((overlay) => {
          const isOn = onAir.includes(overlay.id)
          const kind = overlayKinds.find((k) => k.key === overlay.kind)!.label
          return (
            <li key={overlay.id}>
              <div className={`lower-third-row${isOn ? ' is-on-air' : ''}`}>
                <span className="lower-third-text">
                  <strong>{overlay.name || kind}</strong>
                  <span className="muted">{kind}</span>
                </span>
                {isOn && <span className="tag-live">ON AIR</span>}
                <button className="button-quiet button-small" aria-expanded={editingId === overlay.id} aria-label={`Edit ${overlay.name}`} onClick={() => setEditingId(editingId === overlay.id ? null : overlay.id)}>
                  {editingId === overlay.id ? 'Done' : 'Edit'}
                </button>
                <button
                  className={`button-small ${isOn ? 'button-danger' : 'button-accent'}`}
                  aria-pressed={isOn}
                  aria-label={isOn ? `Take ${overlay.name} off the screen` : `Show ${overlay.name} on the screen`}
                  onClick={() => dispatch({ type: isOn ? 'overlay.hide' : 'overlay.show', overlayId: overlay.id })}
                >
                  {isOn ? 'Hide' : 'Show'}
                </button>
              </div>
              {editingId === overlay.id && <OverlayForm overlay={overlay} media={media} onDelete={() => (dispatch({ type: 'overlay.delete', overlayId: overlay.id }), setEditingId(null))} />}
            </li>
          )
        })}
        {overlays.length === 0 && <li className="library-empty muted">No overlays yet. Make a scrolling message, a title banner, a watermark or a corner clock.</li>}
      </ul>
      <div className="overlay-new" role="group" aria-label="New overlay">
        <span className="inspector-label">New</span>
        {overlayKinds.map((k) => (
          <button key={k.key} className="button-quiet button-small" onClick={() => create(k.key)}>
            + {k.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Each change saves at once, so an overlay that is on air updates on the screens as it is edited. */
function OverlayForm({ overlay, media, onDelete }: { overlay: Overlay; media: MediaItem[]; onDelete: () => void }) {
  const set = (patch: Record<string, unknown>) => dispatch({ type: 'overlay.save', overlay: { ...overlay, ...patch } as Overlay })
  return (
    <div className="lower-third-form overlay-form" aria-label={`Settings for ${overlay.name}`}>
      <TextRow label="Name" value={overlay.name} onChange={(name) => set({ name })} />
      {overlay.kind === 'ticker' && (
        <>
          <TextRow label="Message" value={overlay.text} isMultiline onChange={(text) => set({ text })} />
          <TextRow label="Tag at the start (empty for none)" value={overlay.label} onChange={(label) => set({ label })} />
          <SelectField label="Position" value={overlay.position} options={tickerPositions} onChange={(position) => set({ position })} />
          <NumberRow label="Speed" value={overlay.speed} min={0.5} max={60} step={0.5} suffix="screens/min" onChange={(speed) => set({ speed })} />
          <TextRow label="Between repeats" value={overlay.separator} onChange={(separator) => set({ separator })} />
          <ColorRow label="Text" value={overlay.textColor} onChange={(textColor) => set({ textColor })} />
          <ColorRow label="Band" value={overlay.backColor} onChange={(backColor) => set({ backColor })} />
          <ColorRow label="Tag" value={overlay.labelColor} onChange={(labelColor) => set({ labelColor })} />
        </>
      )}
      {overlay.kind === 'banner' && (
        <>
          <TextRow label="Title" value={overlay.title} onChange={(title) => set({ title })} />
          <TextRow label="Second line" value={overlay.subtitle} onChange={(subtitle) => set({ subtitle })} />
          <SelectField label="Position" value={overlay.position} options={bannerPositions} onChange={(position) => set({ position })} />
          <SelectField label="Look" value={overlay.style} options={bannerStyles} onChange={(style) => set({ style })} />
          <SelectField label="Entrance" value={overlay.motion} options={bannerMotions} onChange={(motion) => set({ motion })} />
          <ColorRow label="Text" value={overlay.textColor} onChange={(textColor) => set({ textColor })} />
          <ColorRow label="Background" value={overlay.backColor} onChange={(backColor) => set({ backColor })} />
          <ColorRow label="Accent" value={overlay.accent} onChange={(accent) => set({ accent })} />
          <CheckField label="Hide by itself" value={overlay.hideAfter !== null} onChange={(isOn) => set({ hideAfter: isOn ? 10 : null })} />
          {overlay.hideAfter !== null && <NumberRow label="After" value={overlay.hideAfter} min={1} max={3600} suffix="s" onChange={(hideAfter) => set({ hideAfter })} />}
        </>
      )}
      {overlay.kind === 'watermark' && (
        <>
          <CheckField label="Use an image (a logo)" value={overlay.mediaId !== null} onChange={(isOn) => set({ mediaId: isOn ? media.find((m) => m.type === 'image')?.id ?? 'missing' : null })} />
          {overlay.mediaId !== null ? (
            <MediaPicker label="Image" type="image" media={media} value={overlay.mediaId} onChange={(mediaId) => set({ mediaId })} />
          ) : (
            <>
              <TextRow label="Text" value={overlay.text} onChange={(text) => set({ text })} />
              <ColorRow label="Colour" value={overlay.color} onChange={(color) => set({ color })} />
            </>
          )}
          <SelectField label="Corner" value={overlay.corner} options={corners} onChange={(corner) => set({ corner })} />
          <PercentRow label="Opacity" value={overlay.opacity} min={5} onChange={(opacity) => set({ opacity })} />
          <PercentRow label="Margin" value={overlay.margin} max={20} onChange={(margin) => set({ margin })} />
        </>
      )}
      {overlay.kind === 'clock' && (
        <>
          <SelectField label="Corner" value={overlay.corner} options={corners} onChange={(corner) => set({ corner })} />
          <div className="slide-checks">
            <CheckField label="24-hour" value={overlay.is24Hour} onChange={(is24Hour) => set({ is24Hour })} />
            <CheckField label="Seconds" value={overlay.hasSeconds} onChange={(hasSeconds) => set({ hasSeconds })} />
          </div>
          <ColorRow label="Text" value={overlay.textColor} onChange={(textColor) => set({ textColor })} />
          <ColorRow label="Background" value={overlay.backColor} onChange={(backColor) => set({ backColor })} />
        </>
      )}
      <SelectField label="Font" value={overlay.family} options={families.some((f) => f.key === overlay.family) ? families : [...families, { key: overlay.family, label: overlay.family }]} onChange={(family) => set({ family })} />
      <NumberRow label="Size" value={Math.round(overlay.size * 1000) / 10} min={2} max={40} step={0.5} suffix="% of height" onChange={(v) => set({ size: v / 100 })} />
      <div className="lower-third-actions">
        <button className="button-quiet button-small is-destructive" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
