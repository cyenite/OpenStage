import type { BackgroundRender, LowerThirdRender, RenderState, SlideRender, TextBoxRender } from '@openstage/shared'
import { MediaLayer, OverlayLayer } from './layers'
import { buildPage, clockText, type SurfaceMode } from './page'
import { StageView } from './stage'

/**
 * Draws a RenderState into a host element. Used full screen by output windows and scaled down
 * by the operator's Preview and Live panes, so what the operator sees is the same code path.
 */
export class OutputSurface {
  private readonly stage: HTMLElement
  private readonly slide: LayerView
  private readonly background: LayerView
  private readonly lowerThird: LayerView
  private readonly media: MediaLayer
  private readonly overlays: OverlayLayer
  private readonly stageView: StageView
  private readonly mode: SurfaceMode
  private readonly clockTimer: ReturnType<typeof setInterval>

  /** Monitors in the operator window pass `isMuted`; slide thumbnails also pass `isStatic`, so nothing moves or plays. */
  constructor(host: HTMLElement, mode: Partial<SurfaceMode> = {}) {
    this.mode = { isMuted: mode.isMuted ?? false, isStatic: mode.isStatic ?? false }
    host.classList.add('os-host')
    this.stage = append(host, 'os-stage')
    if (this.mode.isStatic) this.stage.classList.add('is-static')
    // One fixed container per layer: a layer's new frame is appended inside its own container, never over the layers above it.
    this.background = new LayerView(append(this.stage, 'os-layer-slot'))
    this.media = new MediaLayer(append(this.stage, 'os-layer-slot'), this.mode)
    this.slide = new LayerView(append(this.stage, 'os-layer-slot'))
    this.lowerThird = new LayerView(append(this.stage, 'os-layer-slot'))
    this.overlays = new OverlayLayer(append(this.stage, 'os-layer-slot'), this.mode)
    this.stageView = new StageView(this.stage)
    this.clockTimer = setInterval(() => this.tick(), 250)
    void document.fonts?.ready.then(() => this.refit())
  }

  render(state: RenderState): void {
    const ms = state.transitionMs
    this.stage.style.setProperty('--os-aspect', String(state.aspect))
    this.background.show(state.background, ms, buildBackground)
    this.media.render(state.media ?? null)
    this.slide.show(state.slide, ms, (slide) => buildSlide(slide, this.mode))
    this.lowerThird.show(state.lowerThird, ms, buildLowerThird)
    this.overlays.render(state.overlays ?? [])
    this.stageView.render(state.stage ?? null)
  }

  destroy(): void {
    clearInterval(this.clockTimer)
    this.media.render(null)
    this.overlays.destroy()
    this.stageView.destroy()
    this.stage.remove()
  }

  /** Clocks and countdowns on pages and overlays redraw themselves; the engine only sends their settings. */
  private tick(): void {
    const now = Date.now()
    this.stage.querySelectorAll<HTMLElement>('[data-clock]').forEach((clock) => {
      const text = clockText(clock.dataset.clock!, now)
      if (clock.textContent !== text) clock.textContent = text
    })
  }

  private refit(): void {
    this.stage.querySelectorAll<HTMLElement>('.os-box').forEach(fitBox)
  }
}

class LayerView {
  private json: string | null = null
  private element: HTMLElement | null = null

  constructor(private readonly parent: HTMLElement) {}

  show<T>(content: T | null, transitionMs: number, build: (content: T) => HTMLElement): void {
    const json = content === null ? null : JSON.stringify(content)
    if (json === this.json) return
    this.json = json
    if (this.element) fadeOut(this.element, transitionMs)
    this.element = content === null ? null : build(content)
    if (!this.element) return
    const element = this.element
    element.classList.add('os-layer')
    this.parent.append(element)
    element.querySelectorAll<HTMLElement>('.os-box').forEach(fitBox)
    if (transitionMs <= 0) return
    element.style.opacity = '0'
    requestAnimationFrame(() => {
      element.style.transition = `opacity ${transitionMs}ms ease`
      element.style.opacity = '1'
    })
  }
}

function fadeOut(element: HTMLElement, transitionMs: number): void {
  if (transitionMs <= 0) return element.remove()
  element.style.transition = `opacity ${transitionMs}ms ease`
  element.style.opacity = '0'
  setTimeout(() => element.remove(), transitionMs + 50)
}

function paint(background: BackgroundRender): string {
  return background.kind === 'color' ? background.color : `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`
}

function buildBackground(background: BackgroundRender): HTMLElement {
  const element = document.createElement('div')
  element.className = 'os-background'
  element.style.background = paint(background)
  return element
}

function buildSlide(slide: SlideRender, mode: SurfaceMode): HTMLElement {
  const element = document.createElement('div')
  element.className = 'os-slide'
  element.dataset.key = slide.key
  if (slide.page) {
    element.append(buildPage(slide.page, mode))
    return element
  }
  if (slide.fill) element.style.background = paint(slide.fill)
  for (const box of slide.boxes) element.append(buildBox(box))
  return element
}

function buildBox(box: TextBoxRender): HTMLElement {
  const element = document.createElement('div')
  element.className = `os-box os-box-${box.role}`
  element.dataset.role = box.role
  Object.assign(element.style, {
    left: `${box.frame.x * 100}%`,
    top: `${box.frame.y * 100}%`,
    width: `${box.frame.w * 100}%`,
    height: `${box.frame.h * 100}%`,
    color: box.color,
    textAlign: box.align,
    fontFamily: box.font.family,
    fontWeight: String(box.font.weight),
    fontStyle: box.font.italic ? 'italic' : 'normal',
    alignItems: { left: 'flex-start', center: 'center', right: 'flex-end' }[box.align],
  })
  element.style.setProperty('--os-font-size', String(box.font.size))
  if (box.hasShadow) element.classList.add('os-shadow')
  if (box.backing) {
    element.classList.add('os-backed')
    element.style.background = box.backing
  }
  const text = append(element, 'os-text')
  for (const line of box.lines) append(text, 'os-line').textContent = line
  return element
}

function buildLowerThird(lowerThird: LowerThirdRender): HTMLElement {
  const element = document.createElement('div')
  element.className = 'os-lower-third'
  const bar = append(element, 'os-lower-third-bar')
  append(bar, 'os-lower-third-title').textContent = lowerThird.title
  append(bar, 'os-lower-third-subtitle').textContent = lowerThird.subtitle
  return element
}

/** Shrinks a box's text until it fits its frame; long verses must never spill off screen. */
function fitBox(box: HTMLElement): void {
  const text = box.firstElementChild as HTMLElement | null
  if (!text || !box.isConnected || box.clientHeight === 0) return
  let scale = 1
  box.style.setProperty('--os-fit', '1')
  while (scale > 0.35 && (text.offsetHeight > box.clientHeight + 1 || text.scrollWidth > box.clientWidth + 1)) {
    scale *= 0.92
    box.style.setProperty('--os-fit', String(scale))
  }
}

function append(parent: HTMLElement, className: string): HTMLElement {
  const element = document.createElement('div')
  element.className = className
  parent.append(element)
  return element
}
