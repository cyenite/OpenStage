import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ClientMessage, EngineMessage, EngineState, RenderState } from '@openstage/shared'
import { Engine, type ClientPort } from './engine'
import { buildDecks } from './decks'
import { initialState, reduce } from './state'
import { BibleComClient } from './bibles/biblecom'
import { testBibles } from './bibles/fixture'
import { starterLibrary } from './starter-library'
import { LibraryIndex } from './store/library-index'

const decks = buildDecks(starterLibrary.services.sunday!, starterLibrary, testBibles)
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

  it('moves into the next service item at the end of a deck, keeping the item on screen selected', () => {
    const last = reduce(start, { type: 'preview.set', ref: { itemId: song!.itemId, index: 7 } }, decks)
    const state = reduce(last, { type: 'live.take' }, decks)
    expect(state.preview).toEqual({ itemId: scripture!.itemId, index: 0 })
    expect(state.selectedItemId).toBe(song!.itemId)
  })

  it('shows a slide straight away and lifts a black screen', () => {
    const black = reduce(start, { type: 'screens.black', isBlack: true }, decks)
    const state = reduce(black, { type: 'live.show', ref: { itemId: scripture!.itemId, index: 1 } }, decks)
    expect(state.live.slide).toEqual({ itemId: scripture!.itemId, index: 1 })
    expect(state.isBlack).toBe(false)
    expect(reduce(start, { type: 'live.show', ref: { itemId: 'gone', index: 0 } }, decks)).toBe(start)
  })

  it('keeps the layers under a black screen', () => {
    const live = reduce(start, { type: 'live.take' }, decks)
    const black = reduce(live, { type: 'screens.black', isBlack: true }, decks)
    expect(black.live).toEqual(live.live)
    expect(reduce(black, { type: 'screens.black', isBlack: false }, decks)).toEqual(live)
  })

  it('switches outputs off and on', () => {
    const off = reduce(start, { type: 'output.power', outputId: 'stage', isOn: false }, decks)
    expect(off.outputsOff).toEqual(['stage'])
    expect(reduce(off, { type: 'output.power', outputId: 'stage', isOn: true }, decks).outputsOff).toEqual([])
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
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
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
    expect(stageFrame.slide).toBeNull()
    expect(stageFrame.stage).toMatchObject({
      layout: 'lyrics',
      title: 'Amazing Grace · Verse 1',
      current: ['Amazing grace, how sweet the sound', 'That saved a wretch like me'],
      next: ['I once was lost, but now am found', 'Was blind, but now I see'],
      nextLabel: 'Verse 1',
      sections: [
        { label: 'V1', isCurrent: true },
        { label: 'V2', isCurrent: false },
        { label: 'V3', isCurrent: false },
        { label: 'V4', isCurrent: false },
      ],
      detail: 'slide 1 of 8',
    })
    expect(projectorFrame.stage).toBeNull()
  })

  it('only bumps seq for outputs whose frame changed', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    const stage = fakePort()
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    engine.dispatch({ type: 'background.set', backgroundId: 'night-blue' })
    expect(stage.renders().map((r) => r.seq)).toEqual([1])
  })

  it('accepts commands from operators only and tracks output acks', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
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
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    const output = fakePort()
    engine.connect(output.port, { role: 'output', outputId: 'stage' })
    output.close()
    expect(engine.snapshot().outputs[1]!.isConnected).toBe(false)
  })

  it('opens the first service by name and the first background by name', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    expect(engine.current.serviceId).toBe('sunday')
    expect(engine.current.live.background).toBe('candle')
  })

  it('reports each service item once as it goes live', () => {
    const live: string[] = []
    const engine = new Engine({ bibles: testBibles, library: starterLibrary, onItemLive: (item) => live.push(item.id) })
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'live.next' })
    engine.dispatch({ type: 'item.select', itemId: 'item-it-is-well' })
    engine.dispatch({ type: 'live.take' })
    expect(live).toEqual(['item-amazing-grace', 'item-it-is-well'])
  })

  it('answers library searches from operators only', () => {
    const index = new LibraryIndex()
    index.rebuild(starterLibrary)
    const engine = new Engine({ bibles: testBibles, library: starterLibrary, index })
    const operator = fakePort()
    const output = fakePort()
    engine.connect(operator.port, { role: 'operator' })
    engine.connect(output.port, { role: 'output', outputId: 'stage' })
    const query = { type: 'query', requestId: 7, query: { type: 'library.search', text: 'sea billows' } } as const
    output.deliver(query)
    operator.deliver(query)
    expect(output.sent.some((m) => m.type === 'result')).toBe(false)
    const result = operator.sent.find((m) => m.type === 'result')
    expect(result).toMatchObject({ requestId: 7, result: { type: 'hits', hits: [{ kind: 'songs', id: 'it-is-well' }] } })
  })
})

describe('Engine song edits', () => {
  function editing() {
    const changes: string[] = []
    const states: EngineState[] = []
    const engine = new Engine({
      bibles: testBibles,
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
    const text = 'Edited [G]line\n\nI once was lost, but now am found\nWas blind, but now I see'
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setSectionText', sectionId: 'v1', language: null, text } })
    expect(projector.renders().at(-1)!.slide!.boxes[0]!.lines).toEqual(['Edited line'])
    expect(changes).toEqual(['songs/amazing-grace'])
    expect(starterLibrary.songs['amazing-grace']!.sections.v1!.slides[0]!.lines[0]!.text).toBe('Amazing grace, how sweet the sound')
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
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setSectionText', sectionId: 'nope', language: null, text: 'x' } })
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setSectionText', sectionId: 'v1', language: 'sw', text: 'x' } })
    expect(changes).toEqual([])
  })
})

describe('Engine library', () => {
  function connected() {
    const removed: string[] = []
    const changed: string[] = []
    const index = new LibraryIndex()
    index.rebuild(starterLibrary)
    const engine = new Engine({
      bibles: testBibles,
      index,
      library: starterLibrary,
      onDocumentRemove: (kind, id) => removed.push(`${kind}/${id}`),
      onDocumentChange: (kind, document) => {
        changed.push(`${kind}/${document.id}`)
        index.upsert(kind, document)
      },
    })
    const operator = fakePort()
    engine.connect(operator.port, { role: 'operator' })
    const documents = () => operator.sent.filter((m) => m.type === 'document')
    return { engine, operator, removed, changed, documents }
  }

  it('creates a song from pasted lyrics and lists it', () => {
    const { engine, operator, changed } = connected()
    engine.dispatch({ type: 'song.create', songId: 'karibu-1a2b', title: 'Karibu', lyrics: '[Kiitikio]\nKaribu Yesu\n\nKaribu sana', language: 'sw' })
    expect(changed).toEqual(['songs/karibu-1a2b'])
    const song = engine.documents.songs['karibu-1a2b']!
    expect(song).toMatchObject({ title: 'Karibu', languages: ['sw'], arrangements: [{ id: 'default', sectionIds: ['s1'] }] })
    expect(song.sections.s1).toMatchObject({ kind: 'chorus', label: 'Kiitikio' })
    expect(song.sections.s1!.slides).toHaveLength(2)
    operator.deliver({ type: 'query', requestId: 3, query: { type: 'library.list', kind: 'songs' } })
    const result = operator.sent.findLast((m) => m.type === 'result')
    expect(result?.type === 'result' && result.result.type === 'hits' && result.result.hits.map((h) => h.title)).toEqual(['Amazing Grace', 'It Is Well with My Soul', 'Karibu'])
    expect(engine.snapshot().libraryRevision).toBe(1)
  })

  it('refuses a duplicate or unsafe id on create', () => {
    const { engine, changed } = connected()
    engine.dispatch({ type: 'song.create', songId: 'amazing-grace', title: 'X', lyrics: 'x', language: 'en' })
    engine.dispatch({ type: 'song.create', songId: '../x', title: 'X', lyrics: 'x', language: 'en' })
    expect(changed).toEqual([])
  })

  it('adds a song to the service with its first arrangement, and removes it again', () => {
    const { engine } = connected()
    engine.dispatch({ type: 'song.create', songId: 'new-song', title: 'New', lyrics: 'One\n\nTwo', language: 'en' })
    engine.dispatch({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.addSong', itemId: 'item-new', songId: 'new-song' } })
    expect(engine.service.items.at(-1)).toEqual({ id: 'item-new', type: 'song', songId: 'new-song', arrangementId: 'default' })
    expect(engine.snapshot().decks.at(-1)!.slides.map((s) => s.lines[0])).toEqual(['One', 'Two'])
    engine.dispatch({ type: 'document.undo', ref: { kind: 'services', id: 'sunday' } })
    expect(engine.service.items).toHaveLength(3)
  })

  it('deletes a song only when no service uses it', () => {
    const { engine, removed } = connected()
    engine.dispatch({ type: 'song.delete', songId: 'amazing-grace' })
    expect(removed).toEqual([])
    engine.dispatch({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.removeItem', itemId: 'item-amazing-grace' } })
    engine.dispatch({ type: 'song.delete', songId: 'amazing-grace' })
    expect(removed).toEqual(['songs/amazing-grace'])
    expect(engine.documents.songs['amazing-grace']).toBeUndefined()
  })

  it('pushes a watched document now and after each change, with undo state', () => {
    const { engine, operator, documents } = connected()
    operator.deliver({ type: 'watch', ref: { kind: 'songs', id: 'it-is-well' } })
    expect(documents().at(-1)).toMatchObject({ document: { title: 'It Is Well with My Soul' }, canUndo: false })
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setTitle', title: 'Well' } })
    expect(documents().at(-1)).toMatchObject({ document: { title: 'Well' }, canUndo: true, canRedo: false })
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setTitle', title: 'Grace' } })
    expect(documents()).toHaveLength(2)
    operator.deliver({ type: 'watch', ref: null })
    engine.dispatch({ type: 'song.edit', songId: 'it-is-well', edit: { type: 'song.setTitle', title: 'Again' } })
    expect(documents()).toHaveLength(2)
  })
})

describe('Engine themes', () => {
  it('draws the song theme over the service theme, and falls back to classic', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    const projector = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    engine.dispatch({ type: 'live.take' })
    expect(projector.renders().at(-1)!.background).toEqual(starterLibrary.backgrounds.candle!.render)
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setTheme', themeId: 'paper' } })
    expect(projector.renders().at(-1)).toMatchObject({ background: { kind: 'color', color: '#F4EFE6' }, slide: { fill: null, boxes: [{ color: '#1A1A1A' }] } })
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setTheme', themeId: 'gone' } })
    expect(projector.renders().at(-1)!.background).toEqual(starterLibrary.backgrounds.candle!.render)
  })

  it('draws an item background in place of the theme fill, in preview and live', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    const projector = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setTheme', themeId: 'paper' } })
    const set = (backgroundId: string | null) =>
      engine.dispatch({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.updateItem', itemId: 'item-amazing-grace', changes: { backgroundId } } })
    set('night-blue')
    expect(engine.snapshot().previewRender.background).toEqual({ kind: 'color', color: '#102033' })
    engine.dispatch({ type: 'live.take' })
    expect(projector.renders().at(-1)!.background).toEqual({ kind: 'color', color: '#102033' })
    set('gone')
    expect(projector.renders().at(-1)!.background).toEqual({ kind: 'color', color: '#F4EFE6' })
    set(null)
    expect(projector.renders().at(-1)!.background).toEqual({ kind: 'color', color: '#F4EFE6' })
  })

  it('keeps the words on screen when the background changes, and a live pick lasts only for its item', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    const projector = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setTheme', themeId: 'paper' } })
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'background.set', backgroundId: 'forest-light' })
    expect(projector.renders().at(-1)).toMatchObject({ background: starterLibrary.backgrounds['forest-light']!.render, slide: { key: 'item-amazing-grace#0' } })
    engine.dispatch({ type: 'live.next' })
    expect(projector.renders().at(-1)!.background).toEqual(starterLibrary.backgrounds['forest-light']!.render)
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setTheme', themeId: null } })
    engine.dispatch({ type: 'live.show', ref: { itemId: 'item-john-3', index: 0 } })
    expect(projector.renders().at(-1)!.background).toEqual(starterLibrary.backgrounds['forest-light']!.render)
    engine.dispatch({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.updateItem', itemId: 'item-it-is-well', changes: { backgroundId: 'plum-still' } } })
    engine.dispatch({ type: 'live.show', ref: { itemId: 'item-it-is-well', index: 0 } })
    expect(projector.renders().at(-1)!.background).toEqual(starterLibrary.backgrounds['plum-still']!.render)
  })

  it('blanks the audience screens on black and leaves the stage screen alone', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    const projector = fakePort()
    const stage = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    engine.dispatch({ type: 'lowerThird.set', lowerThirdId: 'pastor' })
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'screens.black', isBlack: true })
    expect(projector.renders().at(-1)).toMatchObject({ background: null, slide: null, lowerThird: null })
    expect(stage.renders().at(-1)!.stage!.current.length).toBeGreaterThan(0)
    engine.dispatch({ type: 'screens.black', isBlack: false })
    expect(projector.renders().at(-1)).toMatchObject({ slide: { key: 'item-amazing-grace#0' }, lowerThird: { key: 'pastor' } })
  })

  it('sends nothing to a switched-off output while the operator still sees what it would show', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    const stage = fakePort()
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'output.power', outputId: 'stage', isOn: false })
    expect(stage.renders().at(-1)!.stage).toBeNull()
    const snapshot = engine.snapshot()
    expect(snapshot.outputs.find((o) => o.id === 'stage')!.isOn).toBe(false)
    expect(snapshot.stageRender.stage!.current.length).toBeGreaterThan(0)
    engine.dispatch({ type: 'rehearsal.start' })
    engine.dispatch({ type: 'rehearsal.stop' })
    expect(engine.current.outputsOff).toEqual(['stage'])
  })

  it('saves, edits and deletes lower thirds, taking a deleted one off the screen', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    engine.dispatch({ type: 'lowerThird.save', lowerThird: { id: 'guest', title: '  Rev. Achieng  ', subtitle: 'Guest speaker' } })
    expect(engine.documents.lowerThirds.guest).toEqual({ id: 'guest', title: 'Rev. Achieng', subtitle: 'Guest speaker' })
    engine.dispatch({ type: 'lowerThird.save', lowerThird: { id: 'guest', title: '', subtitle: 'x' } })
    expect(engine.documents.lowerThirds.guest!.title).toBe('Rev. Achieng')
    engine.dispatch({ type: 'lowerThird.set', lowerThirdId: 'guest' })
    engine.dispatch({ type: 'lowerThird.delete', lowerThirdId: 'guest' })
    expect(engine.documents.lowerThirds.guest).toBeUndefined()
    expect(engine.current.live.lowerThird).toBeNull()
  })

  it('updates the live slide when its theme is edited, and only deletes unused themes', () => {
    const removed: string[] = []
    const engine = new Engine({ bibles: testBibles, library: starterLibrary, onDocumentRemove: (kind, id) => removed.push(`${kind}/${id}`) })
    const projector = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    engine.dispatch({ type: 'theme.create', themeId: 'mine', name: 'Mine', fromThemeId: 'ember' })
    engine.dispatch({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.setTheme', themeId: 'mine' } })
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'theme.edit', themeId: 'mine', edit: { type: 'theme.setBox', role: 'main', style: { color: '#00FF00' } } })
    expect(projector.renders().at(-1)!.slide!.boxes[0]!.color).toBe('#00FF00')
    expect(engine.snapshot().themeUses).toEqual({ mine: 1 })
    engine.dispatch({ type: 'theme.delete', themeId: 'mine' })
    engine.dispatch({ type: 'theme.delete', themeId: 'classic' })
    engine.dispatch({ type: 'theme.delete', themeId: 'forest' })
    expect(removed).toEqual(['themes/forest'])
    expect(engine.snapshot().library.themes.map((t) => t.name)).toContain('Mine')
  })
})

describe('Engine scripture', () => {
  it('turns a quick verse into a passage after the selected item, in the service translations, and previews it', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    engine.dispatch({ type: 'scripture.quick', text: 'jn 3 16', itemId: 'item-q', passageId: 'q' })
    expect(engine.service.items.map((i) => i.id)).toEqual(['item-amazing-grace', 'item-q', 'item-john-3', 'item-it-is-well'])
    expect(engine.documents.passages.q).toMatchObject({ translations: ['KJV'], ref: { book: 'JHN', startVerse: 16 } })
    expect(engine.current.preview).toEqual({ itemId: 'item-q', index: 0 })
    engine.dispatch({ type: 'scripture.quick', text: 'not a verse', itemId: 'item-r', passageId: 'r' })
    expect(engine.documents.passages.r).toBeUndefined()
  })

  it('edits a passage and rebuilds its slides, keeping only installed Bibles', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    const deck = () => engine.snapshot().decks.find((d) => d.itemId === 'item-john-3')!
    expect(deck().slides.map((s) => s.label)).toEqual(['Verse 16', 'Verse 17'])
    engine.dispatch({ type: 'passage.edit', passageId: 'john-3-16', edit: { type: 'passage.setVersesPerSlide', versesPerSlide: 2 } })
    expect(deck().slides.map((s) => s.label)).toEqual(['Verses 16-17'])
    engine.dispatch({ type: 'passage.edit', passageId: 'john-3-16', edit: { type: 'passage.setTranslations', translations: ['WEB'] } })
    expect(deck().slides[0]!.secondaryLines).toEqual([])
    engine.dispatch({ type: 'passage.create', passageId: 'p', ref: { book: 'JHN', startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }, translations: ['NIV', 'WEB'] })
    expect(engine.documents.passages.p!.translations).toEqual(['WEB'])
    engine.dispatch({ type: 'passage.delete', passageId: 'john-3-16' })
    expect(engine.documents.passages['john-3-16']).toBeDefined()
  })
})

describe('Engine services and templates', () => {
  const clock = { now: new Date(2026, 10, 6, 12, 0).getTime() }
  const make = () => new Engine({ bibles: testBibles, library: starterLibrary, now: () => clock.now })

  it('creates a service from a template, fills a placeholder and opens it', () => {
    const engine = make()
    engine.dispatch({ type: 'service.create', serviceId: 'next', name: 'Next Sunday', date: '2026-11-15', time: '09:00', templateId: 'sunday' })
    const next = engine.documents.services.next!
    expect(next).toMatchObject({ templateId: 'sunday', date: '2026-11-15' })
    expect(next.items.filter((i) => i.type === 'slot')).toHaveLength(4)
    const summary = engine.snapshot().services.find((s) => s.id === 'next')!
    expect(summary).toMatchObject({ items: 8, minutes: 69, readiness: { state: 'staff', open: 4 } })

    engine.dispatch({ type: 'service.edit', serviceId: 'next', edit: { type: 'service.fillSlot', itemId: 'next-opening', songId: 'it-is-well' } })
    expect(engine.documents.services.next!.items[1]).toMatchObject({ type: 'song', songId: 'it-is-well', arrangementId: 'sunday', minutes: 6, isLinked: false })

    engine.dispatch({ type: 'service.open', serviceId: 'next' })
    expect(engine.current.serviceId).toBe('next')
    expect(engine.current.preview).toEqual({ itemId: 'next-opening', index: 0 })
    const welcome = engine.snapshot().decks[0]!
    expect(welcome).toMatchObject({ kind: 'welcome', isPlaceholder: true, minutes: 5, slides: [] })
    engine.dispatch({ type: 'service.delete', serviceId: 'next' })
    expect(engine.documents.services.next).toBeDefined()
    engine.dispatch({ type: 'service.delete', serviceId: 'sunday' })
    expect(engine.documents.services.sunday).toBeUndefined()
  })

  it('carries template edits to services from today on, not to past ones', () => {
    const engine = make()
    engine.dispatch({ type: 'service.create', serviceId: 'past', name: 'Past', date: '2026-11-01', time: '09:00', templateId: 'youth' })
    engine.dispatch({ type: 'service.create', serviceId: 'future', name: 'Future', date: '2026-11-13', time: '19:00', templateId: 'youth' })
    engine.dispatch({ type: 'template.edit', templateId: 'youth', edit: { type: 'template.updateSlot', slotId: 'talk', changes: { title: 'Message', minutes: 25 } } })
    expect(engine.documents.services.future!.items[2]).toMatchObject({ title: 'Message', minutes: 25 })
    expect(engine.documents.services.past!.items[2]).toMatchObject({ title: 'Talk', minutes: 20 })
    engine.dispatch({ type: 'template.delete', templateId: 'youth' })
    expect(engine.documents.services.future!.templateId).toBeUndefined()
    expect(engine.documents.services.future!.items).toHaveLength(4)
  })

  it('edits items: headings, order, notes, minutes, theme and language order', () => {
    const engine = make()
    const edit = (e: Parameters<typeof engine.dispatch>[0] & { type: 'service.edit' }) => engine.dispatch(e)
    edit({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.addHeading', itemId: 'sermon', kind: 'sermon', title: 'Sermon', afterItemId: 'item-john-3' } })
    edit({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.moveItem', itemId: 'item-it-is-well', toIndex: 0 } })
    edit({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.updateItem', itemId: 'sermon', changes: { notes: 'Pause before the story', minutes: 35 } } })
    expect(engine.service.items.map((i) => i.id)).toEqual(['item-it-is-well', 'item-amazing-grace', 'item-john-3', 'sermon'])
    expect(engine.snapshot().decks[3]).toMatchObject({ notes: 'Pause before the story', minutes: 35 })
    edit({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.updateItem', itemId: 'item-amazing-grace', changes: { themeId: 'paper', minutes: null } } })
    expect(engine.snapshot().decks[1]!.themeId).toBe('paper')
    edit({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.updateItem', itemId: 'sermon', changes: { arrangementId: 'x' } } })
    expect(engine.service.items[3]).not.toHaveProperty('arrangementId')
  })

  it('times the live item and the service for the timeline', () => {
    const engine = make()
    engine.dispatch({ type: 'live.take' })
    expect(engine.current.timing).toEqual({ itemId: 'item-amazing-grace', itemStartedAt: clock.now, serviceStartedAt: clock.now })
    const started = clock.now
    clock.now += 60_000
    engine.dispatch({ type: 'live.next' })
    expect(engine.current.timing.itemStartedAt).toBe(started)
    engine.dispatch({ type: 'item.select', itemId: 'item-john-3' })
    engine.dispatch({ type: 'live.take' })
    expect(engine.current.timing).toEqual({ itemId: 'item-john-3', itemStartedAt: clock.now, serviceStartedAt: started })
  })
})

describe('Engine stage screen', () => {
  it('sets the layout, sends and clears messages, and runs a countdown on the engine clock', () => {
    const clock = { now: 1_000_000 }
    const engine = new Engine({ bibles: testBibles, library: starterLibrary, now: () => clock.now })
    const stage = fakePort()
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    const frame = () => stage.renders().at(-1)!.stage!

    engine.dispatch({ type: 'stage.layout', layout: 'preacher' })
    engine.dispatch({ type: 'stage.message', text: '  Repeat the chorus  ' })
    expect(frame()).toMatchObject({ layout: 'preacher', message: { text: 'Repeat the chorus', sentAt: 1_000_000 } })

    engine.dispatch({ type: 'stage.timerSet', label: 'Sermon', minutes: 30 })
    engine.dispatch({ type: 'stage.timer', action: 'start' })
    expect(frame().timer).toEqual({ label: 'Sermon', durationMs: 1_800_000, endsAt: 2_800_000, remainingMs: 1_800_000 })
    clock.now += 600_000
    engine.dispatch({ type: 'stage.timer', action: 'pause' })
    expect(frame().timer).toMatchObject({ endsAt: null, remainingMs: 1_200_000 })
    engine.dispatch({ type: 'stage.timer', action: 'reset' })
    expect(frame().timer.remainingMs).toBe(1_800_000)

    engine.dispatch({ type: 'stage.message', text: null })
    expect(frame().message).toBeNull()
    engine.dispatch({ type: 'stage.timerSet', label: 'x', minutes: -1 })
    engine.dispatch({ type: 'stage.layout', layout: 'nope' as 'clock' })
    expect(frame()).toMatchObject({ layout: 'preacher', timer: { label: 'Sermon' } })
  })

  it('shows the item notes and keeps the stage state across a restart', async () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary })
    engine.dispatch({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.updateItem', itemId: 'item-amazing-grace', changes: { notes: 'Slow the last verse' } } })
    engine.dispatch({ type: 'stage.message', text: 'Hello' })
    engine.dispatch({ type: 'live.take' })
    const stage = fakePort()
    engine.connect(stage.port, { role: 'output', outputId: 'stage' })
    expect(stage.renders().at(-1)!.stage!.notes).toBe('Slow the last verse')
    const restored = new Engine({ bibles: testBibles, library: engine.documents, restored: engine.current })
    expect(restored.current.stage.message?.text).toBe('Hello')
  })
})

describe('Engine volunteer mode and rehearsal', () => {
  const setup = () => {
    const clock = { now: 1_000_000 }
    const saved: { pinHash?: string; isLocked: boolean }[] = []
    const states: EngineState[] = []
    const live: string[] = []
    const engine = new Engine({
      bibles: testBibles,
      library: starterLibrary,
      now: () => clock.now,
      onSettingsChange: (s) => saved.push(s),
      onStateChange: (s) => states.push(s),
      onItemLive: (item) => live.push(item.id),
    })
    const unlock = (pin: string) => (engine as unknown as { query(q: object): { isUnlocked: boolean; waitSeconds: number } }).query({ type: 'volunteer.unlock', pin })
    return { engine, clock, saved, states, live, unlock }
  }

  it('needs a PIN to lock the first time, and stores only its hash', () => {
    const { engine, saved } = setup()
    engine.dispatch({ type: 'volunteer.lock' })
    engine.dispatch({ type: 'volunteer.lock', pin: '12' })
    expect(engine.snapshot().mode.isLocked).toBe(false)
    engine.dispatch({ type: 'volunteer.lock', pin: '2580' })
    expect(engine.snapshot().mode).toEqual({ isLocked: true, hasPin: true, isRehearsing: false })
    expect(saved.at(-1)).toMatchObject({ isLocked: true, pinHash: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(JSON.stringify(saved)).not.toContain('2580')
  })

  it('refuses anything but presenting while locked', () => {
    const { engine, unlock } = setup()
    engine.dispatch({ type: 'volunteer.lock', pin: '2580' })
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'live.next' })
    expect(engine.current.live.slide).toEqual({ itemId: 'item-amazing-grace', index: 1 })
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setTitle', title: 'Changed' } })
    engine.dispatch({ type: 'service.edit', serviceId: 'sunday', edit: { type: 'service.removeItem', itemId: 'item-john-3' } })
    engine.dispatch({ type: 'song.delete', songId: 'it-is-well' })
    engine.dispatch({ type: 'volunteer.setPin', pin: '0000' })
    expect(engine.documents.songs['amazing-grace']!.title).toBe('Amazing Grace')
    expect(engine.service.items).toHaveLength(3)
    expect(unlock('0000').isUnlocked).toBe(false)
    expect(unlock('2580').isUnlocked).toBe(true)
    engine.dispatch({ type: 'song.edit', songId: 'amazing-grace', edit: { type: 'song.setTitle', title: 'Changed' } })
    expect(engine.documents.songs['amazing-grace']!.title).toBe('Changed')
  })

  it('blocks unlocking for 30 seconds after five wrong PINs', () => {
    const { engine, clock, unlock } = setup()
    engine.dispatch({ type: 'volunteer.lock', pin: '2580' })
    for (let i = 0; i < 4; i++) expect(unlock('1111')).toEqual({ type: 'unlock', isUnlocked: false, waitSeconds: 0 })
    expect(unlock('1111')).toMatchObject({ isUnlocked: false, waitSeconds: 30 })
    expect(unlock('2580')).toMatchObject({ isUnlocked: false, waitSeconds: 30 })
    clock.now += 31_000
    expect(unlock('2580').isUnlocked).toBe(true)
  })

  it('keeps the screens and the saved state on air while rehearsing, then restores it', () => {
    const { engine, states, live } = setup()
    const projector = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    engine.dispatch({ type: 'live.take' })
    const onAir = engine.current
    const frames = projector.renders().length
    const saves = states.length

    engine.dispatch({ type: 'rehearsal.start' })
    engine.dispatch({ type: 'item.select', itemId: 'item-it-is-well' })
    engine.dispatch({ type: 'live.take' })
    engine.dispatch({ type: 'layer.clearAll' })
    expect(projector.renders()).toHaveLength(frames)
    expect(states).toHaveLength(saves)
    expect(live).toEqual(['item-amazing-grace'])
    expect(engine.snapshot().mode.isRehearsing).toBe(true)
    expect(engine.snapshot().liveRender.background).toBeNull()

    engine.dispatch({ type: 'rehearsal.stop' })
    expect(engine.current).toEqual(onAir)
    expect(engine.snapshot().liveRender.slide!.boxes[0]!.lines[0]).toBe('Amazing grace, how sweet the sound')
  })

  it('starts locked when the saved settings say so, and refuses imports while locked', () => {
    const engine = new Engine({ bibles: testBibles, library: starterLibrary, settings: { isLocked: true, pinHash: 'aa', pinSalt: 'bb' } })
    const query = (q: object) => (engine as unknown as { query(q: object): { type: string } }).query(q)
    expect(engine.snapshot().mode.isLocked).toBe(true)
    expect(query({ type: 'import.preview', files: [] }).type).toBe('hits')
  })
})


describe('Engine instant presenting', () => {
  const setup = () => {
    const states: EngineState[] = []
    const live: string[] = []
    const engine = new Engine({ bibles: testBibles, library: starterLibrary, onStateChange: (s) => states.push(s), onItemLive: (item) => live.push(item.id) })
    const projector = fakePort()
    engine.connect(projector.port, { role: 'output', outputId: 'projector' })
    const ask = (query: object) => (engine as unknown as { query(q: object): { type: string; chapter?: unknown; slides?: unknown[] } }).query(query)
    return { engine, projector, states, live, ask }
  }
  const grace = { type: 'song', songId: 'amazing-grace' } as const

  it('previews and takes a library song live without touching the service or its timing', () => {
    const { engine, projector, live } = setup()
    const items = engine.service.items
    engine.dispatch({ type: 'instant.show', source: grace, index: 1, isLive: false })
    const id = engine.current.preview!.itemId
    expect(id).toMatch(/^instant-song-/)
    expect(engine.current.selectedItemId).toBe('item-amazing-grace')
    expect(engine.snapshot().instant.map((d) => d.title)).toEqual(['Amazing Grace'])
    engine.dispatch({ type: 'instant.show', source: grace, index: 0, isLive: true })
    expect(engine.current.live.slide).toEqual({ itemId: id, index: 0 })
    expect(projector.renders().at(-1)!.slide!.boxes[0]!.lines[0]).toBe('Amazing grace, how sweet the sound')
    expect(engine.service.items).toBe(items)
    expect(live).toEqual([])
    expect(engine.current.timing.itemId).toBeNull()
  })

  it('steps within a library deck and never runs on into the service', () => {
    const { engine } = setup()
    const count = engine.snapshot().decks[0]!.slides.length
    engine.dispatch({ type: 'instant.show', source: grace, index: count - 1, isLive: true })
    const at = engine.current.live.slide
    engine.dispatch({ type: 'live.next' })
    expect(engine.current.live.slide).toEqual(at)
    engine.dispatch({ type: 'live.previous' })
    expect(engine.current.live.slide).toEqual({ ...at!, index: count - 2 })
  })

  it('drops a library source once nothing shows it, and keeps it in the saved state while it does', () => {
    const { engine, states } = setup()
    engine.dispatch({ type: 'instant.show', source: grace, index: 0, isLive: true })
    expect(Object.keys(states.at(-1)!.instant)).toHaveLength(1)
    engine.dispatch({ type: 'item.select', itemId: 'item-john-3' })
    engine.dispatch({ type: 'live.take' })
    expect(engine.current.instant).toEqual({})
    expect(engine.snapshot().instant).toEqual([])
  })

  it('lists a chapter with the slide each verse starts on, and presents it from there', () => {
    const { engine, ask, projector } = setup()
    const result = ask({ type: 'bible.chapter', book: 'JHN', chapter: 3, translations: ['KJV', 'WEB'] }) as { chapter: { source: object; verses: { verse: number; main: string; secondary: string; slideIndex: number }[] } }
    const verse16 = result.chapter.verses.find((v) => v.verse === 16)!
    expect(verse16.main).toContain('For God so loved the world')
    expect(verse16.secondary).not.toBe('')
    engine.dispatch({ type: 'instant.show', source: result.chapter.source as never, index: verse16.slideIndex, isLive: true })
    expect(projector.renders().at(-1)!.slide!.boxes[0]!.lines[0]).toContain('For God so loved the world')
    expect(ask({ type: 'bible.chapter', book: 'XYZ', chapter: 1, translations: ['KJV'] }).chapter).toBeNull()
  })

  it('refuses malformed sources and slide indexes', () => {
    const { engine } = setup()
    const before = engine.current
    engine.dispatch({ type: 'instant.show', source: { type: 'song', songId: '../x' }, index: 0, isLive: true })
    engine.dispatch({ type: 'instant.show', source: grace, index: 99, isLive: true })
    engine.dispatch({ type: 'instant.show', source: { type: 'scripture', ref: { book: 'JHN', startChapter: 99, endChapter: 99, startVerse: 1, endVerse: 1 }, translations: ['KJV'], versesPerSlide: 1 }, index: 0, isLive: false })
    expect(engine.current).toBe(before)
  })

  it('returns a library song’s slides for the Songs tab', () => {
    const { ask } = setup()
    expect((ask({ type: 'song.slides', songId: 'amazing-grace' }).slides as unknown[]).length).toBeGreaterThan(2)
    expect(ask({ type: 'song.slides', songId: 'gone' }).slides).toEqual([])
  })
})

describe('Engine Bible downloads', () => {
  const version = { id: 7, title: 'Test Version', abbreviation: 'kjv', languageTag: 'eng', languageName: 'English', language: 'en' }
  const details = { books: [{ usfm: 'JUD', human: 'Jude', chapters: [{ usfm: 'JUD.1', canonical: true }] }], copyright_short: { text: 'Test copyright' } }
  const chapter = '<span class="verse v1" data-usfm="JUD.1.1"><span class="label">1</span><span class="content">Jude, a servant.</span></span>'
  const setup = async (status = 200) => {
    const encode = (text: string) => new TextEncoder().encode(text)
    const fetcher = async (url: string) => {
      if (status !== 200) return { status, body: encode('') }
      if (url.includes('/api/bible/versions')) return { status, body: encode(JSON.stringify({ response: { data: { versions: [{ ...version, text: true, language: { language_tag: 'eng', iso_639_1: 'en' } }] } } })) }
      if (url.includes('/api/bible/version/')) return { status, body: encode(JSON.stringify(details)) }
      return { status, body: encode(chapter) }
    }
    const removed: string[] = []
    const installed: string[] = []
    const stagingDir = await mkdtemp(join(tmpdir(), 'openstage-dl-'))
    const engine = new Engine({
      bibles: testBibles,
      library: starterLibrary,
      bundledBibles: ['WEB'],
      bibleCom: { client: new BibleComClient(fetcher), stagingDir, retryDelayMs: 1 },
      onBibleImported: (b) => installed.push(b.code),
      onBibleRemoved: (code) => removed.push(code),
    })
    const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
    return { engine, removed, installed, settle }
  }

  it('lists the catalogue, downloads a version under a free code and installs it', async () => {
    const { engine, installed, settle } = await setup()
    const catalog = (await (engine as unknown as { query(q: object): Promise<{ versions: unknown[] }> }).query({ type: 'bible.catalog', languageTag: 'eng' })).versions
    expect(catalog).toHaveLength(1)
    engine.dispatch({ type: 'bible.download', version })
    expect(engine.snapshot().downloads.map((d) => d.version.id)).toEqual([7])
    await settle()
    expect(engine.snapshot().downloads).toEqual([])
    expect(installed).toEqual(['KJV-7'])
    expect(engine.snapshot().downloadedVersionIds).toEqual([7])
    expect(engine.snapshot().bibles.find((b) => b.code === 'KJV-7')).toMatchObject({ name: 'Test Version', notice: 'Test copyright' })
  })

  it('keeps a refused download with its reason, and refuses bad versions', async () => {
    const { engine, settle } = await setup(429)
    engine.dispatch({ type: 'bible.download', version: { ...version, id: -1 } })
    expect(engine.snapshot().downloads).toEqual([])
    engine.dispatch({ type: 'bible.download', version })
    await settle()
    expect(engine.snapshot().downloads[0]).toMatchObject({ isRefused: true, error: expect.stringContaining('not accepting') })
    engine.dispatch({ type: 'bible.cancelDownload', versionId: 7 })
    expect(engine.snapshot().downloads).toEqual([])
  })

  it('removes added Bibles but never bundled ones', async () => {
    const { engine, removed } = await setup()
    engine.dispatch({ type: 'bible.remove', code: 'WEB' })
    engine.dispatch({ type: 'bible.remove', code: 'KJV' })
    expect(removed).toEqual(['KJV'])
    expect(engine.snapshot().bibles.map((b) => b.code)).toEqual(['WEB'])
  })
})

describe('Engine song catalogues', () => {
  const imported = {
    title: 'Free Song',
    authors: ['A. Writer'],
    copyright: '',
    languages: ['en'],
    sections: [{ label: 'Verse 1', slides: [[{ text: 'A free song line', chords: [] }]] }],
    order: [],
  }
  const songs = [
    { id: 1, title: 'Free Song', authors: ['A. Writer'], firstLine: 'A free song line', isRestricted: false, language: 'en' },
    { id: 2, title: 'Amazing Grace', authors: [], firstLine: 'Amazing grace, how sweet the sound', isRestricted: true, language: 'en' },
  ]
  const setup = (fail = false) => {
    let packs = 0
    const client = {
      languages: async () => [{ code: 'en', name: 'English', count: 2 }],
      pack: async () => {
        packs++
        if (fail) throw Object.assign(new Error('No connection to the Worship Leader song server.'), { name: 'SongSourceError' })
        return { songs, imported: new Map([[1, imported], [2, { ...imported, title: 'Amazing Grace', sections: [{ label: 'Verse 1', slides: [[{ text: 'Amazing grace, how sweet the sound', chords: [] }]] }] }]]) }
      },
    }
    const engine = new Engine({ bibles: testBibles, library: starterLibrary, songSources: { worshipLeader: client } })
    const ask = (q: object) => (engine as unknown as { query(q: object): Promise<Record<string, unknown>> }).query(q)
    return { engine, ask, packs: () => packs }
  }

  it('lists languages and songs, fetching a language once, and previews chosen songs as an import', async () => {
    const { ask, packs } = setup()
    expect(await ask({ type: 'songs.languages', source: 'worshipLeader' })).toMatchObject({ languages: [{ code: 'en' }], error: null })
    expect((await ask({ type: 'songs.catalog', source: 'worshipLeader', language: 'en' })).songs).toHaveLength(2)
    const plan = (await ask({ type: 'songs.preview', source: 'worshipLeader', language: 'en', songIds: [1, 2, 99] })).plan as { importId: string; items: { title: string; status: string; reason: string }[] }
    expect(packs()).toBe(1)
    expect(plan.items.map((i) => [i.title, i.status])).toEqual([
      ['Free Song', 'new'],
      ['Amazing Grace', 'duplicate'],
      ['Worship Leader song 99', 'unreadable'],
    ])
    const report = (await ask({ type: 'import.apply', importId: plan.importId, decisions: { i0: 'add' }, bibles: {} })).report as { added: string[] }
    expect(report.added).toEqual(['Free Song'])
  })

  it('reports a failed fetch and tries again next time', async () => {
    const { ask, packs } = setup(true)
    expect(await ask({ type: 'songs.catalog', source: 'worshipLeader', language: 'en' })).toMatchObject({ songs: [], error: 'No connection to the Worship Leader song server.' })
    await ask({ type: 'songs.catalog', source: 'worshipLeader', language: 'en' })
    expect(packs()).toBe(2)
    expect(await ask({ type: 'songs.catalog', source: 'nowhere', language: 'en' })).toMatchObject({ error: 'The song catalogue is not available.' })
  })
})
