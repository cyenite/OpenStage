import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Command, DeckSlide, SongOutline, DocumentKind, DocumentTypes, EngineMessage, LibraryQuery, OperatorSnapshot, QueryResult, SearchHit } from '@openstage/shared'
import { engine } from '../engine-client'

let latest: OperatorSnapshot | null = null
let nextRequestId = 1

engine.subscribe((message) => {
  if (message.type === 'snapshot') latest = message.snapshot
})

export function useSnapshot(): OperatorSnapshot | null {
  return useSyncExternalStore(
    (onChange) => engine.subscribe((message) => message.type === 'snapshot' && onChange()),
    () => latest,
  )
}

export function dispatch(command: Command): void {
  engine.send({ type: 'command', command })
}

/** Re-runs the query whenever its inputs change, the library changes (`revision`) or the engine reconnects. */
function useQuery<T>(query: LibraryQuery | null, revision: number, pick: (result: QueryResult) => T | undefined, empty: T): T {
  const [value, setValue] = useState<T>(empty)
  const key = JSON.stringify(query)
  useEffect(() => {
    if (!query) return setValue(empty)
    let requestId = 0
    const ask = () => {
      requestId = nextRequestId++
      engine.send({ type: 'query', requestId, query: JSON.parse(key) })
    }
    const stopListening = engine.subscribe((message) => {
      if (message.type !== 'result' || message.requestId !== requestId) return
      const picked = pick(message.result)
      if (picked !== undefined) setValue(picked)
    })
    const stopReconnect = engine.onConnect(ask)
    ask()
    return () => {
      stopListening()
      stopReconnect()
    }
  }, [key, revision])
  return value
}

/** One request and its answer, for queries the UI runs on demand rather than follows. */
export function ask(query: LibraryQuery): Promise<QueryResult> {
  return new Promise((resolve) => {
    const requestId = nextRequestId++
    const stop = engine.subscribe((message) => {
      if (message.type !== 'result' || message.requestId !== requestId) return
      stop()
      resolve(message.result)
    })
    engine.send({ type: 'query', requestId, query })
  })
}

const noHits: SearchHit[] = []
const noOutlines: SongOutline[] = []
const noSlides: DeckSlide[] = []

export function useLibraryQuery(query: LibraryQuery, revision: number): SearchHit[] {
  return useQuery(query, revision, (result) => (result.type === 'hits' ? result.hits : undefined), noHits)
}

export function useSongOutlines(songIds: string[], revision: number): SongOutline[] {
  return useQuery({ type: 'song.outlines', songIds: [...new Set(songIds)].sort() }, revision, (result) => (result.type === 'outlines' ? result.outlines : undefined), noOutlines)
}

export function useScriptureSlides(passageId: string | null, revision: number): DeckSlide[] {
  const query = passageId ? ({ type: 'scripture.slides', passageId } as const) : null
  return useQuery(query, revision, (result) => (result.type === 'slides' ? result.slides : undefined), noSlides)
}

export interface WatchedDocument<K extends DocumentKind> {
  document: DocumentTypes[K] | null
  canUndo: boolean
  canRedo: boolean
  isLoaded: boolean
}

/** Follows one document; the engine pushes every change. Only one document is watched per window. */
export function useDocument<K extends DocumentKind>(kind: K, id: string | null): WatchedDocument<K> {
  const [watched, setWatched] = useState<WatchedDocument<K>>({ document: null, canUndo: false, canRedo: false, isLoaded: false })
  useEffect(() => {
    setWatched({ document: null, canUndo: false, canRedo: false, isLoaded: false })
    if (!id) return
    const ref = { kind, id }
    const watch = () => engine.send({ type: 'watch', ref })
    const stopListening = engine.subscribe((message: EngineMessage) => {
      if (message.type !== 'document' || message.ref.kind !== kind || message.ref.id !== id) return
      const { document, canUndo, canRedo } = message
      setWatched({ document: document as DocumentTypes[K] | null, canUndo, canRedo, isLoaded: true })
    })
    const stopReconnect = engine.onConnect(watch)
    watch()
    return () => {
      stopListening()
      stopReconnect()
      engine.send({ type: 'watch', ref: null })
    }
  }, [kind, id])
  return watched
}
