import type { RenderState } from '@openstage/shared'
import { RenderView } from './RenderView'

interface MonitorPaneProps {
  kind: 'preview' | 'live'
  caption: string
  render: RenderState
}

export function MonitorPane({ kind, caption, render }: MonitorPaneProps) {
  return (
    <div className={`monitor monitor-${kind}`} data-testid={`monitor-${kind}`}>
      <div className="monitor-head">
        <span className="monitor-label">
          <span className="dot" aria-hidden="true" />
          {kind.toUpperCase()}
        </span>
        <span className="monitor-caption">{caption}</span>
      </div>
      <RenderView className="monitor-screen" render={render} />
    </div>
  )
}
