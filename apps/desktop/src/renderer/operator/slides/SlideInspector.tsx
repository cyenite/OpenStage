import {
  animatedPresets,
  clockModes,
  defaultAnimatedColors,
  elementKinds,
  enterEffects,
  mediaFits,
  pageBackgroundKinds,
  qrLevels,
  type MediaItem,
  type Page,
  type PageBackground,
  type PageElement,
  type TextStyle,
} from '@openstage/shared'
import { CheckField, ColorRow, MediaPicker, NumberRow, PercentRow, SelectField, TextRow, TextStyleFields } from './fields'

interface SlideInspectorProps {
  page: Page
  element: PageElement | undefined
  media: MediaItem[]
  onPage: (page: Page) => void
  onElement: (patch: Partial<PageElement>) => void
  onSelect: (elementId: string | null) => void
}

/** Everything about the selected element, or about the page when nothing is selected. */
export function SlideInspector({ page, element, media, onPage, onElement, onSelect }: SlideInspectorProps) {
  return (
    <aside className="inspector slide-inspector" aria-label={element ? 'Element settings' : 'Page settings'}>
      {element ? <ElementFields element={element} media={media} onChange={onElement} /> : <PageFields page={page} media={media} onChange={onPage} />}
      <LayerList page={page} selectedId={element?.id ?? null} onPage={onPage} onSelect={onSelect} />
    </aside>
  )
}

const shapes = [
  { key: 'rectangle', label: 'Rectangle' },
  { key: 'ellipse', label: 'Ellipse' },
] as const

const directions = [
  { key: 'left', label: 'Right to left' },
  { key: 'right', label: 'Left to right' },
] as const

interface ElementFieldsProps {
  element: PageElement
  media: MediaItem[]
  onChange: (patch: Partial<PageElement>) => void
}

function ElementFields({ element, media, onChange }: ElementFieldsProps) {
  const set = onChange as (patch: Record<string, unknown>) => void
  const style = (patch: Partial<TextStyle>) => 'style' in element && set({ style: { ...element.style, ...patch } })
  const { frame } = element
  const kind = elementKinds.find((k) => k.key === element.kind)!.label
  return (
    <>
      <div className="inspector-block">
        <span className="panel-title">{kind}</span>
        <TextRow label="Name in the layer list" value={element.name} onChange={(name) => set({ name })} />
        {element.kind === 'text' && <TextRow label="Text" value={element.text} isMultiline onChange={(text) => set({ text })} />}
        {element.kind === 'ticker' && <TextRow label="Scrolling text" value={element.text} isMultiline onChange={(text) => set({ text })} />}
        {element.kind === 'qr' && <TextRow label="Link or text in the code" value={element.data} isMultiline onChange={(data) => set({ data })} />}
      </div>

      {element.kind === 'clock' && (
        <div className="inspector-block">
          <span className="panel-title">Clock</span>
          <SelectField label="Shows" value={element.mode} options={clockModes} onChange={(mode) => set({ mode })} />
          {element.mode === 'countdownTo' && <TextRow label="Count down to (HH:MM)" value={element.target} onChange={(target) => /^\d{1,2}:\d{2}$/.test(target) && set({ target })} />}
          {element.mode === 'countdown' && <NumberRow label="Length" value={element.minutes} min={0.1} max={1440} step={0.5} suffix="min" onChange={(minutes) => set({ minutes })} />}
          {(element.mode === 'time' || element.mode === 'countdownTo') && <CheckField label="24-hour clock" value={element.is24Hour} onChange={(is24Hour) => set({ is24Hour })} />}
          {element.mode === 'time' && <CheckField label="Seconds" value={element.hasSeconds} onChange={(hasSeconds) => set({ hasSeconds })} />}
          <TextRow label="Words before it" value={element.prefix} onChange={(prefix) => set({ prefix })} />
          {(element.mode === 'countdown' || element.mode === 'countdownTo') && <TextRow label="Shown at zero" value={element.endText} onChange={(endText) => set({ endText })} />}
        </div>
      )}

      {element.kind === 'ticker' && (
        <div className="inspector-block">
          <span className="panel-title">Scrolling</span>
          <NumberRow label="Speed" value={element.speed} min={0.5} max={60} step={0.5} suffix="screens/min" onChange={(speed) => set({ speed })} />
          <SelectField label="Direction" value={element.direction} options={directions} onChange={(direction) => set({ direction })} />
          <PercentRow label="Gap between repeats" value={element.gap} max={200} onChange={(gap) => set({ gap })} />
        </div>
      )}

      {'style' in element && (
        <div className="inspector-block">
          <span className="panel-title">Text style</span>
          <TextStyleFields style={element.style} onChange={style} />
        </div>
      )}

      {element.kind === 'qr' && (
        <div className="inspector-block">
          <span className="panel-title">QR code</span>
          <SelectField label="Error correction" value={element.level} options={qrLevels} onChange={(level) => set({ level })} />
          <ColorRow label="Dark squares" value={element.foreground} onChange={(foreground) => set({ foreground })} />
          <ColorRow label="Light squares" value={element.background} onChange={(background) => set({ background })} />
          <NumberRow label="Quiet border" value={element.quietZone} min={0} max={8} suffix="squares" onChange={(quietZone) => set({ quietZone })} />
        </div>
      )}

      {element.kind === 'shape' && (
        <div className="inspector-block">
          <span className="panel-title">Shape</span>
          <SelectField label="Shape" value={element.shape} options={shapes} onChange={(shape) => set({ shape })} />
          <ColorRow label="Fill" value={element.fill} onChange={(fill) => set({ fill })} />
          <ColorRow label="Outline" value={element.stroke} onChange={(stroke) => set({ stroke })} />
          <PercentRow label="Outline width" value={element.strokeWidth} max={10} onChange={(strokeWidth) => set({ strokeWidth })} />
          {element.shape === 'rectangle' && <PercentRow label="Corner radius" value={element.radius} max={50} onChange={(radius) => set({ radius })} />}
        </div>
      )}

      {(element.kind === 'image' || element.kind === 'video') && (
        <div className="inspector-block">
          <span className="panel-title">{element.kind === 'image' ? 'Image' : 'Video'}</span>
          <MediaPicker label="File" type={element.kind} media={media} value={element.mediaId} onChange={(mediaId) => set({ mediaId })} />
          <SelectField label="Fit" value={element.fit} options={mediaFits} onChange={(fit) => set({ fit })} />
          <PercentRow label="Corner radius" value={element.radius} max={50} onChange={(radius) => set({ radius })} />
          {element.kind === 'video' && (
            <div className="slide-checks">
              <CheckField label="Muted" value={element.isMuted} onChange={(isMuted) => set({ isMuted })} />
              <CheckField label="Loop" value={element.isLooping} onChange={(isLooping) => set({ isLooping })} />
            </div>
          )}
        </div>
      )}

      <div className="inspector-block">
        <span className="panel-title">Position and size</span>
        <PercentRow label="Left" value={frame.x} min={-100} max={200} onChange={(x) => set({ frame: { ...frame, x } })} />
        <PercentRow label="Top" value={frame.y} min={-100} max={200} onChange={(y) => set({ frame: { ...frame, y } })} />
        <PercentRow label="Width" value={frame.w} min={0.5} max={300} onChange={(w) => set({ frame: { ...frame, w } })} />
        <PercentRow label="Height" value={frame.h} min={0.5} max={300} onChange={(h) => set({ frame: { ...frame, h } })} />
        <NumberRow label="Rotation" value={element.rotation} min={-360} max={360} suffix="°" onChange={(rotation) => set({ rotation })} />
        <PercentRow label="Opacity" value={element.opacity} onChange={(opacity) => set({ opacity })} />
        <div className="slide-checks">
          <CheckField label="Locked" value={element.isLocked} onChange={(isLocked) => set({ isLocked })} />
          <CheckField label="Hidden" value={element.isHidden} onChange={(isHidden) => set({ isHidden })} />
        </div>
      </div>

      <div className="inspector-block">
        <span className="panel-title">Entrance</span>
        <SelectField label="Effect" value={element.enter.effect} options={enterEffects} onChange={(effect) => set({ enter: { ...element.enter, effect } })} />
        {element.enter.effect !== 'none' && (
          <>
            <NumberRow label="Length" value={element.enter.durationMs} min={0} max={10_000} step={100} suffix="ms" onChange={(durationMs) => set({ enter: { ...element.enter, durationMs } })} />
            <NumberRow label="Delay" value={element.enter.delayMs} min={0} max={60_000} step={100} suffix="ms" onChange={(delayMs) => set({ enter: { ...element.enter, delayMs } })} />
          </>
        )}
      </div>
    </>
  )
}

function backgroundOf(kind: PageBackground['kind'], current: PageBackground, media: MediaItem[]): PageBackground {
  switch (kind) {
    case 'none':
      return { kind }
    case 'color':
      return { kind, color: current.kind === 'gradient' ? current.from : '#101014' }
    case 'gradient':
      return { kind, from: current.kind === 'color' ? current.color : '#22324A', to: '#0B1220', angle: 160 }
    case 'animated':
      return { kind, preset: 'aurora', colors: defaultAnimatedColors, speed: 1 }
    case 'image':
    case 'video':
      return { kind, mediaId: media.find((m) => m.type === kind)?.id ?? 'missing', fit: 'cover', dim: 0 }
  }
}

function PageFields({ page, media, onChange }: { page: Page; media: MediaItem[]; onChange: (page: Page) => void }) {
  const background = page.background
  const setBackground = (patch: Partial<PageBackground>) => onChange({ ...page, background: { ...background, ...patch } as PageBackground })
  return (
    <>
      <div className="inspector-block">
        <span className="panel-title">Page</span>
        <TextRow label="Page name" value={page.name} onChange={(name) => name.trim() && onChange({ ...page, name: name.trim() })} />
        <CheckField label="Move on by itself" value={page.advanceAfter !== null} onChange={(isOn) => onChange({ ...page, advanceAfter: isOn ? 10 : null })} />
        {page.advanceAfter !== null && <NumberRow label="After" value={page.advanceAfter} min={1} max={3600} suffix="s" onChange={(advanceAfter) => onChange({ ...page, advanceAfter })} />}
        <TextRow label="Notes for the operator and stage" value={page.notes} isMultiline onChange={(notes) => onChange({ ...page, notes })} />
      </div>
      <div className="inspector-block">
        <span className="panel-title">Background</span>
        <SelectField label="Kind" value={background.kind} options={pageBackgroundKinds} onChange={(kind) => onChange({ ...page, background: backgroundOf(kind, background, media) })} />
        {background.kind === 'color' && <ColorRow label="Colour" value={background.color} onChange={(color) => setBackground({ color })} />}
        {background.kind === 'gradient' && (
          <>
            <ColorRow label="From" value={background.from} onChange={(from) => setBackground({ from })} />
            <ColorRow label="To" value={background.to} onChange={(to) => setBackground({ to })} />
            <NumberRow label="Angle" value={background.angle} min={0} max={360} suffix="°" onChange={(angle) => setBackground({ angle })} />
          </>
        )}
        {background.kind === 'animated' && (
          <>
            <SelectField label="Motion" value={background.preset} options={animatedPresets} onChange={(preset) => setBackground({ preset })} />
            {background.colors.map((color, i) => (
              <ColorRow key={i} label={i === 0 ? 'Base colour' : `Colour ${i + 1}`} value={color} onChange={(next) => setBackground({ colors: background.colors.with(i, next) })} />
            ))}
            <NumberRow label="Speed" value={background.speed} min={0.1} max={4} step={0.1} suffix="×" onChange={(speed) => setBackground({ speed })} />
          </>
        )}
        {(background.kind === 'image' || background.kind === 'video') && (
          <>
            <MediaPicker label="File" type={background.kind} media={media} value={background.mediaId} onChange={(mediaId) => setBackground({ mediaId })} />
            <SelectField label="Fit" value={background.fit} options={mediaFits} onChange={(fit) => setBackground({ fit })} />
            <PercentRow label="Darken" value={background.dim} max={90} onChange={(dim) => setBackground({ dim })} />
          </>
        )}
      </div>
    </>
  )
}

interface LayerListProps {
  page: Page
  selectedId: string | null
  onPage: (page: Page) => void
  onSelect: (elementId: string | null) => void
}

/** Top of the list is the front of the page, as in design tools. */
function LayerList({ page, selectedId, onPage, onSelect }: LayerListProps) {
  const toggle = (element: PageElement, key: 'isHidden' | 'isLocked') =>
    onPage({ ...page, elements: page.elements.map((e) => (e.id === element.id ? { ...e, [key]: !e[key] } : e)) })
  return (
    <div className="inspector-block">
      <span className="panel-title">Layers</span>
      <ol className="layer-tree" aria-label="Layers on this page">
        {[...page.elements].reverse().map((element) => (
          <li key={element.id} className={`layer-tree-row${element.id === selectedId ? ' is-selected' : ''}${element.isHidden ? ' is-hidden' : ''}`}>
            <button className="layer-tree-name" onClick={() => onSelect(element.id)}>
              {element.name || describe(element)}
            </button>
            <button className="layer-tree-flag" aria-pressed={element.isHidden} aria-label={`${element.isHidden ? 'Show' : 'Hide'} ${element.name || describe(element)}`} onClick={() => toggle(element, 'isHidden')}>
              {element.isHidden ? 'Hidden' : 'Shown'}
            </button>
            <button className="layer-tree-flag" aria-pressed={element.isLocked} aria-label={`${element.isLocked ? 'Unlock' : 'Lock'} ${element.name || describe(element)}`} onClick={() => toggle(element, 'isLocked')}>
              {element.isLocked ? 'Locked' : 'Free'}
            </button>
          </li>
        ))}
        {page.elements.length === 0 && <li className="library-empty muted">Nothing on this page yet. Insert text, a clock or a QR code above the page.</li>}
      </ol>
    </div>
  )
}

export function describe(element: PageElement): string {
  const kind = elementKinds.find((k) => k.key === element.kind)!.label
  if (element.kind === 'text' || element.kind === 'ticker') return `${kind}: ${element.text.split('\n')[0]!.slice(0, 30)}`
  return kind
}
