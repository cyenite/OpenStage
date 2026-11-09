import { initialStage, instantId, isInstantId, stageLayouts, type Command, type Deck, type EngineState, type Id, type Library, type LiveLayers, type SlideRef, type StageState, type Timing } from '@openstage/shared'
import { cleanInstant, pruneInstant } from './instant'

export const emptyLive: LiveLayers = { slide: null, audio: null, background: null, lowerThird: null }

export const noTiming: Timing = { itemId: null, itemStartedAt: null, serviceStartedAt: null }

export function initialState(decks: Deck[], defaultBackgroundId: Id | null, serviceId: Id | null): EngineState {
  const first = decks.find((d) => d.slides.length > 0)
  return {
    isBlack: false,
    outputsOff: [],
    backgroundPickedFor: null,
    instant: {},
    stage: initialStage,
    serviceId,
    timing: noTiming,
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
      return { ...state, preview: command.ref, selectedItemId: selectable(state, command.ref.itemId) }
    case 'instant.show': {
      const ref = { itemId: instantId(command.source), index: command.index }
      if (!isValid(decks, ref)) return state
      return command.isLive ? goLive(state, ref, decks) : { ...state, preview: ref }
    }
    case 'live.take':
      return state.preview ? goLive(state, state.preview, decks) : state
    case 'live.show':
      return isValid(decks, command.ref) ? goLive(state, command.ref, decks) : state
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
      return { ...state, isBlack: false, live: emptyLive }
    case 'background.set':
      return { ...state, isBlack: false, backgroundPickedFor: state.live.slide?.itemId ?? null, live: { ...state.live, background: command.backgroundId } }
    case 'lowerThird.set':
      return { ...state, isBlack: false, live: { ...state.live, lowerThird: command.lowerThirdId } }
    case 'screens.black':
      return { ...state, isBlack: command.isBlack === true }
    case 'output.power': {
      const others = state.outputsOff.filter((id) => id !== command.outputId)
      return { ...state, outputsOff: command.isOn === false ? [...others, String(command.outputId)] : others }
    }
    case 'audio.set':
      return { ...state, live: { ...state.live, audio: command.audioCueId } }
    default:
      return state
  }
}

/** Showing a slide lifts a black screen. A live background pick lasts only while its item is on screen. */
function goLive(state: EngineState, ref: SlideRef, decks: Deck[]): EngineState {
  const preview = step(decks, ref, 1) ?? ref
  const isSameItem = state.live.slide?.itemId === ref.itemId
  return {
    ...state,
    isBlack: false,
    backgroundPickedFor: isSameItem ? state.backgroundPickedFor : null,
    preview,
    selectedItemId: selectable(state, ref.itemId),
    live: { ...state.live, slide: ref },
  }
}

/** Library slides never become the selected service item, so adds still land after what the operator picked. */
const selectable = (state: EngineState, itemId: Id) => (isInstantId(itemId) ? state.selectedItemId : itemId)

/** Moves within a deck, and forward into the next non-empty deck at the end of one. */
function step(decks: Deck[], ref: SlideRef, delta: 1 | -1): SlideRef | null {
  const deckIndex = decks.findIndex((d) => d.itemId === ref.itemId)
  const deck = decks[deckIndex]
  if (!deck) return null
  const index = ref.index + delta
  if (index >= 0 && index < deck.slides.length) return { itemId: deck.itemId, index }
  // A library deck ends where it ends; the service never runs on into it, or out of it.
  if (delta < 0 || isInstantId(deck.itemId)) return null
  const following = decks.slice(deckIndex + 1).find((d) => d.slides.length > 0 && !isInstantId(d.itemId))
  return following ? { itemId: following.itemId, index: 0 } : null
}

/** Drops every reference that no longer points at real content, after a restore or a library edit. */
export function sanitize(raw: Partial<EngineState>, decks: Deck[], library: Library): EngineState {
  const live = { ...emptyLive, ...raw.live }
  const pick = (records: Record<Id, unknown>, id: Id | null) => (id && Object.hasOwn(records, id) ? id : null)
  const timing = { ...noTiming, ...raw.timing }
  const isTimed = decks.some((d) => d.itemId === timing.itemId) && typeof timing.itemStartedAt === 'number'
  const preview = isValid(decks, raw.preview ?? null) ? raw.preview! : null
  const slide = isValid(decks, live.slide) ? live.slide : null
  const outputsOff = Array.isArray(raw.outputsOff) ? raw.outputsOff.filter((id): id is string => typeof id === 'string') : []
  return pruneInstant({
    isBlack: raw.isBlack === true,
    outputsOff,
    backgroundPickedFor: typeof raw.backgroundPickedFor === 'string' && raw.backgroundPickedFor === slide?.itemId ? raw.backgroundPickedFor : null,
    instant: cleanInstant(raw.instant),
    stage: sanitizeStage(raw.stage),
    serviceId: pick(library.services, raw.serviceId ?? null),
    timing: isTimed ? timing : { ...noTiming, serviceStartedAt: typeof timing.serviceStartedAt === 'number' ? timing.serviceStartedAt : null },
    preview,
    selectedItemId: decks.some((d) => d.itemId === raw.selectedItemId && !isInstantId(d.itemId)) ? raw.selectedItemId! : null,
    live: {
      slide,
      audio: pick(library.audioCues, live.audio),
      background: pick(library.backgrounds, live.background),
      lowerThird: pick(library.lowerThirds, live.lowerThird),
    },
  })
}

function sanitizeStage(raw: Partial<StageState> | undefined): StageState {
  const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  const timer = raw?.timer
  const isTimer = !!timer && typeof timer.label === 'string' && isNumber(timer.durationMs) && isNumber(timer.remainingMs) && (timer.endsAt === null || isNumber(timer.endsAt))
  const message = raw?.message
  const isMessage = !!message && typeof message.text === 'string' && isNumber(message.sentAt)
  return {
    layout: stageLayouts.some((l) => l.key === raw?.layout) ? raw!.layout! : initialStage.layout,
    timer: isTimer ? timer : initialStage.timer,
    message: isMessage ? message : null,
  }
}

export function isValid(decks: Deck[], ref: SlideRef | null): ref is SlideRef {
  if (!ref) return false
  const deck = decks.find((d) => d.itemId === ref.itemId)
  return !!deck && Number.isInteger(ref.index) && ref.index >= 0 && ref.index < deck.slides.length
}
