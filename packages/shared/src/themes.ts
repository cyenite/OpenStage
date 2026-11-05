import type { DeckSlide, Id } from './library'
import type { BackgroundRender, FontSpec, Rect01, SlideRender, TextAlign, TextBoxRender } from './render'

/** Declaration order is the order the theme editor lists the boxes in. */
export const themeBoxRoles = [
  { key: 'main', label: 'Main lines' },
  { key: 'secondary', label: 'Second language' },
  { key: 'reference', label: 'Reference' },
] as const

export type ThemeBoxRole = (typeof themeBoxRoles)[number]['key']

/** Fonts bundled with the app, so outputs look the same offline. A family that is not listed is used as a CSS family name. */
export const fontFamilies = [
  { key: 'newsreader', label: 'Newsreader', css: "'Newsreader Variable', Newsreader, Georgia, serif" },
  { key: 'inter', label: 'Inter', css: "'Inter Variable', Inter, 'Segoe UI', system-ui, sans-serif" },
  { key: 'system-serif', label: 'System serif', css: "Georgia, 'Times New Roman', serif" },
  { key: 'system-sans', label: 'System sans', css: "system-ui, 'Segoe UI', sans-serif" },
] as const

export function fontCss(family: string): string {
  return fontFamilies.find((f) => f.key === family)?.css ?? family
}

export interface BoxStyle {
  font: FontSpec
  frame: Rect01
  align: TextAlign
  color: string
  hasShadow: boolean
  backing: string | null
}

export interface ThemeLook {
  fill: BackgroundRender | null
  boxes: Record<ThemeBoxRole, BoxStyle>
}

/** A change to part of a box: `font` and `frame` merge field by field. */
export type BoxPatch = Partial<Omit<BoxStyle, 'font' | 'frame'>> & { font?: Partial<FontSpec>; frame?: Partial<Rect01> }

export interface ThemeOverride {
  fill?: BackgroundRender | null
  boxes?: Partial<Record<ThemeBoxRole, BoxPatch>>
}

/**
 * How slides look. Songs and services point at a theme by id and never copy it, so editing a
 * theme changes every song that uses it. `overrides` adjusts the look for one output by id.
 */
export interface Theme extends ThemeLook {
  id: Id
  name: string
  overrides: Record<string, ThemeOverride>
}

export function lookFor(theme: Theme, outputId: string): ThemeLook {
  const override = Object.hasOwn(theme.overrides, outputId) ? theme.overrides[outputId] : undefined
  if (!override) return theme
  const boxes = Object.fromEntries(
    themeBoxRoles.map(({ key }) => {
      const base = theme.boxes[key]
      const patch = override.boxes?.[key] ?? {}
      return [key, { ...base, ...patch, font: { ...base.font, ...patch.font }, frame: { ...base.frame, ...patch.frame } }]
    }),
  ) as Record<ThemeBoxRole, BoxStyle>
  return { fill: override.fill === undefined ? theme.fill : override.fill, boxes }
}

/**
 * Lays one slide out in a theme. With no second language the main box grows over the space the
 * second-language box would have taken, so a theme designed for two languages still fills the screen with one.
 */
export function layoutSlide(theme: Theme, outputId: string, slide: DeckSlide, key: string): SlideRender {
  const { fill, boxes } = lookFor(theme, outputId)
  const hasSecondary = slide.secondaryLines.length > 0
  const mainFrame = hasSecondary ? boxes.main.frame : union(boxes.main.frame, boxes.secondary.frame)
  const rendered: TextBoxRender[] = [box('main', slide.lines, { ...boxes.main, frame: mainFrame })]
  if (hasSecondary) rendered.push(box('secondary', slide.secondaryLines, boxes.secondary))
  if (slide.reference) rendered.push(box('reference', [slide.reference], boxes.reference))
  return { key, fill, boxes: rendered }
}

function box(role: ThemeBoxRole, lines: string[], style: BoxStyle): TextBoxRender {
  const { font, frame, align, color, hasShadow, backing } = style
  return { role, lines, frame, align, color, hasShadow, backing, font: { ...font, family: fontCss(font.family) } }
}

function union(a: Rect01, b: Rect01): Rect01 {
  const round = (n: number) => Math.round(n * 1e6) / 1e6
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: round(Math.max(a.x + a.w, b.x + b.w) - x), h: round(Math.max(a.y + a.h, b.y + b.h) - y) }
}

function style(font: FontSpec, frame: Rect01, color: string, extra: Partial<BoxStyle> = {}): BoxStyle {
  return { font, frame, color, align: 'center', hasShadow: true, backing: null, ...extra }
}

const serif = (weight: number, size: number, italic = false): FontSpec => ({ family: 'newsreader', weight, size, italic })
const sans = (weight: number, size: number, italic = false): FontSpec => ({ family: 'inter', weight, size, italic })

const centered = {
  main: { x: 0.06, y: 0.1, w: 0.88, h: 0.4 },
  secondary: { x: 0.06, y: 0.52, w: 0.88, h: 0.3 },
  reference: { x: 0.06, y: 0.85, w: 0.88, h: 0.08 },
}

function centeredTheme(id: Id, name: string, fill: BackgroundRender | null, color: string, accent: string, muted: string, hasShadow = true): Theme {
  return {
    id,
    name,
    fill,
    overrides: {},
    boxes: {
      main: style(serif(600, 0.075), centered.main, color, { hasShadow }),
      secondary: style(serif(500, 0.06, true), centered.secondary, accent, { hasShadow }),
      reference: style(sans(500, 0.04), centered.reference, muted, { hasShadow }),
    },
  }
}

/** Over the background layer, as phase 0 looked. Used whenever a theme id points nowhere. */
export const classicTheme = centeredTheme('classic', 'Classic', null, '#FFFFFF', '#F7E3B5', '#D6D6DA')

/** The looks from the design canvas. Colours only; every text is the church's own. */
export const starterThemes: Theme[] = [
  classicTheme,
  centeredTheme('night-blue', 'Night blue', { kind: 'color', color: '#102033' }, '#FFFFFF', '#F7E3B5', '#D6D6DA'),
  centeredTheme('forest', 'Forest', { kind: 'color', color: '#0F1B14' }, '#FFFFFF', '#CFE8C9', '#BFCFC2'),
  centeredTheme('ember', 'Ember', { kind: 'color', color: '#2B1D12' }, '#F7E6C8', '#F2B544', '#D9C4A3'),
  centeredTheme('paper', 'Paper', { kind: 'color', color: '#F4EFE6' }, '#1A1A1A', '#7A4B12', '#5F5F66', false),
  {
    id: 'lower-third',
    name: 'Lower third',
    fill: null,
    overrides: {},
    boxes: {
      main: style(sans(600, 0.05), { x: 0.05, y: 0.72, w: 0.9, h: 0.12 }, '#FFFFFF', { backing: 'rgba(14, 14, 16, 0.78)', hasShadow: false }),
      secondary: style(sans(500, 0.036, true), { x: 0.05, y: 0.84, w: 0.9, h: 0.07 }, '#F7E3B5', { backing: 'rgba(14, 14, 16, 0.78)', hasShadow: false }),
      reference: style(sans(500, 0.028), { x: 0.05, y: 0.92, w: 0.9, h: 0.05 }, '#D6D6DA', { backing: 'rgba(14, 14, 16, 0.78)', hasShadow: false }),
    },
  },
]
