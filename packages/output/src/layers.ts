import type { MediaRender, OverlayRender } from '@openstage/shared'
import { buildTrack, el, timeText, type SurfaceMode } from './page'

/**
 * Overlays are diffed one by one, so turning one on never restarts another's scrolling or
 * animation. Each fades out on its own when it is taken off.
 */
export class OverlayLayer {
  private readonly shown = new Map<string, { json: string; element: HTMLElement; timer: ReturnType<typeof setTimeout> | null }>()

  constructor(
    private readonly parent: HTMLElement,
    private readonly mode: SurfaceMode,
  ) {}

  render(overlays: OverlayRender[]): void {
    const wanted = new Set(overlays.map((o) => o.id))
    for (const [id, entry] of this.shown) {
      if (wanted.has(id)) continue
      this.remove(id, entry)
    }
    overlays.forEach((overlay, order) => {
      const json = JSON.stringify(overlay)
      const current = this.shown.get(overlay.id)
      if (current?.json === json) {
        current.element.style.zIndex = String(order + 1)
        return
      }
      if (current) this.remove(overlay.id, current, true)
      const element = buildOverlay(overlay, this.mode)
      element.style.zIndex = String(order + 1)
      this.parent.append(element)
      const timer = overlay.kind === 'banner' && overlay.hideAfter && !this.mode.isStatic ? setTimeout(() => element.classList.add('is-leaving'), overlay.hideAfter * 1000) : null
      this.shown.set(overlay.id, { json, element, timer })
    })
  }

  destroy(): void {
    for (const entry of this.shown.values()) if (entry.timer) clearTimeout(entry.timer)
  }

  private remove(id: string, entry: { element: HTMLElement; timer: ReturnType<typeof setTimeout> | null }, isInstant = false): void {
    if (entry.timer) clearTimeout(entry.timer)
    this.shown.delete(id)
    if (isInstant || this.mode.isStatic) return entry.element.remove()
    entry.element.classList.add('is-leaving')
    setTimeout(() => entry.element.remove(), 600)
  }
}

function buildOverlay(overlay: OverlayRender, mode: SurfaceMode): HTMLElement {
  const root = el(`os-overlay os-overlay-${overlay.kind}`)
  root.style.fontFamily = overlay.css
  switch (overlay.kind) {
    case 'ticker': {
      root.classList.add(`is-${overlay.position}`)
      Object.assign(root.style, { background: overlay.backColor, color: overlay.textColor })
      root.style.setProperty('--size', String(overlay.size))
      if (overlay.label) {
        const label = el('os-overlay-label')
        label.textContent = overlay.label
        label.style.background = overlay.labelColor
        root.append(label)
      }
      const window = el('os-overlay-ticker-window')
      const separator = overlay.separator ? ` ${overlay.separator} ` : '   '
      window.append(buildTrack(overlay.text + separator, 0, overlay.speed, 'left', mode))
      root.append(window)
      break
    }
    case 'banner': {
      root.classList.add(`is-${overlay.position}`, `is-${overlay.style}`, `motion-${overlay.motion}`)
      root.style.setProperty('--size', String(overlay.size))
      root.style.setProperty('--accent', overlay.accent)
      const box = el('os-banner-box')
      Object.assign(box.style, { background: overlay.style === 'minimal' ? 'transparent' : overlay.backColor, color: overlay.textColor })
      box.append(el('os-banner-accent'))
      const words = el('os-banner-words')
      words.append(Object.assign(el('os-banner-title'), { textContent: overlay.title }))
      if (overlay.subtitle) words.append(Object.assign(el('os-banner-subtitle'), { textContent: overlay.subtitle }))
      box.append(words)
      root.append(box)
      break
    }
    case 'watermark': {
      root.classList.add(`is-${overlay.corner}`)
      Object.assign(root.style, { opacity: String(overlay.opacity), color: overlay.color })
      root.style.setProperty('--size', String(overlay.size))
      root.style.setProperty('--margin', String(overlay.margin))
      if (overlay.src) {
        const image = el('os-watermark-image', 'img') as HTMLImageElement
        image.src = overlay.src
        root.append(image)
      } else {
        root.textContent = overlay.text
      }
      break
    }
    case 'clock': {
      root.classList.add(`is-${overlay.corner}`)
      Object.assign(root.style, { background: overlay.backColor, color: overlay.textColor })
      root.style.setProperty('--size', String(overlay.size))
      const text = el('os-clock')
      text.dataset.clock = JSON.stringify({ mode: 'time', is24Hour: overlay.is24Hour, hasSeconds: overlay.hasSeconds, target: '', minutes: 0, prefix: '', endText: '', start: 0 })
      text.textContent = timeText(new Date(), overlay.is24Hour, overlay.hasSeconds)
      root.append(text)
      break
    }
  }
  return root
}

/**
 * The media layer plays one video or shows one image. The engine sends where the video should be
 * (`position` at `at`), so every output and monitor plays in step and a pause lands on the same frame.
 */
export class MediaLayer {
  private current: { key: string; element: HTMLElement; media: MediaRender } | null = null

  constructor(
    private readonly parent: HTMLElement,
    private readonly mode: SurfaceMode,
  ) {}

  render(media: MediaRender | null): void {
    if (!media) {
      if (this.current) this.leave(this.current.element, this.current.media.fadeMs)
      this.current = null
      return
    }
    if (this.current?.key !== media.key) {
      if (this.current) this.leave(this.current.element, this.current.media.fadeMs)
      const element = media.type === 'image' ? this.image(media) : this.video(media)
      element.classList.add('os-media')
      element.style.objectFit = media.fit === 'stretch' ? 'fill' : media.fit
      if (media.fadeMs > 0 && !this.mode.isStatic) {
        element.style.opacity = '0'
        element.style.transition = `opacity ${media.fadeMs}ms ease`
        requestAnimationFrame(() => (element.style.opacity = '1'))
      }
      this.parent.append(element)
      this.current = { key: media.key, element, media }
    } else {
      this.current.media = media
    }
    if (this.current.element instanceof HTMLVideoElement) this.sync(this.current.element, media)
  }

  private image(media: MediaRender): HTMLElement {
    const image = document.createElement('img')
    image.src = media.src
    return image
  }

  private video(media: MediaRender): HTMLVideoElement {
    const video = document.createElement('video')
    video.src = media.src
    video.playsInline = true
    video.preload = 'auto'
    video.addEventListener('loadedmetadata', () => this.current?.element === video && this.sync(video, this.current.media))
    video.addEventListener('timeupdate', () => this.current?.element === video && this.keepInBounds(video, this.current.media))
    video.addEventListener('ended', () => this.current?.element === video && this.keepInBounds(video, this.current.media, true))
    return video
  }

  /** Where the video should be now, wrapped round for a loop once its length is known. */
  private target(video: HTMLVideoElement, media: MediaRender): number {
    const elapsed = media.isPaused ? 0 : (Date.now() - media.at) / 1000
    const position = media.position + elapsed
    const end = media.endAt ?? (Number.isFinite(video.duration) ? video.duration : null)
    if (media.ending !== 'loop' || end === null || end <= media.startAt) return end === null ? position : Math.min(position, end)
    return media.startAt + ((position - media.startAt) % (end - media.startAt))
  }

  private sync(video: HTMLVideoElement, media: MediaRender): void {
    video.muted = media.isMuted || this.mode.isMuted
    video.volume = media.volume
    if (video.readyState < 1) return
    const target = this.target(video, media)
    if (Math.abs(video.currentTime - target) > 0.3) video.currentTime = target
    if (media.isPaused || this.mode.isStatic) video.pause()
    else void video.play().catch(() => {})
  }

  private keepInBounds(video: HTMLVideoElement, media: MediaRender, hasEnded = false): void {
    const end = media.endAt
    if (!hasEnded && (end === null || video.currentTime < end)) return
    if (media.ending === 'loop') {
      video.currentTime = media.startAt
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  private leave(element: HTMLElement, fadeMs: number): void {
    if (element instanceof HTMLVideoElement) element.pause()
    if (fadeMs <= 0 || this.mode.isStatic) return element.remove()
    element.style.transition = `opacity ${fadeMs}ms ease`
    element.style.opacity = '0'
    setTimeout(() => element.remove(), fadeMs + 50)
  }
}
