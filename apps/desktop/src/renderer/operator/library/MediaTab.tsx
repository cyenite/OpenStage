import type { Id, OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'
import { MediaThumb } from '../slides/MediaLibrary'
import { formatSeconds } from './media'

/** Images and videos, each one click from full screen on the media layer. */
export function MediaTab({ snapshot, onManage }: { snapshot: OperatorSnapshot; onManage: (mediaId: Id | null) => void }) {
  const { media } = snapshot.library
  const liveId = snapshot.state.live.media
  return (
    <div className="library-tab">
      <p className="library-target">
        <span className="muted">Plays full screen over the background; F5 takes it off. Settings such as looping live in Edit › Media.</span>
        <button className="link-button" onClick={() => onManage(null)}>
          Add or change media…
        </button>
      </p>
      <ul className="media-strip" aria-label="Media">
        {media.map((item) => (
          <li key={item.id} className={`media-card${item.id === liveId ? ' is-live' : ''}`}>
            <MediaThumb item={item} />
            <span className="media-tile-name">
              {item.name}
              {item.id === liveId && <strong className="tag-live"> LIVE</strong>}
            </span>
            <span className="muted">{item.type === 'video' ? `${formatSeconds(item.duration ?? 0)} · ${item.ending === 'loop' ? 'loops' : item.ending === 'clear' ? 'clears at the end' : 'holds at the end'}` : 'Image'}</span>
            <span className="media-card-actions">
              <button className="button-small button-accent" aria-label={`${item.type === 'video' ? 'Play' : 'Show'} ${item.name} now`} onClick={() => dispatch({ type: 'media.show', mediaId: item.id })}>
                {item.type === 'video' ? 'Play' : 'Show'}
              </button>
              <button className="button-quiet button-small" aria-label={`Settings for ${item.name}`} onClick={() => onManage(item.id)}>
                Settings
              </button>
            </span>
          </li>
        ))}
        {media.length === 0 && <li className="library-empty muted">No images or videos yet. Add them in Edit › Media.</li>}
      </ul>
    </div>
  )
}
