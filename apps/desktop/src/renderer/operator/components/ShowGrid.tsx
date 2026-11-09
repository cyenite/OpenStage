import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { classicTheme, fontCss, itemKinds, lookup, sectionKinds, type Background, type Deck, type DeckSlide, type Id, type OperatorSnapshot, type ServiceItem, type Theme } from '@openstage/shared'
import { ItemSettings } from '../library/ItemSettings'
import { addInstantToService, swatchCss, type AddTarget } from '../library/results'
import { jumpDeck, jumpTarget, sectionJumps, showNow } from './jumps'

interface ShowGridProps {
  snapshot: OperatorSnapshot
  /** A song or passage opened from the Library; the grid shows it instead of the service while it exists. */
  libraryDeckId: Id | null
  target: AddTarget
  onCloseLibrary: () => void
  onEdit: (item: ServiceItem) => void
  onEditSong: (songId: Id) => void
}

/** Present's centre: every slide, one click to put it on screen. Only what is on screen is marked. */
export function ShowGrid({ snapshot, libraryDeckId, target, onCloseLibrary, onEdit, onEditSong }: ShowGridProps) {
  const { state, decks, instant, service } = snapshot
  const libraryDeck = instant.find((d) => d.itemId === libraryDeckId)
  const shown = libraryDeck ? [libraryDeck] : decks
  const body = useRef<HTMLDivElement>(null)

  // Keep the slide on screen in view as it moves; an item picked in the order scrolls to its start.
  const live = state.live.slide
  useEffect(() => {
    body.current?.querySelector('.show-card.is-live')?.scrollIntoView({ block: 'nearest' })
  }, [live?.itemId, live?.index, libraryDeckId])
  useEffect(() => {
    if (libraryDeck) return
    body.current?.querySelector(`[data-deck="${CSS.escape(state.selectedItemId ?? '')}"]`)?.scrollIntoView({ block: 'start' })
  }, [state.selectedItemId])

  return (
    <section className="show" aria-label="Slides">
      {libraryDeck ? (
        <LibraryHead deck={libraryDeck} snapshot={snapshot} target={target} onClose={onCloseLibrary} onEditSong={onEditSong} />
      ) : (
        <ServiceHead snapshot={snapshot} onEdit={onEdit} />
      )}
      <div className="show-body" ref={body}>
        {shown.map((deck) => (
          <DeckSlides key={deck.itemId} deck={deck} snapshot={snapshot} />
        ))}
        {shown.length === 0 && <p className="show-empty muted">{service.items.length === 0 ? 'The service is empty. Add songs and readings with + or Ctrl K.' : 'Nothing to show.'}</p>}
      </div>
    </section>
  )
}

function ServiceHead({ snapshot, onEdit }: { snapshot: OperatorSnapshot; onEdit: (item: ServiceItem) => void }) {
  const [isSettingsOpen, setSettingsOpen] = useState(false)
  const { state, service, decks } = snapshot
  const deck = jumpDeck(snapshot)
  const item = service.items.find((i) => i.id === state.selectedItemId)
  const selected = decks.find((d) => d.itemId === item?.id)
  return (
    <div className="show-head">
      <div className="show-head-title">
        <strong>{deck?.title ?? 'Nothing on screen'}</strong>
        <span className="muted">{deck ? (deck.itemId === state.live.slide?.itemId ? 'On screen' : 'Selected') : 'Click any slide to show it'}</span>
      </div>
      <JumpChips snapshot={snapshot} deck={deck} />
      {item && selected && !selected.isPlaceholder && (
        <div className="popover-anchor">
          <button className="button-quiet button-small" aria-expanded={isSettingsOpen} onClick={() => setSettingsOpen(!isSettingsOpen)}>
            {selected.title} settings
          </button>
          {isSettingsOpen && <ItemSettings snapshot={snapshot} item={item} onEdit={onEdit} onClose={() => setSettingsOpen(false)} />}
        </div>
      )}
    </div>
  )
}

interface LibraryHeadProps {
  deck: Deck
  snapshot: OperatorSnapshot
  target: AddTarget
  onClose: () => void
  onEditSong: (songId: Id) => void
}

function LibraryHead({ deck, snapshot, target, onClose, onEditSong }: LibraryHeadProps) {
  const source = snapshot.state.instant[deck.itemId]
  return (
    <div className="show-head is-library">
      <span className="source-tag">From library</span>
      <div className="show-head-title">
        <strong>{deck.title}</strong>
        <span className="muted">Not in the service · click a slide to show it</span>
      </div>
      <JumpChips snapshot={snapshot} deck={deck} />
      {source?.type === 'song' && (
        <button className="button-quiet button-small" onClick={() => onEditSong(source.songId)}>
          Edit lyrics
        </button>
      )}
      {source && (
        <button className="button-small button-accent" onClick={() => addInstantToService(source, deck.title, target)}>
          + Add to service{target.afterTitle ? ` after ${target.afterTitle}` : ''}
        </button>
      )}
      <button className="button-quiet button-small" onClick={onClose}>
        Back to the service
      </button>
    </div>
  )
}

function JumpChips({ snapshot, deck }: { snapshot: OperatorSnapshot; deck: Deck | undefined }) {
  const jumps = sectionJumps(deck)
  if (!deck || jumps.length === 0) return null
  const live = snapshot.state.live.slide
  const liveIndex = live?.itemId === deck.itemId ? live.index : -1
  const current = liveIndex >= 0 ? deck.slides[liveIndex]?.label : undefined
  return (
    <div className="jump-chips" role="group" aria-label={`Jump to a section of ${deck.title}`}>
      {jumps.map((jump) => {
        const isCurrent = !!current && jump.starts.some((start) => deck.slides[start]!.label === current)
        const color = sectionKinds.find((k) => k.key === jump.kind)?.color
        return (
          <button
            key={jump.key}
            className={`jump-chip${isCurrent ? ' is-current' : ''}`}
            style={{ '--tint': color } as CSSProperties}
            aria-label={`Show ${jump.label} (${jump.key})`}
            onClick={() => showNow(snapshot, { itemId: deck.itemId, index: jumpTarget(jump, liveIndex) })}
          >
            {jump.label}
            <kbd>{jump.key}</kbd>
          </button>
        )
      })}
    </div>
  )
}

function DeckSlides({ deck, snapshot }: { deck: Deck; snapshot: OperatorSnapshot }) {
  const { state, library } = snapshot
  const themes = Object.fromEntries(library.themes.map((t) => [t.id, t]))
  const theme = lookup(themes, deck.themeId) ?? lookup(themes, classicTheme.id) ?? classicTheme
  // The same order the screens use: the item's own background, else its theme's fill, else the live background.
  const background = library.backgrounds.find((b) => b.id === deck.backgroundId) ?? (theme.fill ? undefined : library.backgrounds.find((b) => b.id === state.live.background))
  const live = state.live.slide
  const liveIndex = live?.itemId === deck.itemId ? live.index : -1
  const lastLive = snapshot.service.items.findIndex((i) => i.id === state.timing.itemId)
  const isDone = lastLive >= 0 && snapshot.service.items.findIndex((i) => i.id === deck.itemId) < lastLive
  const badge = itemKinds.find((k) => k.key === deck.kind)?.badge
  return (
    <div className={`show-deck${isDone ? ' is-done' : ''}`} data-deck={deck.itemId}>
      <div className="show-deck-head">
        <span className="order-kind">{badge}</span>
        <strong>{deck.title}</strong>
        <span className="muted">{deck.isPlaceholder ? `${deck.minutes} min · nothing to show` : deck.subtitle}</span>
      </div>
      {deck.slides.length > 0 && (
        <div className="show-cards">
          {deck.slides.map((slide, index) => (
            <SlideCard
              key={index}
              index={index}
              slide={slide}
              theme={theme}
              background={background}
              isLive={index === liveIndex}
              onShow={() => showNow(snapshot, { itemId: deck.itemId, index })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SlideCardProps {
  index: number
  slide: DeckSlide
  theme: Theme
  background: Background | undefined
  isLive: boolean
  onShow: () => void
}

function SlideCard({ index, slide, theme, background, isLive, onShow }: SlideCardProps) {
  const tint = sectionKinds.find((k) => k.key === slide.kind)?.color
  return (
    <button
      className={`show-card${isLive ? ' is-live' : ''}`}
      style={{ '--tint': tint } as CSSProperties}
      onClick={onShow}
      aria-label={`Show slide ${index + 1}, ${slide.label}`}
      aria-current={isLive ? 'true' : undefined}
      data-testid={`slide-${index}`}
    >
      <span className="show-card-text" style={thumbnailStyle(theme, background)}>
        {slide.lines.join('\n')}
      </span>
      <span className="show-card-foot">
        <span className="show-card-dot" aria-hidden="true" />
        <span className="show-card-label">{slide.label}</span>
        {isLive ? <strong className="tag-live">LIVE</strong> : <span>{index + 1}</span>}
      </span>
    </button>
  )
}

/** Thumbnails take the background given, else the theme's fill, and the theme's main text style. */
function thumbnailStyle(theme: Theme, background: Background | undefined): CSSProperties {
  const { fill, boxes } = theme
  const behind = background?.render ?? fill
  return {
    background: behind ? swatchCss(behind) : undefined,
    color: boxes.main.color,
    fontFamily: fontCss(boxes.main.font.family),
    fontStyle: boxes.main.font.italic ? 'italic' : 'normal',
  }
}
