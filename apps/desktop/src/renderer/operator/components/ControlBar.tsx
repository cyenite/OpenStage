import type { CSSProperties } from 'react'
import { layers, type Layer, type LayerKey, type OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'

export function ControlBar({ snapshot }: { snapshot: OperatorSnapshot }) {
  const values = layerValues(snapshot)
  return (
    <div className="control-bar">
      <button className="take" onClick={() => dispatch({ type: 'live.take' })} disabled={!snapshot.state.preview}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        Send to live
        <kbd>Space</kbd>
      </button>
      <div className="layer-bar" role="group" aria-label="What is on screen, by layer">
        {layers.map((layer) => (
          <LayerChip key={layer.key} layer={layer} value={values[layer.key]} />
        ))}
      </div>
      <button className="black-screen" onClick={() => dispatch({ type: 'layer.clearAll' })}>
        Black screen <kbd>Esc</kbd>
      </button>
    </div>
  )
}

function LayerChip({ layer, value }: { layer: Layer; value: string | null }) {
  const isOn = value !== null
  return (
    <div className={`layer-chip${isOn ? ' is-on' : ''}`} data-testid={`layer-${layer.key}`} style={{ '--layer': layer.color } as CSSProperties}>
      <span className="layer-swatch" aria-hidden="true" />
      <span className="layer-text">
        <span className="layer-name">{layer.label}</span>
        <span className="layer-value">{value ?? 'Off'}</span>
      </span>
      <button
        className="layer-clear"
        onClick={() => dispatch({ type: 'layer.clear', layer: layer.key })}
        disabled={!isOn}
        aria-label={`Clear ${layer.label} layer (${layer.shortcut})`}
        title={`Clear ${layer.label} (${layer.shortcut})`}
      >
        {layer.shortcut}
      </button>
    </div>
  )
}

function layerValues({ state, decks, library }: OperatorSnapshot): Record<LayerKey, string | null> {
  const { live } = state
  const deck = decks.find((d) => d.itemId === live.slide?.itemId)
  const slide = live.slide ? deck?.slides[live.slide.index] : undefined
  return {
    slide: slide ? `${deck!.title} · ${slide.label}` : null,
    audio: library.audioCues.find((a) => a.id === live.audio)?.name ?? null,
    background: library.backgrounds.find((b) => b.id === live.background)?.name ?? null,
    lowerThird: library.lowerThirds.find((l) => l.id === live.lowerThird)?.title ?? null,
  }
}
