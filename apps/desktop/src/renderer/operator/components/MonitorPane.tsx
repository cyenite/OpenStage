import { useState } from 'react'
import type { Id, RenderState } from '@openstage/shared'
import { backgroundDragType } from '../library/results'
import { RenderView } from './RenderView'

interface MonitorPaneProps {
  kind: 'preview' | 'live'
  caption: string
  render: RenderState
  /** Where the slide came from: the service's schedule, or straight from the library. */
  source?: 'Schedule' | 'Library'
  /** Accepts a background dragged from the Library. */
  onDropBackground?: (backgroundId: Id) => void
}

export function MonitorPane({ kind, caption, source, render, onDropBackground }: MonitorPaneProps) {
  const [isDropTarget, setDropTarget] = useState(false)
  const accepts = (event: React.DragEvent) => !!onDropBackground && event.dataTransfer.types.includes(backgroundDragType)
  return (
    <div
      className={`monitor monitor-${kind}${isDropTarget ? ' is-drop-target' : ''}`}
      data-testid={`monitor-${kind}`}
      onDragOver={(e) => {
        if (!accepts(e)) return
        e.preventDefault()
        setDropTarget(true)
      }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={(e) => {
        setDropTarget(false)
        const backgroundId = e.dataTransfer.getData(backgroundDragType)
        if (backgroundId) onDropBackground?.(backgroundId)
      }}
    >
      <div className="monitor-head">
        <span className="monitor-label">
          <span className="dot" aria-hidden="true" />
          {kind.toUpperCase()}
        </span>
        {source && <span className={`monitor-source is-${source.toLowerCase()}`}>{source}</span>}
        <span className="monitor-caption">{isDropTarget ? 'Drop to show it now, without saving it' : caption}</span>
      </div>
      <RenderView className="monitor-screen" render={render} />
    </div>
  )
}
