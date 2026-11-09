import { useEffect, useState } from 'react'
import { classicTheme, layers, lookup, type Layer, type LayerKey, type OperatorSnapshot, type OutputStatus, type RenderState, type SlideRef } from '@openstage/shared'
import { dispatch } from '../engine'
import { useStoredState } from '../library/useStoredState'
import { LowerThirdsPanel } from './LowerThirdsPanel'
import { OverlaysPanel } from './OverlaysPanel'
import { formatSeconds } from '../library/media'
import { RenderView } from './RenderView'
import { StageLayout, StageMessage, Timers } from './StagePanels'

/** Declaration order is tab order. */
const outputTabs = [
  { key: 'lowerThirds', label: 'Lower thirds' },
  { key: 'overlays', label: 'Overlays' },
  { key: 'timer', label: 'Timer' },
  { key: 'stage', label: 'Stage' },
] as const

type OutputTab = (typeof outputTabs)[number]['key']
type Previews = Record<string, boolean>

const isTab = (value: unknown): value is OutputTab => outputTabs.some((t) => t.key === value)
const isPreviews = (value: unknown): value is Previews => !!value && typeof value === 'object' && Object.values(value).every((v) => typeof v === 'boolean')

/** Present's right column: what each screen shows, whether it is on, what is on each layer, and the booth's tools. */
export function OutputColumn({ snapshot }: { snapshot: OperatorSnapshot }) {
  const [tab, setTab] = useStoredState<OutputTab>('openstage.outputTab', 'lowerThirds', isTab)
  const [previews, setPreviews] = useStoredState<Previews>('openstage.previews', { projector: true, stage: false }, isPreviews)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  const renders: Record<string, RenderState> = { projector: snapshot.liveRender, stage: snapshot.stageRender }
  return (
    <aside className="output-column" aria-label="Screens">
      {snapshot.outputs.map((output) => (
        <ScreenPanel
          key={output.id}
          output={output}
          snapshot={snapshot}
          render={renders[output.id] ?? snapshot.liveRender}
          isPreviewing={previews[output.id] ?? output.id === 'projector'}
          onPreview={(isPreviewing) => setPreviews({ ...previews, [output.id]: isPreviewing })}
        />
      ))}
      <MediaControls snapshot={snapshot} now={now} />
      <LayerList snapshot={snapshot} />
      <BlackButton isBlack={snapshot.state.isBlack} />
      <div className="output-tabs">
        <div className="segmented" role="tablist" aria-label="Booth tools">
          {outputTabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="output-tab-body">
          {tab === 'lowerThirds' && <LowerThirdsPanel snapshot={snapshot} />}
          {tab === 'overlays' && <OverlaysPanel snapshot={snapshot} />}
          {tab === 'timer' && <Timers snapshot={snapshot} now={now} />}
          {tab === 'stage' && (
            <>
              <StageMessage snapshot={snapshot} now={now} />
              <StageLayout snapshot={snapshot} />
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

interface ScreenPanelProps {
  output: OutputStatus
  snapshot: OperatorSnapshot
  render: RenderState
  isPreviewing: boolean
  onPreview: (isPreviewing: boolean) => void
}

function ScreenPanel({ output, snapshot, render, isPreviewing, onPreview }: ScreenPanelProps) {
  const { state } = snapshot
  const isProjector = output.id === 'projector'
  const status = !output.isOn ? 'Off' : !output.isConnected ? 'No window' : isProjector && state.isBlack ? 'Black' : 'On'
  const overlay = !output.isOn ? 'Switched off: nothing is sent to this screen' : isProjector && state.isBlack ? 'Black screen · Esc brings it back' : null
  return (
    <section className={`screen-panel${output.isOn ? '' : ' is-off'}`} aria-label={output.name} data-testid={isProjector ? 'monitor-live' : `monitor-${output.id}`}>
      <div className="screen-head">
        <span className={`screen-dot is-${status === 'On' ? 'on' : status === 'Black' ? 'black' : 'off'}`} aria-hidden="true" />
        <strong>{output.name}</strong>
        <span className="screen-status">{status}</span>
        <span className="spacer" />
        <button
          className="icon-button"
          aria-pressed={isPreviewing}
          aria-label={`${isPreviewing ? 'Hide' : 'Show'} the ${output.name} preview`}
          title={`${isPreviewing ? 'Hide' : 'Show'} preview`}
          onClick={() => onPreview(!isPreviewing)}
        >
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            {isPreviewing ? <circle cx="12" cy="12" r="3" /> : <path d="M4 4l16 16" />}
          </svg>
        </button>
        <button
          className="switch"
          role="switch"
          aria-checked={output.isOn}
          aria-label={`${output.name} screen`}
          title={output.isOn ? `Switch the ${output.name.toLowerCase()} off` : `Switch the ${output.name.toLowerCase()} on`}
          onClick={() => dispatch({ type: 'output.power', outputId: output.id, isOn: !output.isOn })}
        >
          <span className="switch-knob" aria-hidden="true" />
        </button>
      </div>
      {isPreviewing && (
        <div className="screen-monitor">
          <RenderView className="monitor-screen" render={render} />
          {overlay && <span className="screen-overlay">{overlay}</span>}
        </div>
      )}
      {isProjector && <span className="screen-caption">{describe(snapshot, state.live.slide)}</span>}
    </section>
  )
}

function LayerList({ snapshot }: { snapshot: OperatorSnapshot }) {
  const values = layerValues(snapshot)
  return (
    <div className="layer-list" role="group" aria-label="What is on screen, by layer">
      {layers.map((layer) => (
        <LayerRow key={layer.key} layer={layer} value={values[layer.key]} />
      ))}
    </div>
  )
}

interface LayerRowProps {
  layer: Layer
  value: { text: string; canClear: boolean } | null
}

function LayerRow({ layer, value }: LayerRowProps) {
  return (
    <div className={`layer-row${value ? ' is-on' : ''}`} data-testid={`layer-${layer.key}`}>
      <span className="layer-name">{layer.label}</span>
      <span className="layer-value">{value?.text ?? 'Off'}</span>
      <button
        className="layer-clear"
        onClick={() => dispatch({ type: 'layer.clear', layer: layer.key })}
        disabled={!value?.canClear}
        aria-label={`Clear ${layer.label} layer (${layer.shortcut})`}
        title={`Clear ${layer.label} (${layer.shortcut})`}
      >
        {layer.shortcut}
      </button>
    </div>
  )
}

function BlackButton({ isBlack }: { isBlack: boolean }) {
  return (
    <button className={`black-toggle${isBlack ? ' is-black' : ''}`} aria-pressed={isBlack} onClick={() => dispatch({ type: 'screens.black', isBlack: !isBlack })}>
      {isBlack ? 'Screens are black · bring them back' : 'Black screen'}
      <kbd>Esc</kbd>
    </button>
  )
}

function describe({ decks, instant }: OperatorSnapshot, ref: SlideRef | null): string {
  const deck = [...decks, ...instant].find((d) => d.itemId === ref?.itemId)
  const slide = ref ? deck?.slides[ref.index] : undefined
  return slide && ref ? `${deck!.title} · ${slide.label} · slide ${ref.index + 1}` : 'No words on screen'
}

/** What each layer shows, in words; the background says where it comes from, since three things can set it. */
function layerValues(snapshot: OperatorSnapshot): Record<LayerKey, { text: string; canClear: boolean } | null> {
  const { state, decks, instant, library } = snapshot
  const { live } = state
  const deck = [...decks, ...instant].find((d) => d.itemId === live.slide?.itemId)
  const slide = live.slide ? deck?.slides[live.slide.index] : undefined
  const named = <T extends { id: string }>(list: T[], id: string | null) => list.find((x) => x.id === id)
  const pick = named(library.backgrounds, live.background)
  const own = named(library.backgrounds, deck?.backgroundId ?? null)
  const themes = Object.fromEntries(library.themes.map((t) => [t.id, t]))
  const theme = deck ? lookup(themes, deck.themeId) ?? lookup(themes, classicTheme.id) ?? classicTheme : undefined
  const isPickShown = !!pick && (!deck || state.backgroundPickedFor === deck.itemId)
  const background = isPickShown
    ? { text: pick!.name, canClear: true }
    : own
      ? { text: `${own.name} · the item's own`, canClear: !!pick }
      : theme?.fill
        ? { text: `${theme.name} theme`, canClear: !!pick }
        : pick
          ? { text: pick.name, canClear: true }
          : null
  const audio = named(library.audioCues, live.audio)
  const lowerThird = named(library.lowerThirds, live.lowerThird)
  return {
    background,
    slide: slide ? { text: `${deck!.title} · ${slide.label}`, canClear: true } : null,
    lowerThird: lowerThird ? { text: lowerThird.title, canClear: true } : null,
    audio: audio ? { text: audio.name, canClear: true } : null,
    media: named(library.media, live.media) ? { text: `${named(library.media, live.media)!.name}${state.playback?.isPaused ? ' · paused' : ''}`, canClear: true } : null,
    overlays: live.overlays.length > 0 ? { text: live.overlays.map((id) => named(library.overlays, id)?.name ?? id).join(', '), canClear: true } : null,
  }
}

/** Shown while the media layer has something: where the video is, and play, pause, restart and stop. */
function MediaControls({ snapshot, now }: { snapshot: OperatorSnapshot; now: number }) {
  const { playback, live } = snapshot.state
  const item = snapshot.library.media.find((m) => m.id === live.media)
  if (!item || !playback) return null
  const position = playback.position + (playback.isPaused ? 0 : (now - playback.at) / 1000)
  const end = item.endAt ?? item.duration
  const shown = item.ending === 'loop' && end ? item.startAt + ((position - item.startAt) % Math.max(0.1, end - item.startAt)) : end ? Math.min(position, end) : position
  return (
    <section className="media-controls" aria-label="Media playing">
      <span className="media-controls-name">
        <strong>{item.name}</strong>
        <span className="muted">{item.type === 'video' ? `${formatSeconds(shown)}${end ? ` / ${formatSeconds(end)}` : ''}${playback.isPaused ? ' · paused' : ''}` : 'Image'}</span>
      </span>
      {item.type === 'video' && (
        <>
          <button className="button-quiet button-small" onClick={() => dispatch({ type: 'media.control', action: playback.isPaused ? 'play' : 'pause' })}>
            {playback.isPaused ? 'Play' : 'Pause'}
          </button>
          <button className="button-quiet button-small" onClick={() => dispatch({ type: 'media.control', action: 'restart' })}>
            Restart
          </button>
        </>
      )}
      <button className="button-quiet button-small" aria-label="Stop the media (F5)" onClick={() => dispatch({ type: 'layer.clear', layer: 'media' })}>
        Stop
      </button>
    </section>
  )
}
