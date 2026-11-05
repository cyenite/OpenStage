import type {
  Deck,
  DeckSlide,
  EngineState,
  FontSpec,
  LayerKey,
  Library,
  RenderState,
  SlideRef,
  SlideRender,
  TextBoxRender,
} from '@openstage/shared'
import { findSlide } from './decks'

export const outputs = [
  { id: 'projector', name: 'Projector', layers: ['background', 'slide', 'lowerThird'], transitionMs: 300 },
  { id: 'stage', name: 'Stage', layers: ['slide'], transitionMs: 0 },
] as const satisfies readonly { id: string; name: string; layers: readonly LayerKey[]; transitionMs: number }[]

export type OutputProfile = (typeof outputs)[number]
export type OutputId = OutputProfile['id']

const sans = 'Inter, "Segoe UI", system-ui, sans-serif'
const serif = 'Newsreader, Georgia, "Times New Roman", serif'

type SlideLayout = (slide: DeckSlide, next: DeckSlide | null, key: string) => SlideRender

const slideLayouts: Record<OutputId, SlideLayout> = {
  projector: (slide, _next, key) => {
    const hasSecondary = slide.secondaryLines.length > 0
    const boxes: TextBoxRender[] = [
      box('main', slide.lines, { x: 0.06, y: 0.1, w: 0.88, h: hasSecondary ? 0.4 : 0.72 }, font(serif, 600, 0.075)),
    ]
    if (hasSecondary) {
      boxes.push(box('secondary', slide.secondaryLines, { x: 0.06, y: 0.52, w: 0.88, h: 0.3 }, font(serif, 500, 0.06, true), '#F7E3B5'))
    }
    if (slide.reference) {
      boxes.push(box('reference', [slide.reference], { x: 0.06, y: 0.85, w: 0.88, h: 0.08 }, font(sans, 500, 0.04), '#D6D6DA'))
    }
    return { key, boxes }
  },
  stage: (slide, next, key) => {
    const boxes: TextBoxRender[] = [
      box('label', [slide.label], { x: 0.04, y: 0.04, w: 0.92, h: 0.08 }, font(sans, 700, 0.05), '#F2A93B', 'left'),
      box('main', slide.lines, { x: 0.04, y: 0.14, w: 0.92, h: 0.5 }, font(sans, 600, 0.085), '#FFFFFF', 'left'),
    ]
    if (next) {
      boxes.push(box('next', next.lines, { x: 0.04, y: 0.7, w: 0.92, h: 0.26 }, font(sans, 500, 0.055), '#8A8A92', 'left'))
    }
    return { key, boxes }
  },
}

export interface ResolveContext {
  decks: Deck[]
  library: Library
}

export function resolveRender(
  state: EngineState,
  context: ResolveContext,
  profile: OutputProfile,
  slideRef: SlideRef | null = state.live.slide,
): Omit<RenderState, 'seq'> {
  const shows = (layer: LayerKey) => (profile.layers as readonly LayerKey[]).includes(layer)
  const slide = shows('slide') ? findSlide(context.decks, slideRef) : null
  const next = slideRef === state.live.slide ? findSlide(context.decks, state.preview) : null
  const background = shows('background') && state.live.background ? context.library.backgrounds[state.live.background]?.render ?? null : null
  const lowerThird = shows('lowerThird') && state.live.lowerThird ? context.library.lowerThirds[state.live.lowerThird] ?? null : null

  return {
    aspect: 16 / 9,
    outputId: profile.id,
    transitionMs: profile.transitionMs,
    background,
    slide: slide && slideRef ? slideLayouts[profile.id](slide, next, `${slideRef.itemId}#${slideRef.index}`) : null,
    lowerThird: lowerThird ? { key: lowerThird.id, title: lowerThird.title, subtitle: lowerThird.subtitle } : null,
  }
}

function font(family: string, weight: number, size: number, italic = false): FontSpec {
  return { family, weight, size, italic }
}

function box(
  role: TextBoxRender['role'],
  lines: string[],
  frame: TextBoxRender['frame'],
  font: FontSpec,
  color = '#FFFFFF',
  align: TextBoxRender['align'] = 'center',
): TextBoxRender {
  return { role, lines, frame, font, align, color, hasShadow: true }
}
