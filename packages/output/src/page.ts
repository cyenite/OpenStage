import type { ElementRender, MediaFit, PageBackgroundRender, PageRender, TextStyle } from '@openstage/shared'

/** How a surface draws: outputs play sound and motion; operator monitors are muted; thumbnails also hold still. */
export interface SurfaceMode {
  isMuted: boolean
  isStatic: boolean
}

const objectFit = (fit: MediaFit) => (fit === 'stretch' ? 'fill' : fit)

export function el(className: string, tag: keyof HTMLElementTagNameMap = 'div'): HTMLElement {
  const element = document.createElement(tag)
  element.className = className
  return element
}

export function buildPage(page: PageRender, mode: SurfaceMode): HTMLElement {
  const root = el('os-page')
  root.append(buildPageBackground(page.background, mode))
  for (const element of page.elements) root.append(buildElement(element, mode))
  return root
}

export function buildPageBackground(background: PageBackgroundRender, mode: SurfaceMode): HTMLElement {
  const root = el('os-page-background')
  switch (background.kind) {
    case 'color':
      root.style.background = background.color
      break
    case 'gradient':
      root.style.background = `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`
      break
    case 'animated':
      root.append(buildAnimated(background.preset, background.colors, background.speed, mode))
      break
    case 'image':
    case 'video': {
      const media = background.kind === 'image' ? (el('os-fill', 'img') as HTMLImageElement) : video(background.src, mode, true, true)
      if (media instanceof HTMLImageElement) media.src = background.src
      media.classList.add('os-fill')
      media.style.objectFit = objectFit(background.fit)
      root.append(media)
      if (background.dim > 0) {
        const dim = el('os-fill')
        dim.style.background = `rgba(0, 0, 0, ${background.dim})`
        root.append(dim)
      }
      break
    }
  }
  return root
}

/** Pseudo-random but stable, so a page looks the same on every output and every time it is shown. */
function scatter(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return (value - 1) / 2147483646
  }
}

const particleCounts: Record<string, number> = { bokeh: 14, particles: 36, stars: 90 }

function buildAnimated(preset: string, colors: string[], speed: number, mode: SurfaceMode): HTMLElement {
  const root = el(`os-anim os-anim-${preset}${mode.isStatic ? ' is-static' : ''}`)
  colors.forEach((color, i) => root.style.setProperty(`--c${i + 1}`, color))
  root.style.setProperty('--speed', String(speed))
  const random = scatter(preset.length * 977 + 13)
  if (preset === 'aurora' || preset === 'waves') {
    for (let i = 0; i < 3; i++) root.append(el(`os-anim-blob os-anim-blob-${i + 1}`))
  }
  if (preset === 'rays') root.append(el('os-anim-rays'))
  const count = particleCounts[preset] ?? 0
  for (let i = 0; i < count; i++) {
    const dot = el('os-anim-dot')
    dot.style.setProperty('--x', `${random() * 100}%`)
    dot.style.setProperty('--y', `${random() * 100}%`)
    dot.style.setProperty('--s', String(0.4 + random() * 1.6))
    dot.style.setProperty('--d', String(0.6 + random() * 1.4))
    dot.style.setProperty('--delay', `${-random() * 20}s`)
    dot.style.setProperty('--tint', colors[1 + (i % Math.max(1, colors.length - 1))] ?? '#ffffff')
    root.append(dot)
  }
  return root
}

function video(src: string, mode: SurfaceMode, isMuted: boolean, isLooping: boolean): HTMLVideoElement {
  const element = document.createElement('video')
  element.src = src
  element.muted = isMuted || mode.isMuted
  element.loop = isLooping
  element.playsInline = true
  element.autoplay = !mode.isStatic
  element.preload = 'auto'
  if (!mode.isStatic) void element.play().catch(() => {})
  return element
}

function place(element: HTMLElement, render: ElementRender): void {
  const { frame, rotation, opacity, enter } = render
  Object.assign(element.style, {
    left: `${frame.x * 100}%`,
    top: `${frame.y * 100}%`,
    width: `${frame.w * 100}%`,
    height: `${frame.h * 100}%`,
    opacity: String(opacity),
    transform: rotation ? `rotate(${rotation}deg)` : '',
  })
  if (enter.effect !== 'none') {
    element.classList.add('os-enter', `os-enter-${enter.effect}`)
    element.style.setProperty('--enter-ms', `${enter.durationMs}ms`)
    element.style.setProperty('--enter-delay', `${enter.delayMs}ms`)
  }
}

function applyText(element: HTMLElement, style: TextStyle, css: string | null): void {
  element.classList.add('os-box')
  if (style.hasShadow) element.classList.add('os-shadow')
  element.style.setProperty('--os-font-size', String(style.size))
  Object.assign(element.style, {
    fontFamily: css ?? style.family,
    fontWeight: String(style.weight),
    fontStyle: style.isItalic ? 'italic' : 'normal',
    textTransform: style.isUppercase ? 'uppercase' : 'none',
    color: style.color,
    textAlign: style.align,
    lineHeight: String(style.lineHeight),
    letterSpacing: `${style.letterSpacing}em`,
    justifyContent: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[style.valign],
    alignItems: { left: 'flex-start', center: 'center', right: 'flex-end' }[style.align],
    background: style.backing ?? '',
  })
  if (style.backing) element.classList.add('os-backed')
}

export function buildElement(render: ElementRender, mode: SurfaceMode): HTMLElement {
  const element = el(`os-el os-el-${render.kind}`)
  place(element, render)
  switch (render.kind) {
    case 'text': {
      applyText(element, render.style, render.css)
      const text = el('os-text')
      for (const line of render.text.split('\n')) text.append(Object.assign(el('os-line'), { textContent: line }))
      element.append(text)
      break
    }
    case 'clock': {
      applyText(element, render.style, render.css)
      const text = el('os-text os-clock')
      text.dataset.clock = JSON.stringify({ mode: render.mode, is24Hour: render.is24Hour, hasSeconds: render.hasSeconds, target: render.target, minutes: render.minutes, prefix: render.prefix, endText: render.endText, start: Date.now() })
      text.textContent = clockText(text.dataset.clock, Date.now())
      element.append(text)
      break
    }
    case 'ticker': {
      applyText(element, render.style, render.css)
      element.classList.add('os-ticker-box')
      element.append(buildTrack(render.text, render.gap, render.speed, render.direction, mode))
      break
    }
    case 'qr':
      element.append(qrSvg(render.modules, render.foreground, render.background, render.quietZone))
      break
    case 'shape':
      Object.assign(element.style, {
        background: render.fill,
        border: render.strokeWidth > 0 ? `${render.strokeWidth * 100}cqh solid ${render.stroke}` : '',
        borderRadius: render.shape === 'ellipse' ? '50%' : `${render.radius * 100}cqh`,
      })
      break
    case 'image': {
      const image = el('os-fill', 'img') as HTMLImageElement
      image.src = render.src
      image.style.objectFit = objectFit(render.fit)
      element.style.borderRadius = `${render.radius * 100}cqh`
      element.append(image)
      break
    }
    case 'video': {
      const media = video(render.src, mode, render.isMuted, render.isLooping)
      media.className = 'os-fill'
      media.style.objectFit = objectFit(render.fit)
      element.style.borderRadius = `${render.radius * 100}cqh`
      element.append(media)
      break
    }
  }
  return element
}

/**
 * A line that scrolls forever: the text is laid out twice, back to back, and the track moves by one
 * copy. Speed is in screen widths per minute, so it reads the same on any output size.
 */
export function buildTrack(text: string, gap: number, speed: number, direction: 'left' | 'right', mode: SurfaceMode): HTMLElement {
  const track = el('os-track')
  track.style.setProperty('--gap', `${gap * 100}cqw`)
  for (let i = 0; i < 2; i++) track.append(Object.assign(el('os-track-copy'), { textContent: text.replace(/\n/g, ' · ') }))
  if (mode.isStatic) return track
  track.classList.add(direction === 'right' ? 'is-moving-right' : 'is-moving')
  requestAnimationFrame(() => {
    const copy = track.firstElementChild as HTMLElement | null
    const screen = track.closest<HTMLElement>('.os-stage')?.clientWidth ?? 0
    if (!copy || !screen) return
    const seconds = (copy.offsetWidth / screen / speed) * 60
    track.style.setProperty('--ticker-seconds', `${Math.max(2, seconds)}s`)
  })
  return track
}

function qrSvg(modules: string[], foreground: string, background: string, quietZone: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  const size = modules.length + quietZone * 2
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  svg.setAttribute('shape-rendering', 'crispEdges')
  svg.classList.add('os-fill')
  const back = document.createElementNS(ns, 'rect')
  Object.entries({ width: size, height: size, fill: background }).forEach(([k, v]) => back.setAttribute(k, String(v)))
  const path = document.createElementNS(ns, 'path')
  let d = ''
  modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '1') d += `M${x + quietZone} ${y + quietZone}h1v1h-1z`
  })
  path.setAttribute('d', d)
  path.setAttribute('fill', foreground)
  svg.append(back, path)
  return svg
}

const pad = (n: number) => String(n).padStart(2, '0')

function duration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function timeText(now: Date, is24Hour: boolean, hasSeconds: boolean): string {
  const hours = now.getHours()
  const h = is24Hour ? pad(hours) : String(hours % 12 || 12)
  const tail = is24Hour ? '' : hours < 12 ? ' AM' : ' PM'
  return `${h}:${pad(now.getMinutes())}${hasSeconds ? `:${pad(now.getSeconds())}` : ''}${tail}`
}

/** The words a clock element shows at `now`; its settings travel in a data attribute so every tick can recompute them. */
export function clockText(settings: string, now: number): string {
  const c = JSON.parse(settings) as { mode: string; is24Hour: boolean; hasSeconds: boolean; target: string; minutes: number; prefix: string; endText: string; start: number }
  const prefix = c.prefix ? `${c.prefix} ` : ''
  const date = new Date(now)
  if (c.mode === 'time') return prefix + timeText(date, c.is24Hour, c.hasSeconds)
  if (c.mode === 'date') return prefix + date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  if (c.mode === 'elapsed') return prefix + duration((now - c.start) / 1000)
  let remaining = c.minutes * 60 - (now - c.start) / 1000
  if (c.mode === 'countdownTo') {
    const [h, m] = c.target.split(':').map(Number)
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime()
    remaining = (target - now) / 1000
  }
  return remaining <= 0 && c.endText ? c.endText : prefix + duration(remaining)
}
