import { describe, expect, it } from 'vitest'
import type { ClientMessage, EngineMessage, EngineState, RenderState } from '@openstage/shared'
import { Engine, type ClientPort } from './engine'
import { buildDecks } from './decks'
import { initialState, reduce } from './state'
import { starterLibrary } from './starter-library'
import { LibraryIndex } from './store/library-index'

const decks = buildDecks(starterLibrary.services.sunday!, starterLibrary)
const start = initialState(decks, 'night-blue', 'sunday')
const [song, scripture] = decks

function fakePort() {
  const sent: EngineMessage[] = []
  let deliver: (message: ClientMessage) => void = () => {}
  let close = () => {}
  const port: ClientPort = {
    send: (message) => sent.push(message),
    onMessage: (listener) => (deliver = listener),
    onClose: (listener) => (close = listener),
  }
  const renders = () => sent.filter((m) => m.type === 'render').map((m) => (m as { render: RenderState }).render)
  return { port, sent, renders, deliver: (m: ClientMessage) => deliver(m), close: () => close() }
}

describe('decks', () => {
  it('flattens a song arrangement into slides in order', () => {
    expect(song!.slides).toHaveLength(8)
    expect(song!.slides[0]!.lines[0]).toBe('Amazing grace, how sweet the sound')
    expect(song!.slides[7]!.kind).toBe('outro')
  })

  it('puts the second translation of a passage in the secondary box', () => {
    expect(scripture!.slides[0]!.lines[0]).toMatch(/^For God so loved/)
    expect(scripture!.slides[0]!.secondaryLines[0]).toMatch(/one and only Son/)
    expect(scripture!.slides[0]!.reference).toBe('John 3:16 KJV · WEB')
  })
})

describe('reduce', () => {
  it('takes preview live and queues the following slide', () => {
    const state = reduce(start, { type: 'live.take' }, decks)
    expect(state.live.slide).toEqual({ itemId: song!.itemId, index: 0 })
    expect(state.preview).toEqual({ itemId: song!.itemId, index: 1 })
  })

  it('moves into the next service item at the end of a deck', () => {
    const last = reduce(start, { type: 'preview.set', ref: { itemId: song!.itemId, index: 7 } }, decks)
    const state = reduce(last, { type: 'live.take' }, decks)
    expect(state.preview).toEqual({ itemId: scripture!.itemId, index: 0 })
    expect(state.selectedItemId).toBe(scripture!.itemId)
  })

  it('steps live back without crossing into the previous item', () => {
    let state = reduce(start, { type: 'live.take' }, decks)
    state = reduce(state, { type: 'live.previous' }, decks)
    expect(state.live.slide).toEqual({ itemId: song!.itemId, index: 0 })
  })

  it('ignores a preview ref that points nowhere', () => {
    expect(reduce(start, { type: 'preview.set', ref: { itemId: song!.itemId, index: 99 } }, decks)).toBe(start)
  })

  it('clears one layer and leaves the others', () => {
    let state = reduce(start, { type: 'live.take' }, decks)
    state = reduce(state, { type: 'lowerThird.set', lowerThirdId: 'pastor' }, decks)
    state = reduce(state, { type: 'layer.clear', layer: 'slide' }, decks)
    expect(state.live).toEqual({ slide: null, audio: null, background: 'night-blue', lowerThird: 'pastor' })
  })

  it('clears every layer at once', () => {
    let state = reduce(start, { type: 'audio.set', audioCueId: 'walk-in' }, decks)
    state = reduce(state, { type: 'layer.clearAll' }, decks)
    expect(Object.values(state.live).every((v) => v === null)).toBe(true)
  })
})

describe('Engine', () => {
  it('sends each output its own resolved frame', () => {
    const engine = new Engine({ library: starterLibrary })
    const projector = fakePort()
    const stage = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    engine.dispatch({ type: 'live.take' })

    const projectorFrame = projector.renders().at(-1)!
    const stageFrame = stage.renders().at(-1)!
    expect(projectorFrame.background).toEqual(starterLibrary.backgrounds.candle!.render)
    expect(projectorFrame.slide!.boxes.map((b) => b.role)).toEqual(['main'])
    expect(stageFrame.background).toBeNull()
    expect(stageFrame.slide!.boxes.map((b) => b.role)).toEqual(['label', 'main', 'next'])
    expect(stageFrame.slide!.boxes[2]!.lines[0]).toBe('I once was lost, but now am found')
  })

  it('only bumps seq for outputs whose frame changed', () => {
    const engine = new Engine({ library: starterLibrary })
    const stage = fakePort()
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    engine.dispatch({ type: 'background.set', backgroundId: 'night-blue' })
    expect(stage.renders().map((r) => r.seq)).toEqual([1])
  })

  it('accepts commands from operators only and tracks output acks', () => {
    const engine = new Engine({ library: starterLibrary })
    const operator = fakePort()
    const output = fakePort()
    engine.connect(operator.port, { role: 'operator' })
    engine.connect(output.port, { role: 'output', outputId: 'projector' })

    output.deliver({ type: 'command', command: { type: 'live.take' } })
    expect(engine.current.live.slide).toBeNull()

    operator.deliver({ type: 'command', command: { type: 'live.take' } })
    const seq = output.renders().at(-1)!.seq
    output.deliver({ type: 'ack', seq })
    const snapshot = operator.sent.filter((m) => m.type === 'snapshot').at(-1)!
    expect(snapshot.type === 'snapshot' && snapshot.snapshot.outputs[0]).toMatchObject({
      id: 'projector',
      sentSeq: seq,
      ackedSeq: seq,
      isConnected: true,
    })
  })

  it('reports an output as disconnected when its port closes', () => {
    const engine = new Engine({ library: starterLibrary })
    const output = fakePort()
    engine.connect(output.port, { role: 'output', outputId: 'stage' })
    output.close()
    expect(engine.snapshot().outputs[1]!.isConnected).toBe(false)
  })

  it('opens the first service by name and the first background by name', () => {
    const engine = new Engine({ library: starterLibrary })
    expect(engine.current.serviceId).toBe('sunday')
    expect(engine.current.live.background).toBe('candle')
  })

  it('reports each service item once as it goes live', () => {
    const live: string[] = []
    const engine = new Engine({ library: starterLibrary, onItemLive: (item) => live.push(item.id) })
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'live.next' })
    engine.dispatch({ type: 'item.select', itemId: 'item-it-is-well' })
    engine.dispatch({ type: 'live.take' })
    expect(live).toEqual(['item-amazing-grace', 'item-it-is-well'])
  })

  it('answers library searches from operators only', () => {
    const index = new LibraryIndex()
    index.rebuild(starterLibrary)
    const engine = new Engine({ library: starterLibrary, index })
    const operator = fakePort()
    const output = fakePort()
    engine.connect(operator.port, { role: 'operator' })
    engine.connect(output.port, { role: 'output', outputId: 'stage' })
    const query = { type: 'query', requestId: 7, query: { type: 'library.search', text: 'sea billows' } } as const
    output.deliver(query)
    operator.deliver(query)
    expect(output.sent.some((m) => m.type === 'result')).toBe(false)
    const result = operator.sent.find((m) => m.type === 'result')
    expect(result).toMatchObject({ requestId: 7, hits: [{ kind: 'songs', id: 'it-is-well' }] })
  })
})

describe('Engine song edits', () => {
  function editing() {
    const changes: string[] = []
    const states: EngineState[] = []
    const engine = new Engine({
      library: starterLibrary,
      onStateChange: (state) => states.push(state),
      onDocumentChange: (kind, document) => changes.push(`${kind}/${document.id}`),
    })
    const projector = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    return { engine, projector, changes, states }
  }

  it('updates the live output when the live slide is edited', () => {
    const { engine, projector, changes } = editing()
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setSlideLines', sectionId: 'v1', index: 0, lines: ['Edited line'] } })
    expect(projector.renders().at(-1)!.slide!.boxes[0]!.lines).toEqual(['Edited line'])
    expect(changes).toEqual(['songs/amazing-grace'])
    expect(starterLibrary.songs['amazing-grace']!.sections.v1!.slides[0]!.lines[0]).toBe('Amazing grace, how sweet the sound')
  })

  it('undoes and redoes edits in order and saves each step', () => {
    const { engine, changes } = editing()
    const ref = { kind: 'songs', id: 'it-is-well' } as const
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setTitle', title: 'It Is Well' } })
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setMeta', meta: { ccli: '12345' } } })
    engine.dispatch({ type: 'document.undo', ref })
    expect(engine.documents.songs['it-is-well']).toMatchObject({ title: 'It Is Well', meta: { authors: ['Horatio Spafford'] } })
    expect(engine.documents.songs['it-is-well']!.meta.ccli).toBeUndefined()
    engine.dispatch({ type: 'document.undo', ref })
    engine.dispatch({ type: 'document.undo', ref })
    expect(engine.documents.songs['it-is-well']!.title).toBe('It Is Well with My Soul')
    engine.dispatch({ type: 'document.redo', ref })
    expect(engine.documents.songs['it-is-well']!.title).toBe('It Is Well')
    expect(changes).toHaveLength(5)
  })

  it('ignores edits that change nothing or point nowhere', () => {
    const { engine, changes } = editing()
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setTitle', title: '  ' } })
    engine.dispatch({ type: 'song.edit', songId: 'missing', edit: { type: 'song.setTitle', title: 'X' } })
    engine.dispatch({ type: 'song.edit', songId: '__proto__', edit: { type: 'song.setTitle', title: 'X' } })
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setMeta', meta: { tempo: -4 } } })
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setSlideLines', sectionId: 'v1', index: 9, lines: ['x'] } })
    expect(changes).toEqual([])
  })
})
