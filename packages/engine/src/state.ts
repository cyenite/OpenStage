import type { Command, Deck, EngineState, LiveLayers, SlideRef } from '@openstage/shared'

export const emptyLive: LiveLayers = { slide: null, audio: null, background: null, lowerThird: null }

export function initialState(decks: Deck[], defaultBackgroundId: string | null): EngineState {
  const first = decks.find((d) => d.slides.length > 0)
  return {
    preview: first ? { itemId: first.itemId, index: 0 } : null,
    selectedItemId: first?.itemId ?? null,
    live: { ...emptyLive, background: defaultBackgroundId },
  }
}

export function reduce(state: EngineState, command: Command, decks: Deck[]): EngineState {
  switch (command.type) {
    case 'item.select': {
      const deck = decks.find((d) => d.itemId === command.itemId)
      if (!deck) return state
      const preview = deck.slides.length > 0 ? { itemId: deck.itemId, index: 0 } : state.preview
      return { ...state, selectedItemId: deck.itemId, preview }
    }
    case 'preview.set':
      if (!isValid(decks, command.ref)) return state
      return { ...state, preview: command.ref, selectedItemId: command.ref.itemId }
    case 'live.take':
      return state.preview ? goLive(state, state.preview, decks) : state
    case 'live.next': {
      if (!state.live.slide) return state.preview ? goLive(state, state.preview, decks) : state
      const next = step(decks, state.live.slide, 1)
      return next ? goLive(state, next, decks) : state
    }
    case 'live.previous': {
      if (!state.live.slide) return state
      const previous = step(decks, state.live.slide, -1)
      return previous ? goLive(state, previous, decks) : state
    }
    case 'layer.clear':
      return { ...state, live: { ...state.live, [command.layer]: null } }
    case 'layer.clearAll':
      return { ...state, live: emptyLive }
    case 'background.set':
      return { ...state, live: { ...state.live, background: command.backgroundId } }
    case 'lowerThird.set':
      return { ...state, live: { ...state.live, lowerThird: command.lowerThirdId } }
    case 'audio.set':
      return { ...state, live: { ...state.live, audio: command.audioCueId } }
    default:
      return state
  }
}

function goLive(state: EngineState, ref: SlideRef, decks: Deck[]): EngineState {
  const preview = step(decks, ref, 1) ?? ref
  return { ...state, preview, selectedItemId: preview.itemId, live: { ...state.live, slide: ref } }
}

/** Moves within a deck, and forward into the next non-empty deck at the end of one. */
function step(decks: Deck[], ref: SlideRef, delta: 1 | -1): SlideRef | null {
  const deckIndex = decks.findIndex((d) => d.itemId === ref.itemId)
  const deck = decks[deckIndex]
  if (!deck) return null
  const index = ref.index + delta
  if (index >= 0 && index < deck.slides.length) return { itemId: deck.itemId, index }
  if (delta < 0) return null
  const following = decks.slice(deckIndex + 1).find((d) => d.slides.length > 0)
  return following ? { itemId: following.itemId, index: 0 } : null
}

export function isValid(decks: Deck[], ref: SlideRef | null): ref is SlideRef {
  if (!ref) return false
  const deck = decks.find((d) => d.itemId === ref.itemId)
  return !!deck && Number.isInteger(ref.index) && ref.index >= 0 && ref.index < deck.slides.length
}
