import type { CSSProperties } from 'react'
import { sectionKinds, type DeckSlide, type OperatorSnapshot } from '@openstage/shared'
import { dispatch } from '../engine'

export function SlideGrid({ snapshot }: { snapshot: OperatorSnapshot }) {
  const { state, decks } = snapshot
  const deck = decks.find((d) => d.itemId === state.selectedItemId)
  if (!deck) return <section className="slides empty">Pick an item from the service order.</section>

  const at = (ref: typeof state.preview, index: number) => ref?.itemId === deck.itemId && ref.index === index
  return (
    <section className="slides" aria-label="Slides">
      <div className="slides-head">
        <h2>{deck.title}</h2>
        <span className="muted">{deck.subtitle}</span>
      </div>
      <div className="slide-grid">
        {deck.slides.map((slide, index) => (
          <SlideCard
            key={index}
            index={index}
            slide={slide}
            isLive={at(state.live.slide, index)}
            isPreview={at(state.preview, index)}
            onPick={() => dispatch({ type: 'preview.set', ref: { itemId: deck.itemId, index } })}
            onTake={() => {
              dispatch({ type: 'preview.set', ref: { itemId: deck.itemId, index } })
              dispatch({ type: 'live.take' })
            }}
          />
        ))}
      </div>
    </section>
  )
}

interface SlideCardProps {
  index: number
  slide: DeckSlide
  isLive: boolean
  isPreview: boolean
  onPick: () => void
  onTake: () => void
}

function SlideCard({ index, slide, isLive, isPreview, onPick, onTake }: SlideCardProps) {
  const tint = sectionKinds.find((k) => k.key === slide.kind)?.color
  const state = isLive ? ' is-live' : isPreview ? ' is-preview' : ''
  return (
    <button
      className={`slide-card${state}`}
      style={{ '--tint': tint } as CSSProperties}
      onClick={onPick}
      onDoubleClick={onTake}
      aria-label={`Preview slide ${index + 1}, ${slide.label}`}
      data-testid={`slide-${index}`}
    >
      <span className="slide-text">{slide.lines.join('\n')}</span>
      {isLive && <span className="slide-badge live">LIVE</span>}
      {isPreview && !isLive && <span className="slide-badge next">NEXT</span>}
      <span className="slide-foot">
        <span>{slide.label}</span>
        <span>{index + 1}</span>
      </span>
    </button>
  )
}
