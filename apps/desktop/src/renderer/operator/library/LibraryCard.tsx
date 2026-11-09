import { Snippet } from '../edit/SongLibrary'
import { backgroundDragType, resultBadge, swatchCss, type LibraryResult } from './results'

interface LibraryCardProps {
  result: LibraryResult
  label: string
  hint: string
  isActive: boolean
  onAct: () => void
  onLive?: () => void
}

export function LibraryCard({ result, label, hint, isActive, onAct, onLive }: LibraryCardProps) {
  const isBackground = result.filter === 'backgrounds'
  const detail = 'detail' in result ? result.detail : 'Background'
  const snippet = 'snippet' in result ? result.snippet : ''
  return (
    <div
      className={`library-card${isActive ? ' is-active' : ''}`}
      draggable={isBackground}
      onDragStart={isBackground ? (event) => (event.dataTransfer.setData(backgroundDragType, result.id), (event.dataTransfer.effectAllowed = 'copy')) : undefined}
    >
      {isBackground ? (
        <span className="library-swatch" style={{ background: swatchCss(result.render) }} aria-hidden="true" />
      ) : (
        <span className="order-kind">{resultBadge(result)}</span>
      )}
      <span className="library-card-text">
        <span className="library-card-title">{result.title}</span>
        {snippet ? <Snippet text={snippet} className="library-card-detail" /> : <span className="library-card-detail">{detail}</span>}
      </span>
      {onLive && (
        <button className="button-quiet button-small" aria-label={`Show ${result.title} on the screen now`} title="Show on the screen now, until the next item, without saving it" onClick={onLive}>
          Show now
        </button>
      )}
      <button className={`button-small${isActive ? ' button-quiet' : ' button-primary'}`} aria-label={hint} title={hint} onClick={onAct}>
        {label}
      </button>
    </div>
  )
}
