import {
  followTemplate,
  stageLayouts,
  isSafeId,
  itemMinutes,
  bookById,
  instantId,
  lookup,
  parseReference,
  passageSlides,
  versesFor,
  type ChapterView,
  serviceFromTemplate,
  serviceReadiness,
  type ServiceSummary,
  type ServiceTemplate,
  type TemplateEdit,
  type BibleInfo,
  type BibleDownload,
  type BibleText,
  type RemoteVersion,
  songSources,
  type CatalogSong,
  type LibraryQuery,
  type SongLanguage,
  type SongSourceKey,
  volunteerCommands,
  type ImportDecision,
  type ImportFile,
  type ImportReport,
  newId,
  type PassageEdit,
  type QueryResult,
  type ClientHello,
  type ClientMessage,
  type Command,
  type Deck,
  type DocumentKind,
  type DocumentRef,
  type DocumentTypes,
  type EditableKind,
  type EngineMessage,
  type EngineState,
  type Id,
  type Library,
  type OperatorSnapshot,
  type RenderState,
  type SearchHit,
  type Service,
  type ServiceEdit,
  type ServiceItem,
  type SongEdit,
  type ThemeEdit,
} from '@openstage/shared'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { BibleComError, downloadVersion, DownloadCancelled, type BibleComClient } from './bibles/biblecom'
import { bibleInfo } from './bibles/store'
import { readFiles } from './import/detect'
import { findDuplicate, isBibleCode, mergeInto, planItems, songFromImport } from './import/plan'
import type { ImportedSong, Parsed } from './import/types'
import { buildDecks, buildInstantDecks, scriptureSlides } from './decks'
import { cleanInstant, cleanSource, pruneInstant } from './instant'
import { applyPassageEdit, applyServiceEdit, applySongEdit, applyTemplateEdit, applyThemeEdit, createPassage, createSong, createTemplate, createTheme, isPassageRef } from './edits'
import { outputs, resolveRender, type OutputId } from './resolve'
import { initialState, noTiming, reduce, sanitize } from './state'
import { DocumentHistory } from './store/history'
import type { LibrarySearch } from './store/library-index'

export interface ClientPort {
  send(message: EngineMessage): void
  onMessage(listener: (message: ClientMessage) => void): void
  onClose(listener: () => void): void
}

interface Client {
  port: ClientPort
  hello: ClientHello
  watching: DocumentRef | null
}

interface Edits {
  songs: SongEdit
  themes: ThemeEdit
  passages: PassageEdit
  services: ServiceEdit
  templates: TemplateEdit
}

type History = DocumentHistory<DocumentTypes[EditableKind], Edits[EditableKind]>

const appliers: { [K in EditableKind]: (document: DocumentTypes[K], edit: Edits[K]) => DocumentTypes[K] } = {
  songs: applySongEdit,
  themes: applyThemeEdit,
  passages: applyPassageEdit,
  services: applyServiceEdit,
  templates: applyTemplateEdit,
}

const isEditable = (kind: unknown): kind is EditableKind => typeof kind === 'string' && Object.hasOwn(appliers, kind)

interface OutputChannel {
  json: string
  render: RenderState
  ackedSeq: number
}

/** Kept in `settings.json`, so a locked window stays locked across a restart. */
export interface EngineSettings {
  pinHash?: string
  pinSalt?: string
  isLocked: boolean
}

export interface EngineOptions {
  now?: () => number
  settings?: EngineSettings
  onSettingsChange?: (settings: EngineSettings) => void
  index?: LibrarySearch
  bibles?: BibleText[]
  library: Library
  restored?: EngineState | null
  serviceId?: Id | null
  onItemLive?: (item: ServiceItem, service: Service) => void
  onStateChange?: (state: EngineState) => void
  onDocumentChange?: <K extends DocumentKind>(kind: K, document: DocumentTypes[K]) => void
  onDocumentRemove?: (kind: DocumentKind, id: Id) => void
  onBibleImported?: (bible: BibleText) => void
  onBibleRemoved?: (code: string) => void
  /** Codes of the Bibles that ship with the app; they cannot be removed. */
  bundledBibles?: string[]
  /** Where bible.com downloads come from and where their chapters wait until the version is complete. */
  bibleCom?: { client: BibleComClient; stagingDir: string; retryDelayMs?: number }
  songSources?: Partial<Record<SongSourceKey, SongCatalogClient>>
}

/** What the engine needs from an online song catalogue. */
export interface SongCatalogClient {
  languages(): Promise<SongLanguage[]>
  pack(language: string): Promise<{ songs: CatalogSong[]; imported: Map<number, ImportedSong> }>
}

const noService: Service = { id: '', name: 'No service', items: [] }

/** A catalogue entry comes back from the operator window, so it is checked before any URL is built from it. */
function cleanRemoteVersion(raw: unknown): RemoteVersion | null {
  const v = raw as Partial<RemoteVersion> | null
  const isText = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max
  if (!v || !Number.isInteger(v.id) || v.id! < 1 || !isText(v.title, 200) || !isText(v.abbreviation, 32) || !isText(v.language, 16) || !/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(v.language)) return null
  return { id: v.id!, title: v.title.trim(), abbreviation: v.abbreviation.trim(), language: v.language, languageTag: String(v.languageTag ?? ''), languageName: String(v.languageName ?? '') }
}

const isPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4,8}$/.test(pin)

function hashPin(pin: string, salt = randomBytes(16).toString('hex')): { pinHash: string; pinSalt: string } {
  return { pinHash: scryptSync(pin, salt, 32).toString('hex'), pinSalt: salt }
}

const localDay = (time: number) => {
  const date = new Date(time)
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/**
 * Owns all live state. The operator window, outputs and (later) remotes are clients:
 * they send commands and receive resolved state, so any of them can reload without losing the show.
 */
export class Engine {
  private decks: Deck[]
  private library: Library
  private state: EngineState
  private libraryRevision = 0
  private readonly options: EngineOptions
  private readonly clients = new Set<Client>()
  private readonly histories = new Map<string, History>()
  private readonly imports = new Map<Id, Parsed[]>()
  private bibleList: BibleText[]
  private settings: EngineSettings
  /** What the screens show while rehearsing; null when not rehearsing. */
  private onAir: EngineState | null = null
  private failedUnlocks = 0
  private unlockBlockedUntil = 0
  private readonly channels = new Map<OutputId, OutputChannel>()
  private readonly downloads = new Map<number, BibleDownload & { isCancelled: boolean }>()
  /** One fetch per catalogue language per session; a failed fetch is forgotten so it can be retried. */
  private readonly songPacks = new Map<string, ReturnType<SongCatalogClient['pack']>>()

  constructor(options: EngineOptions) {
    this.options = options
    this.library = options.library
    this.bibleList = options.bibles ?? []
    this.settings = options.settings ?? { isLocked: false }
    const services = Object.values(options.library.services).sort(byName)
    const serviceId = options.restored?.serviceId ?? lookup(options.library.services, options.serviceId)?.id ?? services[0]?.id ?? null
    this.decks = buildDecks(lookup(this.library.services, serviceId) ?? noService, this.library, this.bibles)
    const background = Object.values(options.library.backgrounds).sort(byName)[0]?.id ?? null
    this.state = options.restored ?? initialState(this.decks, background, serviceId)
    if (!this.state.instant) this.state = { ...this.state, instant: {} }
    this.resolveOutputs()
  }

  get current(): EngineState {
    return this.state
  }

  get service(): Service {
    return lookup(this.library.services, this.state.serviceId) ?? noService
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private get bibles(): BibleText[] {
    return this.bibleList
  }

  get documents(): Library {
    return this.library
  }

  /** The service's decks plus the library decks a state shows; outputs and the reducer see both. */
  private decksFor(state: Partial<EngineState> = this.state): Deck[] {
    return [...this.decks, ...buildInstantDecks(cleanInstant(state.instant), this.service, this.library, this.bibles)]
  }

  private contextFor(state: EngineState) {
    return { decks: this.decksFor(state), library: this.library }
  }

  connect(port: ClientPort, hello: ClientHello): void {
    const client: Client = { port, hello, watching: null }
    this.clients.add(client)
    port.onClose(() => {
      this.clients.delete(client)
      this.sendSnapshots()
    })
    port.onMessage((message) => this.receive(client, message))
    const channel = hello.outputId ? this.channels.get(hello.outputId as OutputId) : undefined
    if (hello.role === 'output' && channel) port.send({ type: 'render', render: channel.render })
    this.sendSnapshots()
  }

  dispatch(command: Command): void {
    if (this.settings.isLocked && !volunteerCommands.has(command?.type)) return
    switch (command.type) {
      case 'volunteer.lock':
        return this.lock(command.pin)
      case 'volunteer.setPin':
        if (isPin(command.pin)) this.saveSettings({ ...this.settings, ...hashPin(command.pin) })
        return
      case 'rehearsal.start':
        return this.setRehearsing(true)
      case 'rehearsal.stop':
        return this.setRehearsing(false)
      case 'song.create':
        return this.createSong(command)
      case 'song.delete':
        return this.deleteSong(command.songId)
      case 'song.edit':
        return this.edit('songs', command.songId, (history) => history.execute(command.edit))
      case 'service.edit':
        return this.edit('services', command.serviceId, (history) => history.execute(this.completeServiceEdit(command.edit)))
      case 'stage.layout':
      case 'stage.message':
      case 'stage.timer':
      case 'stage.timerSet':
        return this.stageCommand(command)
      case 'service.create':
        return this.createService(command)
      case 'service.open':
        return this.openService(command.serviceId)
      case 'service.delete':
        return this.deleteService(command.serviceId)
      case 'template.create':
        if (!isSafeId(command.templateId) || Object.hasOwn(this.library.templates, command.templateId)) return
        return this.store('templates', createTemplate(command.templateId, command.name, lookup(this.library.templates, command.fromTemplateId)))
      case 'template.delete':
        return this.deleteTemplate(command.templateId)
      case 'template.edit':
        return this.edit('templates', command.templateId, (history) => history.execute(command.edit))
      case 'theme.create':
        return this.createTheme(command)
      case 'theme.delete':
        return this.deleteTheme(command.themeId)
      case 'theme.edit':
        return this.edit('themes', command.themeId, (history) => history.execute(command.edit))
      case 'passage.create':
        if (!isSafeId(command.passageId) || Object.hasOwn(this.library.passages, command.passageId) || !isPassageRef(command.ref)) return
        return this.store('passages', createPassage(command.passageId, command.ref, this.validTranslations(command.translations)))
      case 'passage.delete':
        return this.deletePassage(command.passageId)
      case 'passage.edit':
        return this.edit('passages', command.passageId, (history) => history.execute(command.edit))
      case 'scripture.quick':
        return this.quickVerse(command)
      case 'instant.show':
        return this.showInstant(command)
      case 'bible.download':
        return void this.downloadBible(command.version)
      case 'bible.cancelDownload': {
        const download = this.downloads.get(command.versionId)
        if (!download) return
        if (download.error === null) download.isCancelled = true
        else this.downloads.delete(command.versionId)
        return this.publish()
      }
      case 'bible.remove':
        return this.removeBible(command.code)
      case 'document.undo':
        if (isEditable(command.ref?.kind)) this.edit(command.ref.kind, command.ref.id, (history) => history.undo())
        return
      case 'document.redo':
        if (isEditable(command.ref?.kind)) this.edit(command.ref.kind, command.ref.id, (history) => history.redo())
        return
    }
    const reduced = pruneInstant(reduce(this.state, command, this.decksFor()))
    if (reduced === this.state) return
    const previousItemId = this.state.live.slide?.itemId
    const item = this.service.items.find((i) => i.id === reduced.live.slide?.itemId)
    const isNewItem = !!item && item.id !== previousItemId
    const now = this.now()
    const timing = isNewItem ? { itemId: item.id, itemStartedAt: now, serviceStartedAt: this.state.timing.serviceStartedAt ?? now } : this.state.timing
    this.setState({ ...reduced, timing })
    if (isNewItem && !this.onAir) this.options.onItemLive?.(item, this.service)
    this.publish()
  }

  snapshot(): OperatorSnapshot {
    const projector = outputs[0]
    return {
      state: this.state,
      decks: this.decks,
      instant: buildInstantDecks(this.state.instant, this.service, this.library, this.bibles),
      service: this.service,
      library: {
        themes: Object.values(this.library.themes).sort(byName),
        templates: Object.values(this.library.templates).sort(byName),
        audioCues: Object.values(this.library.audioCues).sort(byName),
        backgrounds: Object.values(this.library.backgrounds).sort(byName),
        lowerThirds: Object.values(this.library.lowerThirds).sort((a, b) => a.title.localeCompare(b.title)),
      },
      bibles: this.bibles.map(bibleInfo),
      bundledBibles: this.options.bundledBibles ?? [],
      downloadedVersionIds: this.bibles.flatMap((b) => (typeof b.remoteId === 'number' ? [b.remoteId] : [])),
      downloads: [...this.downloads.values()].map(({ isCancelled: _, ...download }) => download),
      services: this.serviceSummaries(),
      libraryRevision: this.libraryRevision,
      mode: { isLocked: this.settings.isLocked, hasPin: !!this.settings.pinHash, isRehearsing: this.onAir !== null },
      themeUses: this.themeUses(),
      outputs: outputs.map((o) => {
        const channel = this.channels.get(o.id)
        return {
          id: o.id,
          name: o.name,
          sentSeq: channel?.render.seq ?? 0,
          ackedSeq: channel?.ackedSeq ?? 0,
          isConnected: [...this.clients].some((c) => c.hello.outputId === o.id),
        }
      }),
      liveRender: this.onAir ? { seq: 0, ...resolveRender(this.state, this.contextFor(this.state), projector) } : this.channels.get(projector.id)!.render,
      previewRender: { seq: 0, ...resolveRender(this.state, this.contextFor(this.state), projector, this.state.preview) },
    }
  }

  private receive(client: Client, message: ClientMessage): void {
    if (message?.type === 'command' && client.hello.role === 'operator') {
      this.dispatch(message.command)
    } else if (message?.type === 'query' && client.hello.role === 'operator' && typeof message.requestId === 'number') {
      const { requestId } = message
      const result = this.query(message.query)
      const send = (answer: QueryResult) => client.port.send({ type: 'result', requestId, result: answer })
      if (result instanceof Promise) void result.then(send)
      else send(result)
    } else if (message?.type === 'watch' && client.hello.role === 'operator') {
      const ref = message.ref
      client.watching = ref && typeof ref.id === 'string' && typeof ref.kind === 'string' ? { kind: ref.kind, id: ref.id } : null
      if (client.watching) this.sendDocument(client, client.watching)
    } else if (message?.type === 'ack' && client.hello.outputId) {
      const channel = this.channels.get(client.hello.outputId as OutputId)
      if (!channel || typeof message.seq !== 'number') return
      channel.ackedSeq = Math.max(channel.ackedSeq, Math.min(message.seq, channel.render.seq))
      this.sendSnapshots()
    }
  }

  private query(query: Extract<ClientMessage, { type: 'query' }>['query']): QueryResult | Promise<QueryResult> {
    const index = this.options.index
    const hits = (list: SearchHit[]): QueryResult => ({ type: 'hits', hits: list })
    if (query?.type === 'scripture.slides') {
      const passage = lookup(this.library.passages, query.passageId)
      return { type: 'slides', slides: passage?.ref ? scriptureSlides(passage, this.bibles) : [] }
    }
    if (query?.type === 'song.slides') {
      const source = cleanSource({ type: 'song', songId: query.songId, arrangementId: query.arrangementId })
      const deck = source && buildInstantDecks({ [instantId(source)]: source }, this.service, this.library, this.bibles)[0]
      return { type: 'slides', slides: deck && lookup(this.library.songs, query.songId) ? deck.slides : [] }
    }
    if (query?.type === 'bible.chapter') return { type: 'chapter', chapter: this.chapterView(query.book, query.chapter, query.translations) }
    if (query?.type === 'volunteer.unlock') return this.unlock(query.pin)
    if (query?.type === 'bible.catalog') return this.catalog(query.languageTag)
    if (query?.type === 'songs.languages' || query?.type === 'songs.catalog' || query?.type === 'songs.preview') return this.songCatalog(query)
    if (this.settings.isLocked && (query?.type === 'import.preview' || query?.type === 'import.apply')) return hits([])
    if (query?.type === 'import.preview') return { type: 'importPlan', plan: this.previewImport(query.files) }
    if (query?.type === 'import.apply') return { type: 'importReport', report: this.applyImport(query.importId, query.decisions, query.bibles) }
    if (query?.type === 'song.outlines') {
      const ids = Array.isArray(query.songIds) ? query.songIds : []
      const outlines = ids.flatMap((id) => {
        const song = lookup(this.library.songs, id)
        return song ? [{ id, title: song.title, languages: song.languages, arrangements: song.arrangements.map(({ id, name }) => ({ id, name })) }] : []
      })
      return { type: 'outlines', outlines }
    }
    if (!index || !query) return hits([])
    if (query.type === 'library.list') return hits(index.list(query.kind))
    if (query.type === 'library.search' && typeof query.text === 'string') return hits(index.search(query.text, { kind: query.kind, limit: query.limit }))
    return hits([])
  }

  private previewImport(files: unknown): { importId: Id; items: ReturnType<typeof planItems> } {
    const sources = (Array.isArray(files) ? files : [])
      .filter((f): f is ImportFile => typeof f?.name === 'string' && f.data instanceof ArrayBuffer)
      .map((f) => ({ name: f.name, bytes: new Uint8Array(f.data) }))
    return this.remember(readFiles(sources))
  }

  /** Keeps what was read until the operator applies their choices; only the last few previews are kept. */
  private remember(parsed: Parsed[]): { importId: Id; items: ReturnType<typeof planItems> } {
    const importId = newId('import')
    this.imports.set(importId, parsed)
    while (this.imports.size > 5) this.imports.delete(this.imports.keys().next().value!)
    return { importId, items: planItems(parsed, this.library, this.bibles) }
  }

  /**
   * Nothing is overwritten without a choice: new items are added unless skipped, duplicates are
   * skipped unless the operator chose Merge or Keep both, and a Bible needs a code not in use.
   */
  private applyImport(importId: Id, decisions: Record<string, ImportDecision>, bibleDetails: Record<string, BibleInfo>): ImportReport {
    const report: ImportReport = { added: [], merged: [], skipped: [], failed: [] }
    const parsed = this.imports.get(importId)
    if (!parsed) return { ...report, failed: [{ title: 'Import', reason: 'This import has expired; drop the files again.' }] }
    this.imports.delete(importId)
    parsed.forEach((entry, index) => {
      const key = `i${index}`
      const choice = decisions?.[key]
      if (entry.kind === 'unreadable') return void report.failed.push({ title: entry.file.replace(/^.*\//, ''), reason: entry.reason })
      if (entry.kind === 'bible') {
        const details = bibleDetails?.[key]
        const info = { ...bibleInfo(entry.bible), ...details }
        if (choice === 'skip' || (choice === undefined && this.bibles.some((b) => b.code === entry.bible.code))) return void report.skipped.push(info.name)
        if (!isBibleCode(info.code) || !String(info.name ?? '').trim() || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(String(info.language))) {
          return void report.failed.push({ title: info.name || entry.file, reason: 'A Bible needs a code of letters and digits, a name and a language code.' })
        }
        if (this.bibles.some((b) => b.code === info.code)) return void report.failed.push({ title: info.name, reason: `The code ${info.code} is already in use.` })
        const bible: BibleText = { ...entry.bible, code: info.code, name: info.name.trim(), language: info.language, notice: String(info.notice ?? '').trim() }
        this.bibleList = [...this.bibleList, bible]
        this.options.onBibleImported?.(bible)
        return void report.added.push(`${bible.name} (${bible.code})`)
      }
      const duplicate = findDuplicate(entry.song, this.library)
      const decision = choice ?? (duplicate ? 'skip' : 'add')
      if (decision === 'skip') return void report.skipped.push(entry.song.title)
      if (decision === 'merge' && duplicate) {
        const merged = mergeInto(lookup(this.library.songs, duplicate.song.id)!, entry.song)
        this.histories.delete(`songs/${merged.id}`)
        this.store('songs', merged)
        return void report.merged.push(merged.title)
      }
      const song = songFromImport(newId(entry.song.title), entry.song)
      this.store('songs', song)
      report.added.push(song.title)
    })
    this.libraryRevision++
    this.decks = buildDecks(this.service, this.library, this.bibles)
    this.publish()
    return report
  }

  /** Only installed Bibles, in the order asked; with none of them, the service's first, else the first installed. */
  private validTranslations(codes: unknown): string[] {
    const installed = new Set(this.bibles.map((b) => b.code))
    const asked = Array.isArray(codes) ? codes.filter((c): c is string => typeof c === 'string' && installed.has(c)) : []
    const fallback = (this.service.translations ?? []).filter((c) => installed.has(c))
    const chosen = asked.length > 0 ? asked : fallback.length > 0 ? fallback : this.bibles.slice(0, 1).map((b) => b.code)
    return [...new Set(chosen)].slice(0, 4)
  }

  /** A whole chapter as the Bible tab lists it; the slide indexes match what `instant.show` with `source` presents. */
  private chapterView(book: unknown, chapter: unknown, translations: unknown): ChapterView | null {
    const codes = this.validTranslations(translations).slice(0, 2)
    const source = cleanSource({ type: 'scripture', ref: { book, startChapter: chapter, startVerse: null, endChapter: chapter, endVerse: null }, translations: codes, versesPerSlide: 1 })
    if (source?.type !== 'scripture') return null
    const chosen = codes.flatMap((code) => this.bibles.filter((b) => b.code === code))
    const rows = versesFor(source.ref, chosen)
    const slides = passageSlides(source.ref, rows, { splitLong: true, translations: codes, versesPerSlide: 1 }, this.bibles)
    const [main, secondary] = codes
    return {
      source,
      chapterCount: chosen[0]?.books[source.ref.book]?.length || bookById(source.ref.book)!.chapters,
      verses: rows.map((row) => ({
        verse: row.verse,
        main: (main && row.texts[main]) || '',
        secondary: (secondary && row.texts[secondary]) || '',
        slideIndex: Math.max(0, slides.findIndex((s) => s.verse === row.verse)),
      })),
    }
  }

  private async catalog(languageTag: unknown): Promise<QueryResult> {
    const bibleCom = this.options.bibleCom
    if (this.settings.isLocked || !bibleCom || typeof languageTag !== 'string' || !/^[a-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(languageTag)) {
      return { type: 'catalog', versions: [], error: 'The catalogue is not available.' }
    }
    try {
      return { type: 'catalog', versions: await bibleCom.client.versions(languageTag), error: null }
    } catch (error) {
      return { type: 'catalog', versions: [], error: error instanceof BibleComError ? error.message : 'The catalogue could not be read.' }
    }
  }

  private async songCatalog(query: Extract<LibraryQuery, { type: 'songs.languages' | 'songs.catalog' | 'songs.preview' }>): Promise<QueryResult> {
    const client = typeof query.source === 'string' && Object.hasOwn(this.options.songSources ?? {}, query.source) ? this.options.songSources![query.source] : undefined
    const failed = (error: unknown) => (error instanceof Error && error.name === 'SongSourceError' ? error.message : 'The song catalogue is not available.')
    if (this.settings.isLocked || !client) {
      if (query.type === 'songs.languages') return { type: 'songLanguages', languages: [], error: 'The song catalogue is not available.' }
      if (query.type === 'songs.catalog') return { type: 'songCatalog', songs: [], error: 'The song catalogue is not available.' }
      return { type: 'importPlan', plan: { importId: '', items: [] } }
    }
    if (query.type === 'songs.languages') {
      return client.languages().then(
        (languages) => ({ type: 'songLanguages', languages, error: null }),
        (error) => ({ type: 'songLanguages', languages: [], error: failed(error) }),
      )
    }
    const key = `${query.source}/${query.language}`
    if (!this.songPacks.has(key)) {
      const pack = client.pack(String(query.language))
      pack.catch(() => this.songPacks.delete(key))
      this.songPacks.set(key, pack)
    }
    try {
      const pack = await this.songPacks.get(key)!
      if (query.type === 'songs.catalog') return { type: 'songCatalog', songs: pack.songs, error: null }
      const label = songSources.find((s) => s.key === query.source)!.label
      const ids = Array.isArray(query.songIds) ? query.songIds.filter((id) => Number.isInteger(id)).slice(0, 2000) : []
      const parsed: Parsed[] = ids.map((id) => {
        const song = pack.imported.get(id)
        const listed = pack.songs.find((s) => s.id === id)
        if (!song) return { kind: 'unreadable', file: `${label} song ${id}`, format: label, reason: 'This song is no longer in the catalogue.' }
        const caution = listed?.isRestricted ? `${label} marks this song as copyrighted; showing it needs your church’s licence.` : undefined
        return { kind: 'song', file: `${label}: ${song.title}`, format: label, song, ...(caution && { caution }) }
      })
      return { type: 'importPlan', plan: this.remember(parsed) }
    } catch (error) {
      if (query.type === 'songs.catalog') return { type: 'songCatalog', songs: [], error: failed(error) }
      return { type: 'importPlan', plan: this.remember([{ kind: 'unreadable', file: 'Song catalogue', format: '', reason: failed(error) }]) }
    }
  }

  /**
   * Fetches a version chapter by chapter in the background and installs it when every chapter is in.
   * Running it again after a failure resumes from the chapters already saved.
   */
  private async downloadBible(raw: unknown): Promise<void> {
    const bibleCom = this.options.bibleCom
    const version = cleanRemoteVersion(raw)
    if (!bibleCom || !version || this.downloads.get(version.id)?.error === null || this.bibles.some((b) => b.remoteId === version.id)) return
    const abbreviation = version.abbreviation.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'BIBLE'
    const code = this.bibles.some((b) => b.code.toUpperCase() === abbreviation) ? `${abbreviation}-${version.id}`.slice(0, 16) : abbreviation
    const download = { version, done: 0, total: 0, error: null, isRefused: false, isCancelled: false }
    this.downloads.set(version.id, download)
    this.publish()
    let lastPublished = 0
    try {
      const bible = await downloadVersion(bibleCom.client, version, code, {
        stagingDir: bibleCom.stagingDir,
        retryDelayMs: bibleCom.retryDelayMs,
        isCancelled: () => download.isCancelled,
        onProgress: (done, total) => {
          Object.assign(download, { done, total })
          // Progress arrives per chapter; a snapshot per chapter would flood the operator window.
          if (done === total || this.now() - lastPublished > 500) {
            lastPublished = this.now()
            this.sendSnapshots()
          }
        },
      })
      this.downloads.delete(version.id)
      const installed: BibleText = { ...bible, remoteId: version.id }
      this.bibleList = [...this.bibleList.filter((b) => b.code !== installed.code), installed]
      this.options.onBibleImported?.(installed)
      this.libraryRevision++
      this.decks = buildDecks(this.service, this.library, this.bibles)
    } catch (error) {
      if (error instanceof DownloadCancelled) this.downloads.delete(version.id)
      else Object.assign(download, { error: error instanceof BibleComError ? error.message : 'The download stopped unexpectedly.', isRefused: error instanceof BibleComError && error.isRefused })
    }
    this.publish()
  }

  private removeBible(code: unknown): void {
    const isBundled = (this.options.bundledBibles ?? []).includes(String(code))
    if (typeof code !== 'string' || isBundled || !this.bibles.some((b) => b.code === code)) return
    this.bibleList = this.bibleList.filter((b) => b.code !== code)
    this.options.onBibleRemoved?.(code)
    this.libraryRevision++
    this.decks = buildDecks(this.service, this.library, this.bibles)
    this.state = sanitize(this.state, this.decksFor(), this.library)
    this.publish()
  }

  /** Puts a library slide in Preview or Live; the service is not touched and its timing does not move. */
  private showInstant(command: Extract<Command, { type: 'instant.show' }>): void {
    const source = cleanSource(command.source)
    if (!source) return
    const withSource = { ...this.state, instant: { ...this.state.instant, [instantId(source)]: source } }
    const next = pruneInstant(reduce(withSource, { ...command, source, isLive: command.isLive === true }, this.decksFor(withSource)))
    if (next === withSource || JSON.stringify(next) === JSON.stringify(this.state)) return
    this.setState(next)
    this.publish()
  }

  private quickVerse(command: Extract<Command, { type: 'scripture.quick' }>): void {
    const parsed = typeof command.text === 'string' ? parseReference(command.text) : null
    const service = this.service
    const isFree = isSafeId(command.itemId) && isSafeId(command.passageId) && !Object.hasOwn(this.library.passages, command.passageId)
    if (!parsed?.ok || !service.id || !isFree || service.items.some((i) => i.id === command.itemId)) return
    this.store('passages', createPassage(command.passageId, parsed.ref, this.validTranslations(service.translations)))
    const afterItemId = this.state.selectedItemId ?? undefined
    this.edit('services', service.id, (history) => history.execute({ type: 'service.addPassage', itemId: command.itemId, passageId: command.passageId, afterItemId }))
    this.dispatch({ type: 'item.select', itemId: command.itemId })
  }

  /** Refused while a service still uses the passage. */
  private deletePassage(passageId: Id): void {
    const isUsed = Object.values(this.library.services).some((s) => s.items.some((i) => i.type === 'scripture' && i.passageId === passageId))
    if (!Object.hasOwn(this.library.passages, passageId) || isUsed) return
    const { [passageId]: _removed, ...passages } = this.library.passages
    this.library = { ...this.library, passages }
    this.histories.delete(`passages/${passageId}`)
    this.options.onDocumentRemove?.('passages', passageId)
    this.afterLibraryChange({ kind: 'passages', id: passageId })
  }

  private history(kind: EditableKind, id: Id): History | null {
    const key = `${kind}/${id}`
    let history = this.histories.get(key)
    if (!history) {
      const document = lookup(this.library[kind] as Record<Id, DocumentTypes[EditableKind]>, id)
      if (!document) return null
      history = new DocumentHistory(document, appliers[kind] as (d: DocumentTypes[EditableKind], e: Edits[EditableKind]) => DocumentTypes[EditableKind])
      this.histories.set(key, history)
    }
    return history
  }

  private edit(kind: EditableKind, id: Id, change: (history: History) => boolean): void {
    const history = this.history(kind, id)
    if (!history || !change(history)) return
    this.store(kind, history.document)
    if (kind === 'templates') this.followTemplateEdit(history.document as ServiceTemplate)
  }

  /** Adds what a service item needs that only the engine knows: the song's first arrangement. */
  private completeServiceEdit(edit: ServiceEdit): ServiceEdit {
    if ((edit?.type !== 'service.addSong' && edit?.type !== 'service.fillSlot') || edit.arrangementId || !edit.songId) return edit
    const arrangementId = this.firstArrangement(edit.songId)
    return arrangementId ? { ...edit, arrangementId } : edit
  }

  /** The stage's clock-driven state needs the engine's time, so it is not part of the pure reducer. */
  private stageCommand(command: Extract<Command, { type: 'stage.layout' | 'stage.message' | 'stage.timer' | 'stage.timerSet' }>): void {
    const now = this.now()
    const stage = this.state.stage
    const timer = stage.timer
    let next = stage
    if (command.type === 'stage.layout' && stageLayouts.some((l) => l.key === command.layout)) {
      next = { ...stage, layout: command.layout }
    } else if (command.type === 'stage.message') {
      const text = typeof command.text === 'string' ? command.text.trim().slice(0, 200) : ''
      next = { ...stage, message: text ? { text, sentAt: now } : null }
    } else if (command.type === 'stage.timerSet') {
      const minutes = Number(command.minutes)
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600) return
      const durationMs = Math.round(minutes * 60_000)
      const label = typeof command.label === 'string' && command.label.trim() ? command.label.trim().slice(0, 60) : 'Countdown'
      next = { ...stage, timer: { label, durationMs, endsAt: null, remainingMs: durationMs } }
    } else if (command.type === 'stage.timer' && command.action === 'start' && timer.endsAt === null) {
      next = { ...stage, timer: { ...timer, endsAt: now + timer.remainingMs } }
    } else if (command.type === 'stage.timer' && command.action === 'pause' && timer.endsAt !== null) {
      next = { ...stage, timer: { ...timer, endsAt: null, remainingMs: timer.endsAt - now } }
    } else if (command.type === 'stage.timer' && command.action === 'reset') {
      next = { ...stage, timer: { ...timer, endsAt: null, remainingMs: timer.durationMs } }
    }
    if (next === stage) return
    this.setState({ ...this.state, stage: next })
    this.publish()
  }

  private firstArrangement = (songId: Id): Id | undefined => lookup(this.library.songs, songId)?.arrangements[0]?.id

  private serviceSummaries(): ServiceSummary[] {
    const key = (s: Service) => `${s.date ?? '9999'} ${s.time ?? ''} ${s.name}`
    return Object.values(this.library.services)
      .sort((a, b) => key(a).localeCompare(key(b)))
      .map((service) => ({
        id: service.id,
        name: service.name,
        date: service.date ?? null,
        time: service.time ?? null,
        team: service.team ?? {},
        items: service.items.length,
        minutes: service.items.reduce((sum, item) => sum + itemMinutes(item), 0),
        readiness: serviceReadiness(service),
        templateId: service.templateId ?? null,
      }))
  }

  private createService(command: Extract<Command, { type: 'service.create' }>): void {
    const name = typeof command.name === 'string' ? command.name.trim() : ''
    const isValid = /^\d{4}-\d{2}-\d{2}$/.test(command.date ?? '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(command.time ?? '')
    if (!isSafeId(command.serviceId) || Object.hasOwn(this.library.services, command.serviceId) || !name || !isValid) return
    const template = lookup(this.library.templates, command.templateId)
    this.store('services', serviceFromTemplate(template, { id: command.serviceId, name, date: command.date, time: command.time }, this.firstArrangement))
  }

  /** Switches what the operator presents. Layers that are not slides stay on screen. */
  private openService(serviceId: Id): void {
    const service = lookup(this.library.services, serviceId)
    if (!service || serviceId === this.state.serviceId) return
    this.decks = buildDecks(service, this.library, this.bibles)
    const fresh = initialState(this.decks, null, serviceId)
    this.setState({ ...fresh, live: { ...this.state.live, slide: null }, timing: noTiming })
    this.publish()
  }

  /** Refused for the open service, which is on screen or about to be. */
  private deleteService(serviceId: Id): void {
    if (!Object.hasOwn(this.library.services, serviceId) || serviceId === this.state.serviceId) return
    const { [serviceId]: _removed, ...services } = this.library.services
    this.library = { ...this.library, services }
    this.histories.delete(`services/${serviceId}`)
    this.options.onDocumentRemove?.('services', serviceId)
    this.afterLibraryChange({ kind: 'services', id: serviceId })
  }

  /** Services made from it keep their items; they just stop following it. */
  private deleteTemplate(templateId: Id): void {
    if (!Object.hasOwn(this.library.templates, templateId)) return
    const { [templateId]: _removed, ...templates } = this.library.templates
    this.library = { ...this.library, templates }
    this.histories.delete(`templates/${templateId}`)
    this.options.onDocumentRemove?.('templates', templateId)
    for (const service of Object.values(this.library.services).filter((s) => s.templateId === templateId)) {
      const { templateId: _old, ...rest } = service
      this.histories.delete(`services/${service.id}`)
      this.store('services', rest)
    }
    this.afterLibraryChange({ kind: 'templates', id: templateId })
  }

  /** Services from today on that came from this template follow its edits; past services stay as they ran. */
  private followTemplateEdit(template: ServiceTemplate): void {
    const today = localDay(this.now())
    for (const service of Object.values(this.library.services)) {
      if (service.templateId !== template.id || (service.date && service.date < today)) continue
      const followed = followTemplate(service, template, this.firstArrangement)
      if (followed === service) continue
      this.histories.delete(`services/${service.id}`)
      this.store('services', followed)
    }
  }

  private createSong(command: Extract<Command, { type: 'song.create' }>): void {
    if (!isSafeId(command.songId) || Object.hasOwn(this.library.songs, command.songId)) return
    this.store('songs', createSong(command.songId, command.title, command.lyrics, command.language))
  }

  /** Refused while any service still uses the song, so no service is left pointing at nothing. */
  private deleteSong(songId: Id): void {
    if (!Object.hasOwn(this.library.songs, songId) || this.isSongInUse(songId)) return
    const { [songId]: _removed, ...songs } = this.library.songs
    this.library = { ...this.library, songs }
    this.histories.delete(`songs/${songId}`)
    this.options.onDocumentRemove?.('songs', songId)
    this.afterLibraryChange({ kind: 'songs', id: songId })
  }

  private createTheme(command: Extract<Command, { type: 'theme.create' }>): void {
    if (!isSafeId(command.themeId) || Object.hasOwn(this.library.themes, command.themeId)) return
    this.store('themes', createTheme(command.themeId, command.name, lookup(this.library.themes, command.fromThemeId)))
  }

  /** Refused while a song or service still points at it; the classic theme is the fallback and is never deleted. */
  private deleteTheme(themeId: Id): void {
    if (!Object.hasOwn(this.library.themes, themeId) || themeId === 'classic' || this.isThemeInUse(themeId)) return
    const { [themeId]: _removed, ...themes } = this.library.themes
    this.library = { ...this.library, themes }
    this.histories.delete(`themes/${themeId}`)
    this.options.onDocumentRemove?.('themes', themeId)
    this.afterLibraryChange({ kind: 'themes', id: themeId })
  }

  isThemeInUse(themeId: Id): boolean {
    return (this.themeUses()[themeId] ?? 0) > 0
  }

  private themeUses(): Record<Id, number> {
    const uses: Record<Id, number> = {}
    for (const document of [...Object.values(this.library.songs), ...Object.values(this.library.services)]) {
      if (document.themeId) uses[document.themeId] = (uses[document.themeId] ?? 0) + 1
    }
    return uses
  }

  isSongInUse(songId: Id): boolean {
    return Object.values(this.library.services).some((service) => service.items.some((i) => i.type === 'song' && i.songId === songId))
  }

  private store<K extends DocumentKind>(kind: K, document: DocumentTypes[K]): void {
    this.library = { ...this.library, [kind]: { ...this.library[kind], [document.id]: document } }
    this.options.onDocumentChange?.(kind, document)
    this.afterLibraryChange({ kind, id: document.id })
  }

  private afterLibraryChange(ref: DocumentRef): void {
    this.libraryRevision++
    this.decks = buildDecks(this.service, this.library, this.bibles)
    const next = sanitize(this.state, this.decksFor(), this.library)
    if (JSON.stringify(next) !== JSON.stringify(this.state)) this.setState(next)
    for (const client of this.clients) {
      if (client.watching?.kind === ref.kind && client.watching.id === ref.id) this.sendDocument(client, ref)
    }
    this.publish()
  }

  private sendDocument(client: Client, ref: DocumentRef): void {
    const records = Object.hasOwn(this.library, ref.kind) ? (this.library[ref.kind] as Record<Id, DocumentTypes[DocumentKind]>) : {}
    const history = isEditable(ref.kind) ? this.histories.get(`${ref.kind}/${ref.id}`) : undefined
    const document = lookup(records, ref.id) ?? null
    client.port.send({ type: 'document', ref, document, canUndo: history?.canUndo ?? false, canRedo: history?.canRedo ?? false })
  }

  /** Rehearsal changes are not saved: a crash mid-rehearsal restores what was on air. */
  private setState(next: EngineState): void {
    this.state = next
    if (!this.onAir) this.options.onStateChange?.(next)
  }

  private saveSettings(settings: EngineSettings): void {
    this.settings = settings
    this.options.onSettingsChange?.(settings)
    this.publish()
  }

  private lock(pin: string | undefined): void {
    if (this.settings.isLocked) return
    if (!this.settings.pinHash && !isPin(pin)) return
    this.saveSettings({ ...this.settings, ...(this.settings.pinHash ? {} : hashPin(pin!)), isLocked: true })
  }

  /** Five wrong PINs in a row block further tries for 30 seconds, so a 4-digit PIN cannot be guessed by trying them all. */
  private unlock(pin: unknown): QueryResult {
    const now = this.now()
    const wait = Math.ceil((this.unlockBlockedUntil - now) / 1000)
    if (wait > 0) return { type: 'unlock', isUnlocked: false, waitSeconds: wait }
    const { pinHash, pinSalt } = this.settings
    const isRight = typeof pin === 'string' && !!pinHash && !!pinSalt && timingSafeEqual(Buffer.from(hashPin(pin, pinSalt).pinHash, 'hex'), Buffer.from(pinHash, 'hex'))
    if (!isRight) {
      this.failedUnlocks++
      if (this.failedUnlocks >= 5) {
        this.failedUnlocks = 0
        this.unlockBlockedUntil = now + 30_000
      }
      return { type: 'unlock', isUnlocked: false, waitSeconds: this.unlockBlockedUntil > now ? 30 : 0 }
    }
    this.failedUnlocks = 0
    this.saveSettings({ ...this.settings, isLocked: false })
    return { type: 'unlock', isUnlocked: true, waitSeconds: 0 }
  }

  /** Rehearsing freezes the outputs on what was on air; stopping puts the operator back exactly there. */
  private setRehearsing(isRehearsing: boolean): void {
    if (isRehearsing === (this.onAir !== null)) return
    if (isRehearsing) {
      this.onAir = this.state
    } else {
      this.state = sanitize(this.onAir!, this.decksFor(this.onAir!), this.library)
      this.onAir = null
    }
    this.publish()
  }

  private publish(): void {
    for (const id of this.resolveOutputs()) this.sendRender(id)
    this.sendSnapshots()
  }

  /** Returns the outputs whose frame actually changed; only those get a new seq. */
  private resolveOutputs(): OutputId[] {
    const changed: OutputId[] = []
    const onScreen = this.onAir ? sanitize(this.onAir, this.decksFor(this.onAir), this.library) : this.state
    const context = this.contextFor(onScreen)
    for (const profile of outputs) {
      const resolved = resolveRender(onScreen, context, profile)
      const json = JSON.stringify(resolved)
      const channel = this.channels.get(profile.id)
      if (channel?.json === json) continue
      const seq = (channel?.render.seq ?? 0) + 1
      this.channels.set(profile.id, { json, render: { seq, ...resolved }, ackedSeq: channel?.ackedSeq ?? 0 })
      changed.push(profile.id)
    }
    return changed
  }

  private sendRender(id: OutputId): void {
    const render = this.channels.get(id)!.render
    for (const client of this.clients) {
      if (client.hello.role === 'output' && client.hello.outputId === id) client.port.send({ type: 'render', render })
    }
  }

  private sendSnapshots(): void {
    const operators = [...this.clients].filter((c) => c.hello.role === 'operator')
    if (operators.length === 0) return
    const snapshot = this.snapshot()
    for (const client of operators) client.port.send({ type: 'snapshot', snapshot })
  }
}
