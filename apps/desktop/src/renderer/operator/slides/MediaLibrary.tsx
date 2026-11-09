import { useRef, useState } from 'react'
import { mediaEndings, mediaFits, mediaUrl, type Id, type MediaItem, type OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'
import { LibraryTabs, type EditLibrary } from '../edit/LibraryTabs'
import { formatSeconds, importMediaFiles } from '../library/media'
import { CheckField, NumberRow, PercentRow, SelectField, TextRow } from './fields'

interface MediaLibraryProps {
  media: MediaItem[]
  selectedId: Id | null
  onLibrary: (library: EditLibrary) => void
  onSelect: (mediaId: Id) => void
}

export function MediaLibrary({ media, selectedId, onLibrary, onSelect }: MediaLibraryProps) {
  const input = useRef<HTMLInputElement>(null)
  const [isDropping, setDropping] = useState(false)
  const add = async (files: File[]) => {
    const [first] = await importMediaFiles(files)
    if (first) onSelect(first)
  }
  return (
    <nav
      className={`sidebar media-library${isDropping ? ' is-drop-target' : ''}`}
      aria-label="Media library"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && (e.preventDefault(), setDropping(true))}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropping(false)
        void add([...e.dataTransfer.files])
      }}
    >
      <div className="sidebar-head">
        <LibraryTabs library="media" onLibrary={onLibrary} />
      </div>
      <div className="sidebar-actions">
        <button className="button-small" onClick={() => input.current?.click()}>
          Add images or videos
        </button>
        <input ref={input} type="file" hidden multiple accept="image/*,video/*" aria-label="Media files to add" onChange={(e) => (void add([...(e.target.files ?? [])]), (e.target.value = ''))} />
      </div>
      <ul className="media-grid" aria-label="Media">
        {media.map((item) => (
          <li key={item.id}>
            <button className={`media-tile${item.id === selectedId ? ' is-selected' : ''}`} aria-current={item.id === selectedId ? 'true' : undefined} onClick={() => onSelect(item.id)}>
              <MediaThumb item={item} />
              <span className="media-tile-name">{item.name}</span>
              <span className="muted">{item.type === 'video' ? `Video${item.duration ? ` · ${formatSeconds(item.duration)}` : ''}` : 'Image'}</span>
            </button>
          </li>
        ))}
        {media.length === 0 && <li className="library-empty muted">Drop images and videos here, or use the button above. They are copied into the library, so moving the originals later is safe.</li>}
      </ul>
    </nav>
  )
}

export function MediaThumb({ item }: { item: MediaItem }) {
  const src = mediaUrl(item.file)
  return item.type === 'video' ? <video className="media-thumb" src={`${src}#t=1`} muted preload="metadata" /> : <img className="media-thumb" src={src} alt="" />
}

/** One media item: a preview and every playing setting, and buttons to show it now. */
export function MediaDetail({ snapshot, mediaId, onDeleted }: { snapshot: OperatorSnapshot; mediaId: Id; onDeleted: () => void }) {
  const [isConfirmingDelete, setConfirmingDelete] = useState(false)
  const item = snapshot.library.media.find((m) => m.id === mediaId)
  if (!item) return <div className="editor-empty">This file is no longer in the media library.</div>
  const update = (changes: Partial<MediaItem>) => dispatch({ type: 'media.update', mediaId, changes })
  const isLive = snapshot.state.live.media === mediaId
  const src = mediaUrl(item.file)
  return (
    <div className="media-detail">
      <div className="slide-editor-head">
        <h1>{item.name}</h1>
        <span className="spacer" />
        <button className="button-small button-accent" onClick={() => dispatch({ type: 'media.show', mediaId })}>
          {isLive ? 'Play again from the start' : item.type === 'video' ? 'Play on the screens now' : 'Show on the screens now'}
        </button>
        {isLive && (
          <button className="button-quiet button-small" onClick={() => dispatch({ type: 'layer.clear', layer: 'media' })}>
            Take off (F5)
          </button>
        )}
        {isConfirmingDelete ? (
          <span className="confirm-row">
            <span className="muted">Delete the file from the library? Pages using it will show nothing in its place.</span>
            <button className="button-small button-danger" onClick={() => (dispatch({ type: 'media.delete', mediaId }), onDeleted())}>
              Delete
            </button>
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
      <div className="media-detail-body">
        <div className="media-preview">{item.type === 'video' ? <video src={src} controls muted /> : <img src={src} alt={item.name} />}</div>
        <div className="inspector-block media-settings">
          <span className="panel-title">Settings</span>
          <TextRow label="Name" value={item.name} onChange={(name) => update({ name })} />
          <SelectField label="Fit" value={item.fit} options={mediaFits} onChange={(fit) => update({ fit })} />
          <NumberRow label="Fade in and out" value={item.fadeMs} min={0} max={10_000} step={100} suffix="ms" onChange={(fadeMs) => update({ fadeMs })} />
          {item.type === 'video' && (
            <>
              <SelectField label="At the end" value={item.ending} options={mediaEndings} onChange={(ending) => update({ ending })} />
              <PercentRow label="Volume" value={item.volume} onChange={(volume) => update({ volume })} />
              <CheckField label="Muted" value={item.isMuted} onChange={(isMuted) => update({ isMuted })} />
              <NumberRow label="Start at" value={item.startAt} min={0} max={item.duration ?? 86_400} step={0.5} suffix="s" onChange={(startAt) => update({ startAt })} />
              <CheckField label="Stop before the end" value={item.endAt !== null} onChange={(isOn) => update({ endAt: isOn ? item.duration ?? 60 : null })} />
              {item.endAt !== null && <NumberRow label="Stop at" value={item.endAt} min={0} max={item.duration ?? 86_400} step={0.5} suffix="s" onChange={(endAt) => update({ endAt })} />}
              <span className="inspector-note">{item.duration ? `Length ${formatSeconds(item.duration)}.` : 'Length unknown.'} Sound plays from the projector only; previews in this window are muted.</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
