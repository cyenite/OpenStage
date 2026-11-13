import qrcode from 'qrcode-generator'
import { isSafeId } from './ids'
import type { Id } from './library'
import type { Rect01 } from './render'
import { fontCss, fontFamilies } from './themes'

/** Declaration order is the order the editor offers them in. */
export const animatedPresets = [
  { key: 'aurora', label: 'Aurora' },
  { key: 'drift', label: 'Colour drift' },
  { key: 'waves', label: 'Waves' },
  { key: 'bokeh', label: 'Bokeh' },
  { key: 'particles', label: 'Rising particles' },
  { key: 'rays', label: 'Light rays' },
  { key: 'stars', label: 'Starfield' },
] as const

export type AnimatedPreset = (typeof animatedPresets)[number]['key']

export const mediaFits = [
  { key: 'cover', label: 'Fill' },
  { key: 'contain', label: 'Fit' },
  { key: 'stretch', label: 'Stretch' },
] as const

export type MediaFit = (typeof mediaFits)[number]['key']

export type PageBackground =
  /** Lets the background layer show through. */
  | { kind: 'none' }
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'animated'; preset: AnimatedPreset; colors: string[]; speed: number }
  | { kind: 'image'; mediaId: Id; fit: MediaFit; dim: number }
  | { kind: 'video'; mediaId: Id; fit: MediaFit; dim: number }

/** Declaration order is menu order. */
export const pageBackgroundKinds = [
  { key: 'none', label: 'Background layer' },
  { key: 'color', label: 'Colour' },
  { key: 'gradient', label: 'Gradient' },
  { key: 'animated', label: 'Animated' },
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
] as const satisfies readonly { key: PageBackground['kind']; label: string }[]

export const enterEffects = [
  { key: 'none', label: 'None' },
  { key: 'fade', label: 'Fade' },
  { key: 'rise', label: 'Rise' },
  { key: 'drop', label: 'Drop' },
  { key: 'zoom', label: 'Zoom' },
  { key: 'slideLeft', label: 'Slide from right' },
  { key: 'slideRight', label: 'Slide from left' },
  { key: 'blur', label: 'Unblur' },
  { key: 'pulse', label: 'Pulse (repeats)' },
] as const

export type EnterEffect = (typeof enterEffects)[number]['key']

export interface ElementAnimation {
  effect: EnterEffect
  durationMs: number
  delayMs: number
}

export type VerticalAlign = 'top' | 'middle' | 'bottom'

export interface TextStyle {
  family: string
  weight: number
  /** Line height as a fraction of the output's height, like theme fonts. */
  size: number
  isItalic: boolean
  isUppercase: boolean
  color: string
  align: 'left' | 'center' | 'right'
  valign: VerticalAlign
  lineHeight: number
  /** In em. */
  letterSpacing: number
  hasShadow: boolean
  /** A band painted behind the text; null paints nothing. */
  backing: string | null
}

export const clockModes = [
  { key: 'time', label: 'Time of day' },
  { key: 'date', label: 'Date' },
  { key: 'countdownTo', label: 'Countdown to a time' },
  { key: 'countdown', label: 'Countdown timer' },
  { key: 'elapsed', label: 'Count up' },
] as const

export type ClockMode = (typeof clockModes)[number]['key']

export const qrLevels = [
  { key: 'L', label: 'Low (7%)' },
  { key: 'M', label: 'Medium (15%)' },
  { key: 'Q', label: 'Quartile (25%)' },
  { key: 'H', label: 'High (30%)' },
] as const

export type QrLevel = (typeof qrLevels)[number]['key']

export interface ElementBase {
  id: Id
  /** Shown in the editor's layer list. */
  name: string
  frame: Rect01
  /** Degrees, clockwise. */
  rotation: number
  opacity: number
  enter: ElementAnimation
  isLocked: boolean
  isHidden: boolean
}

export type PageElement = ElementBase &
  (
    | { kind: 'text'; text: string; style: TextStyle }
    | {
        kind: 'clock'
        mode: ClockMode
        is24Hour: boolean
        hasSeconds: boolean
        /** `HH:MM` for a countdown to a time of day. */
        target: string
        /** Length of a countdown timer. */
        minutes: number
        prefix: string
        /** Shown once a countdown reaches zero; empty keeps 0:00. */
        endText: string
        style: TextStyle
      }
    | { kind: 'qr'; data: string; level: QrLevel; foreground: string; background: string; quietZone: number }
    | { kind: 'shape'; shape: 'rectangle' | 'ellipse'; fill: string; stroke: string; strokeWidth: number; radius: number }
    | { kind: 'image'; mediaId: Id; fit: MediaFit; radius: number }
    | { kind: 'video'; mediaId: Id; fit: MediaFit; radius: number; isMuted: boolean; isLooping: boolean }
    /** A scrolling line of text: announcements, a verse, a welcome. */
    | { kind: 'ticker'; text: string; style: TextStyle; speed: number; direction: 'left' | 'right'; gap: number }
  )

export type ElementKind = PageElement['kind']

/** Declaration order is the editor's insert menu. */
export const elementKinds = [
  { key: 'text', label: 'Text' },
  { key: 'clock', label: 'Clock' },
  { key: 'qr', label: 'QR code' },
  { key: 'shape', label: 'Shape' },
  { key: 'image', label: 'Image' },
  { key: 'video', label: 'Video' },
  { key: 'ticker', label: 'Scrolling text' },
] as const satisfies readonly { key: ElementKind; label: string }[]

export interface Page {
  id: Id
  name: string
  background: PageBackground
  elements: PageElement[]
  /** For the operator and the stage screen. */
  notes: string
  /** Moves on by itself after this many seconds; null waits for the operator. */
  advanceAfter: number | null
}

/** A deck of designed pages: announcements, a sermon outline, a giving slide, a countdown. */
export interface Presentation {
  id: Id
  title: string
  /** After the last page, start again at the first (a walk-in loop). */
  isLooping: boolean
  pages: Page[]
}

export const overlayKinds = [
  { key: 'ticker', label: 'Scrolling message' },
  { key: 'banner', label: 'Title banner' },
  { key: 'watermark', label: 'Watermark' },
  { key: 'clock', label: 'Corner clock' },
] as const

export type OverlayKind = (typeof overlayKinds)[number]['key']

export const corners = [
  { key: 'topLeft', label: 'Top left' },
  { key: 'topRight', label: 'Top right' },
  { key: 'bottomLeft', label: 'Bottom left' },
  { key: 'bottomRight', label: 'Bottom right' },
] as const

export type Corner = (typeof corners)[number]['key']

export const bannerPositions = [
  { key: 'top', label: 'Top' },
  { key: 'middle', label: 'Middle' },
  { key: 'bottom', label: 'Bottom' },
] as const

export const bannerStyles = [
  { key: 'bar', label: 'Full-width bar' },
  { key: 'card', label: 'Card' },
  { key: 'minimal', label: 'Text only' },
] as const

export const bannerMotions = [
  { key: 'slide', label: 'Slide in' },
  { key: 'fade', label: 'Fade' },
  { key: 'wipe', label: 'Wipe' },
] as const

/** Things that sit over everything else on the projector; several can be on at once. */
export type Overlay = { id: Id; name: string } & (
  | {
      kind: 'ticker'
      text: string
      /** A tag at the start, like NEWS or KARIBU; empty for none. */
      label: string
      position: 'top' | 'bottom'
      /** Screen widths per minute. */
      speed: number
      family: string
      size: number
      textColor: string
      backColor: string
      labelColor: string
      /** Between repeats of the text. */
      separator: string
    }
  | {
      kind: 'banner'
      title: string
      subtitle: string
      position: (typeof bannerPositions)[number]['key']
      style: (typeof bannerStyles)[number]['key']
      motion: (typeof bannerMotions)[number]['key']
      family: string
      size: number
      textColor: string
      backColor: string
      accent: string
      /** Hides itself after this many seconds; null stays until taken off. */
      hideAfter: number | null
    }
  | { kind: 'watermark'; text: string; mediaId: Id | null; corner: Corner; size: number; opacity: number; margin: number; color: string; family: string }
  | { kind: 'clock'; corner: Corner; is24Hour: boolean; hasSeconds: boolean; size: number; textColor: string; backColor: string; family: string }
)

export const mediaEndings = [
  { key: 'freeze', label: 'Hold the last frame' },
  { key: 'loop', label: 'Loop' },
  { key: 'clear', label: 'Clear the media layer' },
] as const

export type MediaEnding = (typeof mediaEndings)[number]['key']

/** An image or video copied into the library; the file lives beside the documents in `media-files`. */
export interface MediaItem {
  id: Id
  name: string
  type: 'image' | 'video'
  /** The stored file's name, `<id>.<extension>`. */
  file: string
  /** Seconds, for videos, measured when it was added. */
  duration: number | null
  fit: MediaFit
  volume: number
  isMuted: boolean
  ending: MediaEnding
  /** Seconds into the video where playing starts. */
  startAt: number
  /** Seconds where playing stops; null plays to the end. */
  endAt: number | null
  fadeMs: number
}

/** Rendered page and overlay data: media resolved to URLs, QR codes to their modules, fonts to CSS. Outputs never see the library. */
export interface PageRender {
  background: PageBackgroundRender
  elements: ElementRender[]
}

export type PageBackgroundRender = Exclude<PageBackground, { kind: 'image' } | { kind: 'video' }> | { kind: 'image' | 'video'; src: string; fit: MediaFit; dim: number }

/** Omit for each member of a union, so the kinds stay told apart. */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type Drawn<K extends ElementKind> = Without<Extract<PageElement, { kind: K }>, 'name' | 'isLocked' | 'isHidden'>

export type ElementRender =
  | (Drawn<'text' | 'clock' | 'ticker' | 'shape'> & { css: string | null })
  | (Drawn<'qr'> & { modules: string[] })
  | (Without<Drawn<'image' | 'video'>, 'mediaId'> & { src: string })

export type OverlayRender = Overlay & { css: string; src: string | null }

export interface MediaRender {
  /** Changes whenever playing starts again, so outputs restart the video. */
  key: string
  type: 'image' | 'video'
  src: string
  fit: MediaFit
  volume: number
  isMuted: boolean
  ending: MediaEnding
  startAt: number
  endAt: number | null
  fadeMs: number
  isPaused: boolean
  /** Where the video was, in seconds from its start, at `at` (epoch milliseconds); outputs play on from there. */
  position: number
  at: number
}

export const mediaUrl = (file: string) => `openstage-media://file/${encodeURIComponent(file)}`

const isText = (value: unknown): value is string => typeof value === 'string'
const text = (value: unknown, max: number, fallback = '') => (isText(value) ? value.slice(0, max) : fallback)
const color = (value: unknown, fallback: string) => (isText(value) && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9., %]+\)|transparent)$/.test(value.trim()) ? value.trim() : fallback)
const number = (value: unknown, min: number, max: number, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback)
const pick = <T extends string>(value: unknown, options: readonly { key: T }[], fallback: T): T => (options.some((o) => o.key === value) ? (value as T) : fallback)
const flag = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback)
const id = (value: unknown, fallback: Id) => (isSafeId(value) ? value : fallback)
const align = [{ key: 'left' }, { key: 'center' }, { key: 'right' }] as const
const valign = [{ key: 'top' }, { key: 'middle' }, { key: 'bottom' }] as const
const fit = mediaFits

export const defaultTextStyle: TextStyle = {
  family: 'inter',
  weight: 600,
  size: 0.07,
  isItalic: false,
  isUppercase: false,
  color: '#FFFFFF',
  align: 'center',
  valign: 'middle',
  lineHeight: 1.2,
  letterSpacing: 0,
  hasShadow: true,
  backing: null,
}

export function cleanTextStyle(raw: unknown): TextStyle {
  const s = (raw ?? {}) as Partial<TextStyle>
  const family = isText(s.family) && s.family.length <= 80 ? s.family : defaultTextStyle.family
  return {
    family,
    weight: number(s.weight, 100, 900, defaultTextStyle.weight),
    size: number(s.size, 0.01, 0.5, defaultTextStyle.size),
    isItalic: flag(s.isItalic),
    isUppercase: flag(s.isUppercase),
    color: color(s.color, defaultTextStyle.color),
    align: pick(s.align, align, 'center'),
    valign: pick(s.valign, valign, 'middle'),
    lineHeight: number(s.lineHeight, 0.7, 3, defaultTextStyle.lineHeight),
    letterSpacing: number(s.letterSpacing, -0.2, 1, 0),
    hasShadow: flag(s.hasShadow, true),
    backing: s.backing === null || s.backing === undefined ? null : color(s.backing, 'rgba(0, 0, 0, 0.6)'),
  }
}

function cleanFrame(raw: unknown): Rect01 {
  const f = (raw ?? {}) as Partial<Rect01>
  return { x: number(f.x, -1, 2, 0.1), y: number(f.y, -1, 2, 0.1), w: number(f.w, 0.005, 3, 0.3), h: number(f.h, 0.005, 3, 0.2) }
}

/** Elements come from the window, imports and files on disk, so every field is checked; an unknown kind is dropped. */
export function cleanElement(raw: unknown): PageElement | null {
  const e = (raw ?? {}) as Record<string, unknown>
  const animation = (e.enter ?? {}) as Partial<ElementAnimation>
  const base: ElementBase = {
    id: id(e.id, 'element'),
    name: text(e.name, 80),
    frame: cleanFrame(e.frame),
    rotation: number(e.rotation, -360, 360, 0),
    opacity: number(e.opacity, 0, 1, 1),
    enter: { effect: pick(animation.effect, enterEffects, 'none'), durationMs: number(animation.durationMs, 0, 10_000, 600), delayMs: number(animation.delayMs, 0, 60_000, 0) },
    isLocked: flag(e.isLocked),
    isHidden: flag(e.isHidden),
  }
  switch (e.kind) {
    case 'text':
      return { ...base, kind: 'text', text: text(e.text, 4000), style: cleanTextStyle(e.style) }
    case 'clock':
      return {
        ...base,
        kind: 'clock',
        mode: pick(e.mode, clockModes, 'time'),
        is24Hour: flag(e.is24Hour),
        hasSeconds: flag(e.hasSeconds),
        target: isText(e.target) && /^\d{1,2}:\d{2}$/.test(e.target) ? e.target : '10:00',
        minutes: number(e.minutes, 0.1, 24 * 60, 5),
        prefix: text(e.prefix, 120),
        endText: text(e.endText, 120),
        style: cleanTextStyle(e.style),
      }
    case 'qr':
      return {
        ...base,
        kind: 'qr',
        data: text(e.data, 1200, 'https://'),
        level: pick(e.level, qrLevels, 'M'),
        foreground: color(e.foreground, '#000000'),
        background: color(e.background, '#FFFFFF'),
        quietZone: number(e.quietZone, 0, 8, 2),
      }
    case 'shape':
      return {
        ...base,
        kind: 'shape',
        shape: e.shape === 'ellipse' ? 'ellipse' : 'rectangle',
        fill: color(e.fill, 'rgba(0, 0, 0, 0.5)'),
        stroke: color(e.stroke, 'transparent'),
        strokeWidth: number(e.strokeWidth, 0, 0.1, 0),
        radius: number(e.radius, 0, 0.5, 0.02),
      }
    case 'image':
      return { ...base, kind: 'image', mediaId: id(e.mediaId, 'missing'), fit: pick(e.fit, fit, 'cover'), radius: number(e.radius, 0, 0.5, 0) }
    case 'video':
      return {
        ...base,
        kind: 'video',
        mediaId: id(e.mediaId, 'missing'),
        fit: pick(e.fit, fit, 'cover'),
        radius: number(e.radius, 0, 0.5, 0),
        isMuted: flag(e.isMuted, true),
        isLooping: flag(e.isLooping, true),
      }
    case 'ticker':
      return {
        ...base,
        kind: 'ticker',
        text: text(e.text, 2000),
        style: cleanTextStyle(e.style),
        speed: number(e.speed, 0.5, 60, 8),
        direction: e.direction === 'right' ? 'right' : 'left',
        gap: number(e.gap, 0, 2, 0.15),
      }
    default:
      return null
  }
}

export function cleanBackground(raw: unknown): PageBackground {
  const b = (raw ?? {}) as Record<string, unknown>
  switch (b.kind) {
    case 'color':
      return { kind: 'color', color: color(b.color, '#101014') }
    case 'gradient':
      return { kind: 'gradient', from: color(b.from, '#22324A'), to: color(b.to, '#0B1220'), angle: number(b.angle, 0, 360, 160) }
    case 'animated': {
      const colors = Array.isArray(b.colors) ? b.colors.slice(0, 4).map((c, i) => color(c, defaultAnimatedColors[i] ?? '#334')) : defaultAnimatedColors
      return { kind: 'animated', preset: pick(b.preset, animatedPresets, 'aurora'), colors: colors.length > 1 ? colors : defaultAnimatedColors, speed: number(b.speed, 0.1, 4, 1) }
    }
    case 'image':
    case 'video':
      return { kind: b.kind, mediaId: id(b.mediaId, 'missing'), fit: pick(b.fit, fit, 'cover'), dim: number(b.dim, 0, 0.9, 0) }
    default:
      return { kind: 'none' }
  }
}

export const defaultAnimatedColors = ['#1B2B4B', '#3A1C4A', '#0E3B3A']

export function cleanPage(raw: unknown): Page | null {
  const p = (raw ?? {}) as Record<string, unknown>
  if (!isSafeId(p.id)) return null
  const elements = (Array.isArray(p.elements) ? p.elements : []).slice(0, 200).map(cleanElement).filter((e): e is PageElement => e !== null)
  const seen = new Set<Id>()
  return {
    id: p.id,
    name: text(p.name, 120, 'Page'),
    background: cleanBackground(p.background),
    elements: elements.filter((e) => !seen.has(e.id) && !!seen.add(e.id)),
    notes: text(p.notes, 4000),
    advanceAfter: p.advanceAfter === null || p.advanceAfter === undefined ? null : number(p.advanceAfter, 1, 3600, 10),
  }
}

export function cleanOverlay(raw: unknown): Overlay | null {
  const o = (raw ?? {}) as Record<string, unknown>
  if (!isSafeId(o.id)) return null
  const base = { id: o.id, name: text(o.name, 120) }
  const family = isText(o.family) && o.family.length <= 80 ? o.family : 'inter'
  switch (o.kind) {
    case 'ticker':
      return {
        ...base,
        kind: 'ticker',
        text: text(o.text, 4000),
        label: text(o.label, 40),
        position: o.position === 'top' ? 'top' : 'bottom',
        speed: number(o.speed, 0.5, 60, 8),
        family,
        size: number(o.size, 0.02, 0.15, 0.045),
        textColor: color(o.textColor, '#FFFFFF'),
        backColor: color(o.backColor, 'rgba(10, 10, 14, 0.85)'),
        labelColor: color(o.labelColor, '#F2A93B'),
        separator: text(o.separator, 12, '•'),
      }
    case 'banner':
      return {
        ...base,
        kind: 'banner',
        title: text(o.title, 200),
        subtitle: text(o.subtitle, 300),
        position: pick(o.position, bannerPositions, 'bottom'),
        style: pick(o.style, bannerStyles, 'bar'),
        motion: pick(o.motion, bannerMotions, 'slide'),
        family,
        size: number(o.size, 0.02, 0.2, 0.06),
        textColor: color(o.textColor, '#FFFFFF'),
        backColor: color(o.backColor, 'rgba(10, 10, 14, 0.82)'),
        accent: color(o.accent, '#F2A93B'),
        hideAfter: o.hideAfter === null || o.hideAfter === undefined ? null : number(o.hideAfter, 1, 3600, 10),
      }
    case 'watermark':
      return {
        ...base,
        kind: 'watermark',
        text: text(o.text, 120),
        mediaId: o.mediaId === null || o.mediaId === undefined ? null : id(o.mediaId, 'missing'),
        corner: pick(o.corner, corners, 'bottomRight'),
        size: number(o.size, 0.02, 0.4, 0.08),
        opacity: number(o.opacity, 0.05, 1, 0.6),
        margin: number(o.margin, 0, 0.2, 0.03),
        color: color(o.color, '#FFFFFF'),
        family,
      }
    case 'clock':
      return {
        ...base,
        kind: 'clock',
        corner: pick(o.corner, corners, 'topRight'),
        is24Hour: flag(o.is24Hour),
        hasSeconds: flag(o.hasSeconds),
        size: number(o.size, 0.02, 0.2, 0.05),
        textColor: color(o.textColor, '#FFFFFF'),
        backColor: color(o.backColor, 'rgba(0, 0, 0, 0.45)'),
        family,
      }
    default:
      return null
  }
}

export function cleanMediaSettings(raw: Partial<MediaItem>, current: MediaItem): MediaItem {
  return {
    ...current,
    name: text(raw.name, 200, current.name).trim() || current.name,
    fit: pick(raw.fit, fit, current.fit),
    volume: number(raw.volume, 0, 1, current.volume),
    isMuted: flag(raw.isMuted, current.isMuted),
    ending: pick(raw.ending, mediaEndings, current.ending),
    startAt: number(raw.startAt, 0, 24 * 3600, current.startAt),
    endAt: raw.endAt === null ? null : raw.endAt === undefined ? current.endAt : number(raw.endAt, 0, 24 * 3600, current.endAt ?? 0),
    fadeMs: number(raw.fadeMs, 0, 10_000, current.fadeMs),
  }
}

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']!

/** QR modules as rows of 0 and 1; empty when the data does not fit a QR code. */
export function qrModules(data: string, level: QrLevel): string[] {
  try {
    const code = qrcode(0, level)
    code.addData(data, 'Byte')
    code.make()
    const count = code.getModuleCount()
    return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, col) => (code.isDark(row, col) ? '1' : '0')).join(''))
  } catch {
    return []
  }
}

/** Turns a page into what outputs draw. `src` gives a media item's URL, or null when it is missing. */
export function pageRender(page: Page, src: (mediaId: Id) => string | null): PageRender {
  const background: PageBackgroundRender =
    page.background.kind === 'image' || page.background.kind === 'video'
      ? (() => {
          const url = src(page.background.mediaId)
          return url ? { kind: page.background.kind, src: url, fit: page.background.fit, dim: page.background.dim } : { kind: 'none' as const }
        })()
      : page.background
  const elements = page.elements.flatMap((element): ElementRender[] => {
    if (element.isHidden) return []
    const { name: _name, isLocked: _locked, isHidden: _hidden, ...rest } = element
    if (rest.kind === 'qr') return [{ ...rest, modules: qrModules(rest.data, rest.level) }]
    if (rest.kind === 'image' || rest.kind === 'video') {
      const { mediaId, ...media } = rest
      const url = src(mediaId)
      return url ? [{ ...media, src: url }] : []
    }
    return [{ ...rest, css: 'style' in rest ? fontCss(rest.style.family) : null }]
  })
  return { background, elements }
}

export function overlayRender(overlay: Overlay, src: (mediaId: Id) => string | null): OverlayRender {
  const css = fontCss(overlay.family)
  return { ...overlay, css, src: overlay.kind === 'watermark' && overlay.mediaId ? src(overlay.mediaId) : null }
}

/** Every line of words on a page, for search, the stage screen and slide thumbnails. */
export function pageText(page: Page): string[] {
  return page.elements.flatMap((e) => (e.kind === 'text' || e.kind === 'ticker' ? e.text.split('\n').filter(Boolean) : []))
}

export const fontChoices = fontFamilies

const quiet: ElementAnimation = { effect: 'none', durationMs: 600, delayMs: 0 }

/** A new element of a kind with sensible defaults, centred on the page. */
export function newElement(kind: ElementKind, elementId: Id, mediaId: Id = 'missing'): PageElement {
  const base: ElementBase = { id: elementId, name: '', frame: { x: 0.2, y: 0.35, w: 0.6, h: 0.3 }, rotation: 0, opacity: 1, enter: quiet, isLocked: false, isHidden: false }
  switch (kind) {
    case 'text':
      return { ...base, kind, text: 'Double-click to write', style: defaultTextStyle }
    case 'clock':
      return { ...base, kind, frame: { x: 0.3, y: 0.4, w: 0.4, h: 0.2 }, mode: 'time', is24Hour: false, hasSeconds: false, target: '10:00', minutes: 5, prefix: '', endText: '', style: { ...defaultTextStyle, size: 0.12, weight: 700 } }
    case 'qr':
      return { ...base, kind, frame: { x: 0.39, y: 0.3, w: 0.225, h: 0.4 }, data: 'https://', level: 'M', foreground: '#000000', background: '#FFFFFF', quietZone: 2 }
    case 'shape':
      return { ...base, kind, frame: { x: 0.1, y: 0.7, w: 0.8, h: 0.2 }, shape: 'rectangle', fill: 'rgba(0, 0, 0, 0.5)', stroke: 'transparent', strokeWidth: 0, radius: 0.02 }
    case 'image':
      return { ...base, kind, mediaId, fit: 'cover', radius: 0 }
    case 'video':
      return { ...base, kind, mediaId, fit: 'cover', radius: 0, isMuted: true, isLooping: true }
    case 'ticker':
      return { ...base, kind, frame: { x: 0, y: 0.88, w: 1, h: 0.1 }, text: 'Welcome · Karibu', style: { ...defaultTextStyle, size: 0.05, backing: 'rgba(0, 0, 0, 0.6)', hasShadow: false }, speed: 8, direction: 'left', gap: 0.15 }
  }
}

export function newPage(pageId: Id, name: string): Page {
  return { id: pageId, name, background: { kind: 'gradient', from: '#22324A', to: '#0B1220', angle: 160 }, elements: [], notes: '', advanceAfter: null }
}

export function newOverlay(kind: OverlayKind, overlayId: Id): Overlay {
  return cleanOverlay({ id: overlayId, kind, name: overlayKinds.find((k) => k.key === kind)!.label, text: kind === 'ticker' ? 'Welcome to our service · Karibu' : '', title: 'Title', subtitle: '' })!
}
