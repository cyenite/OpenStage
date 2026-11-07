import {
  classicTheme,
  layoutSlide,
  lookup,
  shortLabel,
  type BackgroundRender,
  type SlideRender,
  type StageRender,
  type StageSection,
  type Deck,
  type EngineState,
  type LayerKey,
  type Library,
  type RenderState,
  type SlideRef,
} from '@openstage/shared'
import { findDeck, findSlide } from './decks'

export const outputs = [
  { id: 'projector', name: 'Projector', kind: 'audience', layers: ['background', 'slide', 'lowerThird'], transitionMs: 300 },
  { id: 'stage', name: 'Stage', kind: 'stage', layers: ['slide'], transitionMs: 0 },
] as const satisfies readonly { id: string; name: string; kind: 'audience' | 'stage'; layers: readonly LayerKey[]; transitionMs: number }[]

export type OutputProfile = (typeof outputs)[number]
export type OutputId = OutputProfile['id']

/** The stage screen shows the live slide, what comes next, and the stage's own clock, countdown and message. */
function stageRender(state: EngineState, decks: Deck[], slideRef: SlideRef | null): StageRender {
  const deck = findDeck(decks, slideRef)
  const slide = findSlide(decks, slideRef)
  const next = findSlide(decks, state.preview)
  const sections: StageSection[] = []
  deck?.slides.forEach((s, index) => {
    const label = shortLabel(s.label)
    const isCurrent = index === slideRef?.index
    const last = sections.at(-1)
    const startsRun = index === 0 || deck.slides[index - 1]!.label !== s.label
    if (startsRun || !last) sections.push({ label, isCurrent })
    else if (isCurrent) last.isCurrent = true
  })
  const detail = slide && deck ? [deck.musicalKey && `Key ${deck.musicalKey}`, `slide ${slideRef!.index + 1} of ${deck.slides.length}`].filter(Boolean).join(' · ') : ''
  return {
    layout: state.stage.layout,
    title: slide && deck ? `${deck.title} · ${slide.label}` : deck?.title ?? '',
    notes: deck?.notes ?? '',
    detail,
    current: slide?.lines ?? [],
    next: next?.lines ?? [],
    nextLabel: next ? (findDeck(decks, state.preview)?.itemId === deck?.itemId ? next.label : `${findDeck(decks, state.preview)?.title} · ${next.label}`) : '',
    sections: deck && deck.slides.length > 1 ? sections : [],
    timer: state.stage.timer,
    message: state.stage.message,
  }
}

function withFill(slide: SlideRender, fill: BackgroundRender | undefined): SlideRender {
  return fill ? { ...slide, fill } : slide
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
  const themes = context.library.themes
  const slide = shows('slide') && profile.kind === 'audience' ? findSlide(context.decks, slideRef) : null
  const deck = findDeck(context.decks, slideRef)
  const theme = lookup(themes, deck?.themeId) ?? lookup(themes, classicTheme.id) ?? classicTheme
  const itemFill = lookup(context.library.backgrounds, deck?.backgroundId)?.render
  const background = shows('background') && state.live.background ? context.library.backgrounds[state.live.background]?.render ?? null : null
  const lowerThird = shows('lowerThird') && state.live.lowerThird ? context.library.lowerThirds[state.live.lowerThird] ?? null : null

  return {
    aspect: 16 / 9,
    outputId: profile.id,
    transitionMs: profile.transitionMs,
    background,
    slide: slide && slideRef ? withFill(layoutSlide(theme, profile.id, slide, `${slideRef.itemId}#${slideRef.index}`), itemFill) : null,
    lowerThird: lowerThird ? { key: lowerThird.id, title: lowerThird.title, subtitle: lowerThird.subtitle } : null,
    stage: profile.kind === 'stage' ? stageRender(state, context.decks, slideRef) : null,
  }
}
