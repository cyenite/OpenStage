import type { BackgroundRender, LowerThirdRender, RenderState, SlideRender, TextBoxRender } from '@openstage/shared'

/**
 * Draws a RenderState into a host element. Used full screen by output windows and scaled down
 * by the operator's Preview and Live panes, so what the operator sees is the same code path.
 */
export class OutputSurface {
  private readonly stage: HTMLElement
  private readonly slide: LayerView
  private readonly background: LayerView
  private readonly lowerThird: LayerView

  constructor(host: HTMLElement) {
    host.classList.add('os-host')
    this.stage = append(host, 'os-stage')
    this.background = new LayerView(this.stage)
    this.slide = new LayerView(this.stage)
    this.lowerThird = new LayerView(this.stage)
    void document.fonts?.ready.then(() => this.refit())
  }

  render(state: RenderState): void {
    const ms = state.transitionMs
    this.stage.style.setProperty('--os-aspect', String(state.aspect))
    this.background.show(state.background, ms, buildBackground)
    this.slide.show(state.slide, ms, buildSlide)
    this.lowerThird.show(state.lowerThird, ms, buildLowerThird)
  }

  destroy(): void {
    this.stage.remove()
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

function buildSlide(slide: SlideRender): HTMLElement {
  const element = document.createElement('div')
  element.className = 'os-slide'
  element.dataset.key = slide.key
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
