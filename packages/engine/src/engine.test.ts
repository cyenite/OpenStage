import { describe, expect, it } from 'vitest'
import type { ClientMessage, EngineMessage, RenderState } from '@openstage/shared'
import { demoLibrary, demoService } from './demo-library'
import { Engine, type ClientPort } from './engine'
import { buildDecks } from './decks'
import { initialState, reduce } from './state'

const decks = buildDecks(demoService, demoLibrary)
const start = initialState(decks, 'night-blue')
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
    const engine = new Engine({ library: demoLibrary, service: demoService })
    const projector = fakePort()
    const stage = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    engine.dispatch({ type: 'live.take' })

    const projectorFrame = projector.renders().at(-1)!
    const stageFrame = stage.renders().at(-1)!
    expect(projectorFrame.background).toEqual({ kind: 'color', color: '#102033' })
    expect(projectorFrame.slide!.boxes.map((b) => b.role)).toEqual(['main'])
    expect(stageFrame.background).toBeNull()
    expect(stageFrame.slide!.boxes.map((b) => b.role)).toEqual(['label', 'main', 'next'])
    expect(stageFrame.slide!.boxes[2]!.lines[0]).toBe('I once was lost, but now am found')
  })

  it('only bumps seq for outputs whose frame changed', () => {
    const engine = new Engine({ library: demoLibrary, service: demoService })
    const stage = fakePort()
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    engine.dispatch({ type: 'background.set', backgroundId: 'candle' })
    expect(stage.renders().map((r) => r.seq)).toEqual([1])
  })

  it('accepts commands from operators only and tracks output acks', () => {
    const engine = new Engine({ library: demoLibrary, service: demoService })
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
    const engine = new Engine({ library: demoLibrary, service: demoService })
    const output = fakePort()
    engine.connect(output.port, { role: 'output', outputId: 'stage' })
    output.close()
    expect(engine.snapshot().outputs[1]!.isConnected).toBe(false)
  })
})
