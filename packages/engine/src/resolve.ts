import {
  classicTheme,
  layoutSlide,
  lookup,
  shortLabel,
  type BackgroundRender,
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
  const isBlank = profile.kind === 'audience' && state.isBlack
  const slide = shows('slide') && profile.kind === 'audience' && !isBlank ? findSlide(context.decks, slideRef) : null
  const lowerThird = shows('lowerThird') && !isBlank ? lookup(context.library.lowerThirds, state.live.lowerThird) ?? null : null

  return {
    aspect: 16 / 9,
    outputId: profile.id,
    transitionMs: profile.transitionMs,
    background: shows('background') && !isBlank ? backgroundFor(state, context, slideRef) : null,
    slide: slide && slideRef ? { ...layoutSlide(themeFor(context, slideRef), profile.id, slide, `${slideRef.itemId}#${slideRef.index}`), fill: null } : null,
    lowerThird: lowerThird ? { key: lowerThird.id, title: lowerThird.title, subtitle: lowerThird.subtitle } : null,
    stage: profile.kind === 'stage' ? stageRender(state, context.decks, slideRef) : null,
  }
}

/** An output the operator switched off: nothing on it, so the projector shows black and the stage screen goes dark. */
export function blankRender(profile: OutputProfile): Omit<RenderState, 'seq'> {
  return { aspect: 16 / 9, outputId: profile.id, transitionMs: profile.transitionMs, background: null, slide: null, lowerThird: null, stage: null }
}

function themeFor(context: ResolveContext, slideRef: SlideRef | null) {
  const themes = context.library.themes
  return lookup(themes, findDeck(context.decks, slideRef)?.themeId) ?? lookup(themes, classicTheme.id) ?? classicTheme
}

/**
 * Everything behind the words is drawn on the background layer, so it never fades with each slide and never covers them.
 * A background the operator picked for the item on screen wins, then the item's own, then its theme's fill, then the
 * operator's last pick. Clearing the background (F1) clears only the pick, so a light theme never ends up on black.
 */
export function backgroundFor(state: EngineState, context: ResolveContext, slideRef: SlideRef | null): BackgroundRender | null {
  const pick = lookup(context.library.backgrounds, state.live.background)?.render ?? null
  const deck = findDeck(context.decks, slideRef)
  if (pick && (!deck || state.backgroundPickedFor === deck.itemId)) return pick
  return lookup(context.library.backgrounds, deck?.backgroundId)?.render ?? (deck ? themeFor(context, slideRef).fill : null) ?? pick
}
