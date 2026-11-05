# Church Presentation App: Blueprint from a FreeShow Teardown

Investigated 2026-11-05. Source studied: FreeShow `1.6.8-beta.2`, commit `3bbbb85` (2026-11-03), GPL-3.0, about 220k lines of TypeScript/Svelte (`src/electron` 35k, `src/frontend` 160k, `src/server` 22k). Market context comes from public research on ProPresenter 21/22 and open-source alternatives.

Method note: FreeShow is open source, so it was read directly with normal code tools. REA (binary reverse engineering) only adds value for closed apps like ProPresenter or EasyWorship, and was not needed.

> **License warning.** FreeShow is GPL-3.0. Learning its design is fine. Copying its code (or translating it line by line) makes your app GPL too, which means publishing your full source. Everything below describes designs to re-implement, not code to copy. The ProPresenter `.proto` schemas FreeShow uses come from `greyshirtguy/ProPresenter7-Proto`, which is MIT and safe to reuse.

---

## 1. What FreeShow does (the feature set to match)

| Area | Features |
|---|---|
| Library | Shows (songs, sermons, any slide deck), categories, tags, quick-search palette over everything |
| Service planning | Projects in folders (= service order), items: shows, media, PDF, PowerPoint, sections, overlays, cameras, NDI, screens, placeholders; project templates; project timeline |
| Songs | Groups (verse/chorus/bridge) with global group colours, multiple **layouts** (arrangements) over one slide pool, chords per line, transpose, CCLI metadata |
| Editor | Absolutely positioned items, 19 item types (text, media, camera, timer, clock, button, web, QR, chart, table, captions, visualizer, weather, variable, metronome, current output...), text fit, chords mode, conditions/bindings |
| Templates | Templates (slide styling), overlays (lower thirds, logos), per-output "styles" (which layers show, resolution, line limits) |
| Scripture | Local Bibles (Zefania, OSIS, OpenSong, Beblia, SQLite, Access...) and API Bibles, multi-translation slides, verses-per-slide, smart split of long verses (5a/5b), save as show |
| Media | Video/image backgrounds, audio playlists with crossfade, audio routing matrix with effects and ducking, metronome, cameras, screen capture |
| Outputs | Multiple screens, transparent outputs (keying), layers (background, slide, overlays, effects, draw), transitions, NDI, OMT, Blackmagic DeckLink, RTMP streaming, recording, WebRTC |
| Stage display | Separate layouts (current/next slide, notes, chords, clocks, timers, variables, buttons) on a local screen or any browser |
| Remote control | Browser remote, browser controller (with laser pointer), browser stage, output stream viewer, discovered via Bonjour |
| Automation | Actions (macros) triggered by slide entry, timers, MIDI, keys, calendar time, startup and app events; timeline with LTC/MTC timecode; outbound OSC/HTTP/MIDI |
| Control API | WebSocket, REST and OSC, one shared action registry (used by Bitfocus Companion / Stream Deck) |
| Integrations | Planning Center (OAuth + live follow), ChurchApps, Canva, OnStage, Amazing Life, OBS, Spotify |
| Import | ProPresenter 6/7, EasyWorship, OpenLP, OpenSong, MediaShout, Quelea, SongBeamer, VideoPsalm, SoftProjector, EasySlides, VerseVIEW, ChordPro, txt, CSV, Word, PowerPoint, PDF, Canva |
| Sync | ChurchApps cloud and Google Drive sync between machines |
| AI (experimental) | Offline speech-to-text, scripture detection from the preacher's speech, LLM fallback, AI slide generation |

---

## 2. How FreeShow is built

### 2.1 Process and window model
- Electron. One main process, one main UI window, and **one BrowserWindow per output**. Every window loads the *same* Svelte bundle and is told its role at startup (`src/electron/index.ts:266-288`).
- Outputs are frameless, transparent, always-on-top windows sized to a display's bounds. It does not use real fullscreen (`src/electron/utils/windowOptions.ts:42-72`, `output/helpers/OutputAlwaysOnTop.ts`).
- Display hot-plug triggers a delayed re-layout of all outputs (`OutputLifecycle.ts:52-90`).

### 2.2 Output pipeline
- The controller UI sends about 40 store channels to every output window (`src/frontend/utils/listeners.ts:73-401`). Each output **mirrors the controller's whole state** (show cache, templates, overlays, media, timers...) and resolves what to draw itself.
- Live state per output is `out = {background, slide (a reference: show id, layout, index), overlays, effects, transition, scene}` (`src/types/Output.ts:76-84`).
- Layer stack, bottom to top: style background, scene media, background media, colour bars, effects-under, underlays, slide/PDF/PPT, metadata, effects-over, overlays, attribution, drawing (`components/output/Output.svelte:406-482`).
- Video sync: the controller window plays each video's audio as master clock and broadcasts position every 100 ms. Outputs play muted and nudge playback rate or hard-seek to correct drift (`media/video/videoSync.ts:47-130`).
- NDI/OMT/DeckLink/RTMP: a hidden offscreen twin window is captured via GPU shared texture paint events (or `capturePage` polling) and fed to a worker thread that runs all senders (`capture/SenderThread.ts`, `OutputLifecycle.ts`, 1,626 lines). Alpha is preserved as UYVA. Audio reaches NDI over a `MessageChannelMain` port.

### 2.3 Data model
Condensed from `src/types/Show.ts`:
```ts
Show   { name, category, meta{title,artist,author,copyright,CCLI,key...},
         settings{activeLayout, template}, slides: Record<id, Slide>,
         layouts: Record<id, Layout>, media: Record<id, Media> }
Slide  { group ("Verse 1"), globalGroup ("verse"), color, children: id[],
         notes, items: Item[] }
Item   { type, style: string /* raw CSS, px on 1920x1080 */, lines?: Line[], ...40 optional fields }
Line   { align: string, text: {value, style: string}[], chords?: {pos, key}[] }
Layout { name, slides: {id, disabled?, background?, overlays?, transition?, actions?}[] }
Project{ name, parent: folderId, shows: {id, type, layout?, notes?}[] }
```
The key idea worth keeping is the split between a **pool of slides** and **layouts that order them**. Per-layout overrides (background, transition, actions) let one song have "Sunday", "Short" and "Acoustic" arrangements.

### 2.4 Persistence
- `Documents/FreeShow/Shows/<show name>.show` (one JSON file per show), `Bibles/<name>.fsb`, plus electron-store JSON files for settings, projects, templates, overlays, stage, history (`src/electron/data/store.ts:30-53`).
- Save is all-or-nothing: the UI clones every store into one IPC message, main diffs and rewrites changed files with plain `writeFileSync` (not atomic). Autosave every 15 minutes.
- Undo is snapshot-based (full deep clones of old/new data), capped at 75 entries, persisted to `history.json`.
- Global state is 269 flat Svelte stores in one file (`src/frontend/stores.ts`).
- Cloud sync zips the data folder; merge is newest-modified-wins per entity, with a tombstone ledger for deletes and no conflict UI.

### 2.5 Network
| Port | Server | Auth |
|---|---|---|
| 5505 / 5506 | Control API (Socket.IO, REST, OSC/UDP) | optional single password, off by default |
| 5510 | Remote (browser) | optional plaintext password |
| 5511 | Stage display (browser) | optional per-layout password |
| 5512 | Controller (browser) | none |
| 5513 | Output stream (base64 frames with ack backpressure) | none |
| 5501 | Planning Center OAuth callback | - |

- All inputs (API, OSC, MIDI, slide actions, timeline, calendar, remote) call **one shared action registry**, `API_ACTIONS` (`src/frontend/components/actions/api.ts:214-442`), with about 100 actions such as `next_slide`, `clear_all`, `start_scripture`, `change_variable`, `run_action`, and `get_*` getters.
- The main process only relays: actions execute in the UI renderer. Getters are answered by polling every 50 ms for up to 10 s.

### 2.6 AI pipeline
- **Speech-to-text:** NVIDIA Nemotron 3.5 streaming ASR (0.6B, int8 ONNX, about 682 MB, around 40 languages) via `sherpa-onnx-node` on CPU (2 threads), Silero VAD, in an Electron utility process with a 60 s watchdog. Mic is captured raw at 16 kHz mono with browser processing disabled (`src/electron/ai/stt/`, `src/frontend/ai/stt/stt.ts`).
- **Scripture detection** (`src/frontend/ai/scripture/`):
  1. Normalise: mishearing table (palm → psalm), number words in 8 languages, 10 regex rules for spoken references ("verse 16 of John chapter 3", "the 23rd psalm").
  2. Reference match validated against real chapter/verse counts.
  3. Quote match: inverted index over all verses, IDF weighting, recency decay, phrase bonuses, a boost for the next three verses while someone is reading, an ambiguity penalty.
  4. LLM fallback (OpenAI, Anthropic, Google, Ollama) only when matching fails, with a strict anti-hallucination JSON prompt.
  5. Auto-present above a confidence threshold, but never within 30 s of a manual operator change. Otherwise a suggestion toast.
- **Unfinished:** live translation ("interpretation mode" is WIP), auto-lyrics is a TODO, lyrics/quote/announcement classifications are discarded, no semantic (paraphrase) matching, and scripture detection does not work with API Bibles.

---

## 3. Keep vs avoid

| Keep (re-implement the idea) | Avoid (do it differently) |
|---|---|
| Slide pool + layouts (arrangements) | Styles as raw CSS strings in 1920x1080 px: use typed style objects and normalised 0..1 coordinates |
| Global groups with colours | Templates *copied into* slides: use live inheritance (theme ref + per-field overrides) |
| Chords stored as character offsets per line | `Item` with 40+ optional fields: use a discriminated union per item type |
| One file per show + rebuildable search index | Show name as filename: use the id |
| Project items as typed references with overrides | Non-atomic writes that delete or truncate unreadable files: write temp + fsync + rename, keep backups |
| Template-driven scripture with placeholder tokens | Snapshot undo persisted to disk: use command/patch history per document |
| One action registry shared by every input | 269 flat global stores: use a domain store plus a separate live-state store |
| mDNS discovery, frame streaming with ack backpressure, expiring subscriptions | Each output mirroring the whole app state over 40 channels: send one versioned, fully resolved render state per output |
| Fixed design resolution + transform scaling on stage clients | Business logic in the UI renderer (API dies with the UI): run an engine in a headless process |
| Two-tier AI (deterministic first, LLM fallback), back-off after manual change | Unauthenticated stage/controller ports that can run any action, `cors: *`, GET mutations, plaintext passwords |
| Hash-pinned model downloads, STT in a separate process with a watchdog | Video sync driven by the UI window's audio elements: use a dedicated media clock in the engine |
| Quick-search palette, layered clear keys | Many modes, 64 popups, abstract AI settings |

---

## 4. Recommended architecture for your app

### 4.1 Stack
**Recommendation: Electron + TypeScript for the desktop operator app, Flutter for the companion mobile apps.**

- Electron is the only stack where every hard part is already proven in production by FreeShow: multi-display output windows, GPU offscreen capture for NDI/DeckLink, hardware video decode on all three OSes, and Node addons for NDI (`grandiose`), OMT and DeckLink (`macadam`). Text rendering with HTML/CSS is also the easiest way to get beautiful lyric typography.
- Flutter desktop is tempting given your Flutter experience, but multi-window output, offscreen frame capture to NDI, and DeckLink bindings would all be custom native work. Use Flutter where it shines: the **remote control, stage display and audience apps** on phones and tablets, talking to the desktop engine over the network protocol.
- UI framework inside Electron: React or Svelte. Either works; pick the one you will write fastest.
- Tauri is not recommended: system webviews differ per OS, and Linux (WebKitGTK) video and multi-window support is weak.

### 4.2 Process model
```
+------------------ Engine (Electron utility process, headless) ------------------+
|  Document store   Live state   Command registry   Media clock   Network server |
|  (SQLite index +  (per-output  (every input maps  (master time  (one port,    |
|   file per doc)    render state) to one command)   for videos)   WS + REST)    |
+----------+---------------------------+----------------------------+-------------+
           | typed IPC                  | RenderState{seq,...}        | WS/OSC/MIDI
   Operator UI window            Output windows (dumb)          Phones, Stream Deck,
   (React/Svelte)                 + offscreen capture -> NDI     stage screens, API
```
- The **engine** owns all state and logic. The operator UI is just another client, so the API, remotes and outputs keep working if the UI reloads.
- **Outputs are dumb renderers.** Each receives one self-contained, versioned `RenderState` (fully resolved: text runs, styles, media paths, transition), renders it, and acks the `seq`. No output needs the show library.
- **Media clock** lives in the engine. Outputs follow it; one output can be designated audio master.

### 4.3 Data model sketch
```ts
type Id = string

interface Song {
  id: Id; title: string
  meta: { authors: string[]; copyright?: string; ccli?: string; key?: string; tempo?: number }
  sections: Record<Id, Section>            // slide pool
  arrangements: Arrangement[]              // ordered references into sections
  themeId?: Id
}
interface Section { id: Id; kind: SectionKind; label: string; slides: SlideContent[] }
enum SectionKind { verse, chorus, preChorus, bridge, tag, intro, outro, other }  // order = display order
interface SlideContent { lines: TextLine[]; notes?: string; translations?: Record<LangCode, TextLine[]> }
interface TextLine { text: string; chords: { offset: number; chord: string }[] }

interface Theme {                                  // inherited live, never copied
  id: Id; name: string
  boxes: Record<BoxRole, BoxStyle>                // main, secondaryLanguage, reference, ...
  background?: MediaRef
}
interface BoxStyle { frame: Rect01; font: FontSpec; align: Align; fit: FitMode; shadow?: Shadow; outline?: Outline }

type ServiceItem =
  | { type: 'song'; songId: Id; arrangementId?: Id; themeOverride?: Id }
  | { type: 'scripture'; passage: PassageRef; translations: string[] }
  | { type: 'media'; media: MediaRef }
  | { type: 'presentation'; fileRef: string }
  | { type: 'section'; title: string }
```
Notable choices: `translations` on every slide (see section 5.1), normalised coordinates (`Rect01`), themes referenced not copied, enum order drives display order, discriminated unions everywhere.

Storage: one JSON file per document named by id, written atomically, plus a SQLite index (titles, lyrics full-text search, usage history for CCLI reporting). Undo is a command log per open document.

### 4.4 Network and security
- **One port**, HTTPS with a self-signed cert pinned on pairing, plus plain WebSocket only on localhost.
- **Device pairing**: a phone scans a QR code shown in the app, gets a per-device token with a **role** (Operator, Stage viewer, Audience, Observer). Every command checks role. Tokens are revocable from a "Connected devices" list.
- Typed protocol (`{type, seq, payload}` with a shared TypeScript/JSON schema that also generates Dart models for the Flutter apps).
- REST is read-mostly; mutations only via POST with token. No `cors: *`.
- OSC and MIDI map to the same command registry (OSC gated by an allowlist of source IPs).
- mDNS advertisement for zero-config discovery.

---

## 5. Custom features (where you can beat everyone)

Ranked by value versus effort. Items marked **(research)** carry real technical risk.

### 5.1 Bilingual and multilingual services (strong differentiator, especially for East Africa)
- Every slide can carry translations (e.g. English + Swahili). Themes have a `secondaryLanguage` box, so dual-language lyrics and scripture render automatically, side by side or stacked.
- Scripture: show two translations in two languages in one click (e.g. NIV + Biblia Habari Njema), with long-verse splitting that keeps both languages aligned.
- **Live sermon subtitles and translation**: STT on the preacher, translated live (English ↔ Swahili and others), shown as lower-third captions on a chosen output or on phones. FreeShow has this only as an unfinished WIP. **Deferred: no Swahili speech or translation models for now (decided 2026-11-05). Live subtitles start English-only; see section 10.1.**

### 5.2 Audience companion (phones in the pews)
- Attendees scan a QR on screen and open a web page (no install) that shows the current lyrics or scripture, in **their chosen language**, with adjustable font size for accessibility.
- Sermon notes and fill-in-the-blank outlines pushed live; "save this verse" to their phone.
- A giving slide with M-Pesa Paybill/Till details or QR (display only; no payment handling in the app).

### 5.3 Smarter AI scripture assistant
- Keep FreeShow's two-tier design (rules first, LLM fallback) and the "back off after manual change" rule.
- Add **semantic paraphrase matching**: a small local embedding model over every verse so "God so loved the world that he gave his only son" style paraphrases and topical mentions resolve to verses.
- Replace toasts with a **suggestion lane** next to Preview, each card stating *why* ("heard 'John 3:16'" vs "matched by wording, 82%"), one click or one key to send live.
- Works with API Bibles too (cache verses locally on first use).

### 5.4 Volunteer mode
- A locked-down operator screen: only the service order, Preview and Live, big Next/Previous, and one clear button that shows exactly what it will clear. Admin features hidden behind a PIN.
- "Rehearsal" mode that runs the whole service off-air so a new volunteer can practice.

### 5.5 Reliability for real-world conditions
- Atomic saves and crash recovery that restores the exact live state (which slide on which screen) after a crash or power cut.
- Runs well on modest hardware: CPU-only AI, video decode on GPU, a "lite outputs" mode.
- Full offline operation; cloud is optional.

### 5.6 Planning and integrations
- **Two-way** Planning Center Live (FreeShow and ProPresenter only follow; neither drives PCO).
- Usage logging for CCLI copyright reports (export, since the SongSelect API is closed to new partners).
- Import from ProPresenter, EasyWorship, OpenLP, FreeShow, OpenLyrics, ChordPro on day one, so churches can switch in minutes.

### 5.7 Lyrics that follow the band **(research)**
- Advance lyric slides automatically by listening to the worship leader (STT on singing is far less accurate than on speech) or by following a click track / MultiTracks timecode. Ship timecode first; treat singing recognition as an experiment.

---

## 6. Roadmap

| Phase | Scope | Goal |
|---|---|---|
| **0. Spikes** (2-3 wks) | Electron engine process + 2 output windows driven by `RenderState`; one NDI output via offscreen capture; video sync with engine clock | Prove the hard technical core early |
| **1. MVP** | Songs (sections, arrangements, chords), scripture with 2 public-domain translations (KJV, WEB) + one openly licensed Swahili Bible (Neno 2015, CC BY-SA; no complete public-domain Swahili Bible exists, see section 10.2), themes, service order, Preview/Live, 2+ outputs, stage display, importers (OpenLyrics, ChordPro, txt, ProPresenter 7, EasyWorship) | A church can run a full Sunday service |
| **2. Network** | Device pairing, Flutter remote + stage apps, audience companion web page, control API + Companion module | Phones and Stream Deck |
| **3. Media and broadcast** | Video backgrounds, audio playlists, NDI/OMT out, DeckLink, recording/streaming, keyed lower thirds | Production teams |
| **4. AI** | STT (English and other Nemotron languages only; no Swahili models for now), scripture detection, suggestion lane, live subtitles, semantic matching | The headline differentiator |
| **5. Cloud** | Multi-machine sync with real conflict handling, Planning Center two-way | Multi-campus churches |

---

## 7. Legal and licensing checklist
- **GPL**: do not copy FreeShow code unless your app is also GPL-3.0. Decide early whether you are open source (you could then reuse FreeShow code freely) or commercial closed source (clean-room only).
- **Bibles**: KJV, ASV, WEB and BSB are public domain and can be bundled. NIV, ESV, NLT, NKJV need publisher licences; API.Bible does not cover NIV commercially and has display limits. Swahili: Neno and the Swahili ULB are CC BY-SA 4.0 and can ship as separate data files; SUV, SRUV and Biblia Habari Njema need a licence from the Bible Societies of Kenya and Tanzania (section 10.2).
- **Song lyrics**: churches need their own CCLI licence; the app should record usage for reporting. The SongSelect API is not open to new partners, so support importing SongSelect `.usr`/`.txt` exports instead.
- **NDI SDK**: royalty-free standard SDK, but your EULA must include NDI's terms. OMT (MIT) is a free alternative.
- **ProPresenter/EasyWorship**: importing their file formats for interoperability is common practice (FreeShow, OpenLP and Quelea all do it). Their EULAs forbid reverse engineering the apps themselves.

---

## 8. Market context (from the ProPresenter research)
- ProPresenter is now subscription-only: $289/yr per seat, $29/mo monthly, Bibles sold separately per machine. Common complaints: cost, Windows instability, complexity for volunteers, one-way Planning Center sync.
- Its `.pro` format is protobuf (`rv.data` package); community schemas at `github.com/greyshirtguy/ProPresenter7-Proto` (MIT) make import straightforward.
- Its official REST API (OpenAPI at `openapi.propresenter.com`) is a good reference for which control endpoints a production team expects.

---

## 9. Decisions you need to make
1. **Open source or commercial?** This decides whether FreeShow code can be reused or must be clean-room.
2. **Target market**: Kenyan/East African churches first (bilingual, low-spec hardware, M-Pesa, Swahili Bibles) or global?
3. **Desktop stack**: Electron (recommended) or Flutter desktop (your strength, more native work on outputs).
4. **Pricing**: free core + paid AI/cloud, one-time licence, or donation-based? (Subscription fatigue is ProPresenter's biggest complaint.)

## Appendix: FreeShow files worth reading
| Topic | Files |
|---|---|
| Output windows | `src/electron/output/helpers/OutputLifecycle.ts`, `OutputSend.ts`, `src/frontend/components/output/Output.svelte` |
| Capture/NDI | `src/electron/capture/`, `src/electron/ndi/ndiWorker.ts` |
| Video sync | `src/frontend/media/video/videoSync.ts`, `videoPlayer.ts` |
| Data types | `src/types/Show.ts`, `Projects.ts`, `Stage.ts`, `Output.ts` |
| Scripture | `src/frontend/components/drawer/bible/scripture.ts` |
| Importers | `src/frontend/converters/`, `src/electron/data/import.ts` |
| Action registry | `src/frontend/components/actions/api.ts` |
| Servers | `src/electron/servers.ts`, `src/electron/utils/api.ts` |
| Planning Center | `src/electron/contentProviders/planningCenter/` |
| AI STT | `src/electron/ai/stt/`, `src/electron/ai/setup/models/nemotron.ts` |
| AI scripture | `src/frontend/ai/scripture/`, `src/frontend/ai/manager/AiManager.ts` |

---

## 10. Follow-up research (2026-11-05): Swahili speech and Swahili Bibles

### 10.1 Swahili speech-to-text and translation

> **Decision (2026-11-05): no Swahili models are included for now.** The app ships with FreeShow-style English speech recognition only. This section is kept as reference for when Swahili is revisited; nothing in it is in the current plan.

**FreeShow's model cannot do Swahili.** Nemotron 3.5 ASR Streaming supports 40 locales across three tiers, and Swahili is in none of them. It also only transcribes; it does not translate. Copying FreeShow's AI pipeline as-is would give you English-only sermon detection.

| Option | Swahili quality (reported) | Licence | Runs on CPU offline | Notes |
|---|---|---|---|---|
| Whisper large-v3-turbo (OpenAI) | No clean published Swahili number found; third-party claims of 10-20%+ WER are unsourced | MIT | Yes, via sherpa-onnx (int8), but **not streaming**: transcribe in short chunks | 809M params; the base all fine-tunes below start from |
| Paza (Microsoft, Whisper turbo fine-tune) | Swahili, Kikuyu, Luo, Kalenjin, Maasai, Somali; figures only in charts | MIT | Needs ONNX export (unverified) | Card says research release, not for production without testing |
| Sauti ASR (msingiai, Paza fine-tune) | 13.72% WER, 3.88% CER on 500 Kenyan Swahili samples (self-reported) | "other", unclear | Needs ONNX export (unverified) | Card says weaker on Swahili/English code-switching |
| Omnilingual ASR (Meta) | 1,600+ languages, CER under 10 for 78% of them; no Swahili-specific figure found | Apache-2.0 | ONNX claimed by third parties, not verified | Worth benchmarking |

Translation (for live subtitles): NLLB-200 3.3B was still the strongest open English↔Swahili model in a 2024 comparison, ahead of 8B-class LLMs, especially for English→Swahili. Note NLLB's weights are CC BY-NC (non-commercial), which matters for a paid app. TranslateGemma and small Swahili Gemma fine-tunes are lighter alternatives with commercial-friendly terms but no independent Swahili scores found.

**What this means for the design:**
- If revisited, plan a pluggable STT engine: Nemotron (streaming) for English and other supported languages, a Whisper-family model in short chunks (2-5 s) for Swahili. Chunked Whisper adds about 1-3 s of delay, fine for scripture suggestions and acceptable for subtitles.
- Kenyan sermons mix English and Swahili mid-sentence, and every model above is weakest there. Scripture *detection* tolerates this better than subtitles, because references ("Yohana 3:16", "John three sixteen") are short and can be matched by rules in both languages. Add Swahili book names and Swahili number words to the normaliser.
- Before committing, record 30-60 minutes of real Kenyan sermons and measure WER for Whisper turbo, Paza, Sauti and Omnilingual on that audio. Public benchmarks do not reflect church audio (reverb, PA systems, code-switching).
- Keep the STT layer behind an interface now, so a Swahili model can be added later without reworking the pipeline.

### 10.2 Swahili Bible licensing

| Translation | Holder | Licence | Can a commercial app bundle it? |
|---|---|---|---|
| Neno: Bibilia Takatifu 2015 (Open Kiswahili Contemporary, eBible `swhonen`) | Biblica | CC BY-SA 4.0 | Likely yes, as an unmodified separate data file with the copyright notice. Share-alike covers changes to the text, not your app |
| Neno: Maandiko Matakatifu 2024 (`swhonmm`) | Biblica | CC BY-SA 4.0 + trademark terms | Same, and keep the "Biblica®" mark intact unless you modify it |
| Swahili Unlocked Literal Bible (`swhulb`) | Door43 | CC BY-SA 4.0 | Same as Neno; a literal translation, less used in services |
| Krapf 1850 (`swh1850`) | Public domain (USA, per eBible) | Public domain | Yes, but NT portions only in an old dialect: not usable as a main Bible |
| Swahili Union Version (SUV, 1952/1997) | Bible Societies of Kenya and Tanzania | All rights reserved | **No, not without a licence** |
| Swahili Revised Union Version (SRUV, 2007) | Bible Societies of Kenya and Tanzania | Not stated, assume reserved | No, not without a licence |
| Biblia Habari Njema (BHN, 1996) | Bible Societies of Kenya and Tanzania | Not stated, assume reserved | No, not without a licence |

**Implications:**
- The translation most Kenyan congregations read from (SUV) is the one you cannot ship. A church that switches to your app and cannot find SUV will not stay. Contact the Bible Society of Kenya early (info@biblesociety-kenya.org, +254 020 6002827) about a software licence for SUV and BHN. It is also a possible partnership: they may want an outlet for digital distribution.
- Until then, ship Neno 2015 bundled and let churches import a Bible file they already hold rights to (OSIS, Zefania, USFM), the way FreeShow and OpenLP do. The licensing responsibility then sits with the church.
- Keep Bible text as separate data files with their notices, never mixed into code, so CC BY-SA terms stay clearly separate from your app's licence. Have a lawyer confirm this before a commercial launch; it is the common reading of CC BY-SA but not settled law in Kenya.
- The open-bibles repository lists a "Swahili Bible" as public domain without naming its source. Don't use it until its origin is known.

### 10.3 Open questions left
1. (Deferred) Measured WER on real Kenyan church audio.
2. Whether the Bible Society of Kenya licenses SUV/BHN to software makers, and at what cost.
3. (Deferred) Whether Paza, Sauti or Omnilingual export cleanly to ONNX for sherpa-onnx on CPU.
4. (Deferred) NLLB's non-commercial licence: pick a commercially licensed translation model if the app is paid.

Sources: [Nemotron 3.5 ASR model card](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b), [Paza](https://huggingface.co/microsoft/paza-whisper-large-v3-turbo), [Sauti ASR](https://huggingface.co/msingiai/sauti-asr), [Whisper](https://github.com/openai/whisper), [sherpa-onnx Whisper](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/whisper/index.html), [Omnilingual ASR](https://huggingface.co/facebook/omniASR-LLM-3B/blob/main/README.md), [EN-SW translation comparison](https://arxiv.org/html/2412.05862v4), [Swahili Gemma](https://deepmind.google/models/gemma/gemmaverse/craneai/), [eBible copyright list](https://ebible.org/Scriptures/copyright.php), [Neno 2015](https://ebible.org/swhonen/copyright.htm), [Neno 2024](https://ebible.org/swhonmm/copyright.htm), [Swahili ULB](https://ebible.org/swhulb/copyright.htm), [Krapf 1850](https://ebible.org/swh1850/copyright.htm), [SUV on Bible.com](https://www.bible.com/versions/164-suv-maandiko-matakatifu-ya-mungu-yaitwayo-biblia), [donfluids/Swahili](https://github.com/donfluids/Swahili), [Bible Society of Kenya](https://biblesociety-kenya.org/swahili-bible-translation/), [open-bibles](https://github.com/seven1m/open-bibles).

---

## 11. Additions after the FreeShow comparison (2026-11-05)

Design canvas (dark and light modes for every operator screen): https://claude.ai/artifact/SihdTNH8qWC2WKyWXESXDV

### 11.1 Importers (match FreeShow's breadth, ship in the MVP)
Churches only switch if their library comes with them, so importers move into phase 1.

| Kind | Formats |
|---|---|
| Songs (18) | ProPresenter 6/7 (.pro, .pro6, bundles), EasyWorship 2009/6/7 libraries and .ewsx, OpenLP (songs.sqlite, .osz), FreeShow (.show, .project), MediaShout, OpenSong (songs, sets), Quelea, SongBeamer (.sng), VideoPsalm, SoftProjector, EasySlides, VerseVIEW, OpenLyrics, ChordPro, SongSelect (.usr/.txt), Planning Center song library, CSV/XLSX, Word/PDF/plain text |
| Bibles (9) | Zefania, OSIS, USFM/USX, OpenSong, Beblia, MyBible/SQLite, ProPresenter `.rvbible`, EasyWorship Bibles, eBible.org downloads |
| Slides (6) | PowerPoint, Keynote, PDF, Google Slides and Canva exports (PDF/images), a folder of images |

Import rules: never overwrite silently; detect duplicates (title + first-line fuzzy match) and offer Merge / Keep both / Compare; report imported, duplicate and unreadable counts with reasons; keep the original file's metadata (CCLI number, author, key, sections, chords).

### 11.2 Service templates
- A template is an ordered list of item slots with durations, each slot either fixed content (countdown video) or a rule: "pick a song not used in 3 weeks", "follow the sermon series", "from Planning Center", "pick on the day".
- Templates carry language order (e.g. "Ibada ya Kiswahili" puts Swahili first), theme and stage layout.
- Services created from a template stay linked: editing the template updates services nobody has edited by hand; edited services keep their changes.
- Starter templates: Sunday service, Swahili service, midweek Bible study, youth night, wedding, funeral and memorial.

### 11.3 Calendar
- Month, week and list views of every service, with status: ready, needs songs or slides, no operator assigned.
- Recurrence from a template ("every Sunday at 9:00 until 27 Dec" creates the services in one step).
- Volunteer rota per service (operator, stage) and Planning Center sync shown on the service.
- Opening a service from the calendar goes straight to Present.

### 11.4 Roadmap changes
- Phase 1 (MVP) gains: all importers above, service templates, calendar month/list views.
- Phase 2 gains: volunteer rota, recurrence rules, week view.
- Still open from the comparison: an actions/triggers system (one action registry shared by API, remote, keys and timers), simple audio (crossfade and ducking presets), camera input, and more editor elements (web, table, captions). Skipped on purpose: full audio routing matrix, weather and chart elements, timecode.

#### Decision rationale
- Importers moved into the MVP because switching cost is the main barrier to adoption, and FreeShow sets the bar at about 20 formats.
- Template-linked services update only untouched services, so a template edit never silently rewrites a service someone already prepared.
