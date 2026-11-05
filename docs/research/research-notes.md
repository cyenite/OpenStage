# Church presentation software research: session notes

Recovered from the work profile session "Church presentation software research" (2026-11-05). Includes your messages, every research report the session gathered, and its final summary.

---
## Your original request

I have the following application idea: A church software for presentation. Like easyworship and propresenter. Use rea to investigate propresenter and easyworship for me to recreate an application like that, with more custom features as well

---
## Research report

## Church presentation software: open-source and newer competitors to learn from (researched 2026-11-05)

Most of this comes from reading source code: FreeShow on GitHub (HEAD, v1.6.7 / 1.6.8-beta) and OpenLP on GitLab (master, 4.0a2). Anything taken from vendor marketing or second-hand sources is marked **[unverified]**.

### 1. FreeShow
Repo: https://github.com/ChurchApps/FreeShow. Electron + Svelte + Vite, GPL-3.0, about 1.4k stars, very active.

- **Processes:** There is one Electron main process (`src/electron/`), one renderer for the main UI (`src/frontend/`), and one BrowserWindow per output (`src/electron/output/Output.ts`, `OutputHelper.ts`, `helpers/OutputLifecycle.ts`, `OutputBounds.ts`).
- **Keeping outputs in sync:** `helpers/OutputSend.ts` broadcasts each state message over IPC to every output window. It filters by output id and stamps a per-output sequence number (`RenderGroups.stamp`); each page reports back the last sequence it applied. Each window renders the show itself, so there is no shared compositor.
  - For NDI/OMT/DeckLink/streaming, a hidden offscreen "captureWindow" is captured by paint events or by polling `capturePage` (`src/electron/capture/CaptureHelper.ts`, `senderWorker.ts`).
  - Default frame rates are NDI 30, stage 20 and DeckLink 1 when unconnected; the configurable maximum is 60.
- **Video outputs:**
  - NDI: `src/electron/ndi/`, using a fork of `grandiose`.
  - OMT (Open Media Transport): `src/electron/omt/`.
  - Blackmagic: `src/electron/blackmagic/`, using the `macadam` fork.
  - RTMP and recording through ffmpeg, plus WebRTC: `src/electron/streaming/`.
  - LTC/MTC timecode: `src/electron/timecode/`. MIDI: `jzz`.
  - No Spout/Syphon (no matches anywhere in the tree).
- **Network servers** (`src/electron/servers.ts`): each is Express + Socket.IO, advertised over Bonjour (`data/bonjour.ts`).
  - Remote 5510, Stage 5511, Controller 5512, Output stream 5513.
  - The web clients live in `src/server/{remote,stage,controller,output_stream,cam}`.
- **Stage display:** Stage layouts are stored in `stage.json`. They can be shown on a network client (port 5511, which can also receive a mirror of the current output frame) or assigned to a local output window.
- **Control API** (`src/electron/utils/api.ts`): WebSocket 5505, REST 5506 and OSC, with an optional password or bearer token. Companion modules use it.
- **Storage** (`src/electron/data/store.ts`): JSON files via `electron-store`, one per show plus `projects.json`, `stage.json`, `templates.json`, `overlays.json`, `themes.json`, etc. It splits "portable" files from local cache and syncs through Google Drive or ChurchApps cloud (`src/electron/cloud/`). Bibles are stored as FreeShow JSON.
- **Bible import:** `src/electron/data/bibleDetecter.ts` sniffs FreeShow JSON, Zefania (`XMLBIBLE`), OSIS (`osisText`), OpenSong, Beblia, SoftProjector, WordProject, BibleQuote, iBible, SQLite and Access .mdb. Parsers are `src/frontend/converters/{zefaniaBible,osisBible,bebliaBible,bible}.ts`.
  - USFM: no converter was found, so likely not supported **[unverified]**.
- **Song/show import** (`src/frontend/converters/`): chordpro, easyworship, easyslides, mediashout, openlp, opensong, propresenter, quelea, softprojector, songbeamer, verseview, videopsalm, txt, csv, powerpoint, canva, plus generic XML.
  - ProPresenter 7 `.pro` is protobuf, decoded with `.proto` schemas in `public/proto/`; Pro6 XML (`RVPresentationDocument`) and JSON are also handled.
- **Integrations** (`src/electron/contentProviders/`): Planning Center (including Services "live" polling plus Pusher, in `planningCenter/live.ts`), Canva, Amazing Life, OnStage, ChurchApps.
- **AI (new in v1.6.6):**
  - Offline speech-to-text: NVIDIA Nemotron 3.5 streaming ASR (int8 ONNX via sherpa-onnx, about 682 MB, around 40 languages) with a Silero voice-activity detector. Files: `src/electron/ai/stt/`, `ai/setup/models/nemotron.ts`.
  - Spoken scripture-reference detection, handling phrasings like "verse 16 of John chapter 3", mishearings and number words: `src/frontend/ai/scripture/` (`references.ts`, `mishearings.ts`, `BibleSearchDetector.ts`).
  - LLM providers: OpenAI, Anthropic, Google, Ollama (`src/electron/ai/llm/providers/`).

### 2. OpenLP
Repo: https://gitlab.com/openlp/openlp (Python, GPL; 3.1.8 is stable, 4.0a2 tagged 2026-08). It has moved from PyQt5 to **PySide6**.

- **Processes:** A single Qt process. Each display is a `DisplayWindow` QWidget wrapping QWebEngine (`openlp/core/display/window.py`).
  - Each display loads `core/display/html/display.html` and `display.js`, which uses **reveal.js** for slides and transitions and textFit.js for auto-sizing.
  - Python drives it by injecting JS (`run_in_display`) plus a QWebChannel bridge.
- **Multiple screens:** `ScreenList` marks screens with `is_display` (`core/display/screens.py`). `core/ui/slidecontroller.py` holds `self.displays` and loops over them for every slide change. The sync model is "same command sent to N webviews".
- **Remote:**
  - HTTP is a Flask-style app served by **waitress** on port **4316** (`core/api/http/server.py`, REST at `core/api/versions/v2/{controller,core,plugins,service}.py`).
  - WebSockets on port **4317** push state (`core/api/websockets.py`, `websocketspoll.py`).
  - The Angular web remote is downloaded separately from get.openlp.org/remote (`core/api/deploy.py`).
  - The stage, chords and main views are web pages served from the same remote.
- **Storage:** SQLite via SQLAlchemy, one database per Bible and one songs database. Services are `.osz` zip files containing `service_data.osj` (JSON) plus media (`core/ui/servicemanager.py`).
- **Bible import** (`plugins/bibles/lib/importers/`): csv, OpenSong, **OSIS, SWORD, Zefania**, WordProject, plus downloading from web sites (`http.py`, which scrapes BibleGateway/Crosswalk-style sites). No USFM importer.
- **Song import** (`plugins/songs/lib/importers/`, about 33 formats): openlyrics, chordpro, cclifile (SongSelect .usr/.txt), easyworship, **propresenter**, songbeamer, opensong, mediashout, videopsalm, worshipcenterpro, songshowplus, and more.
  - SongSelect: `plugins/songs/lib/songselect.py` logs into songselect.ccli.com and scrapes it through an embedded browser.
- **Plugins:** `plugins/` includes `planningcenter` and `obs_studio`.

### 3. Quelea
Repo: https://github.com/quelea-projection/Quelea (JavaFX, GPL-3.0, about 200 stars, low activity).

- Files worth reading:
  - `services/importexport/*Parser.java`: about 25 song formats, including OpenLyrics, ProPresenter, EasyWorship, Planning Center, Elevanto.
  - `windows/stage/`.
  - `server/` contains `MobileLyricsServer` (read-only lyrics to phones), `RemoteControlServer` and `AutoDetectServer`, plus an Android remote app.
  - `services/lucene` for search.

### 4. Other open projects worth a look
- **Praisenter** (JavaFX, active): https://github.com/praisenter/praisenter
- **Bible Song Pro** (presents through OBS): https://github.com/Johnbatey/bible-song-pro
- **AnchorCast** (open-source AI sermon display): https://github.com/anchorcastapp-team/anchorcastapp

### 5. Interchange formats to support
- **OpenLyrics XML:** http://openlyrics.org. Namespace `http://openlyrics.info/namespace/2009/song`; carries verses, chords and metadata. Used for export and import by OpenLP, Quelea and others. The best neutral format to use as a native song format.
- **ChordPro 6:** https://www.chordpro.org/chordpro/. Directives like `{title}`, `{soc}`, inline `[C]` chords. Supported by FreeShow and OpenLP.
- **SongSelect `.usr`:** an INI-like file (`[File]`, `Title=`, `Author=`, `Copyright=`, `Fields=` and `Words=` separated by `/t`), plus a plain `.txt` export. Reference parser: OpenLP `cclifile.py`.
- **Bibles:**
  - OSIS (SWORD/CrossWire): https://crosswire.org/osis/
  - Zefania XML: https://sourceforge.net/projects/zefania-sharp/
  - USFM/USX from Paratext and the Digital Bible Library: https://ubsicap.github.io/usfm/. Worth adding, since neither FreeShow nor OpenLP has it.
  - Bulk public-domain texts: eBible.org (https://ebible.org/download.php).
- **Bible licensing:**
  - **Public domain:** KJV (except the UK, where Crown patent applies), ASV, WEB, BSB (released to public domain in 2023), and many eBible.org texts. These can be bundled.
  - **Licensed:** NIV (Biblica), ESV (Crossway; only via its own API at https://api.esv.org with non-commercial limits), NLT, NKJV, CSB.
  - **API.Bible:** NIV commercial use is not available there and must go through Biblica; ESV is not on API.Bible; display is capped at 500 consecutive verses; attribution and FUMS tracking are required; sublicensing is forbidden. Sources: https://care.api.bible/article/394-commercial-licensing-for-the-niv and https://care.api.bible/article/396-licensing-policies-quick-reference
  - **Bible Brain (Faith Comes By Hearing):** free API key; content must stay inside the keyed app; end users must never pay **[unverified, third-party summary]**. That likely conflicts with a paid app. https://www.faithcomesbyhearing.com/bible-brain/developer-documentation
  - **Desktop presenters** like ProPresenter sell NIV/ESV per seat through direct publisher deals. Expect to negotiate those deals yourself.

### 6. Technical building blocks
- **NDI:**
  - The standard SDK is royalty-free, but redistributables must be covered by your EULA under NDI's terms, and the SDK is not open source. https://docs.ndi.video/all/developing-with-ndi/sdk/software-distribution
  - The Advanced SDK (hardware encoders, mobile) needs a vendor ID from licensing@ndi.video and is royalty-based. An old FAQ cited 5% of MSRP **[unverified/old]**.
  - **OMT** (from the vMix team, MIT, in vMix 29, Oct 2025) is a free alternative that FreeShow already ships. https://softvelum.com/2025/10/omt-open-media-transport-nimble-streamer/
- **Syphon** (macOS, BSD) and **Spout** (Windows, BSD): both share GPU textures.
  - Electron's `webPreferences.offscreen.useSharedTexture` hands out a D3D/IOSurface handle you can pass to a native addon. https://electronjs.org/docs/latest/tutorial/offscreen-rendering
  - Neither FreeShow nor OpenLP implements them, so this is an open gap.
- **DeckLink:**
  - The SDK EULA forbids redistributing the SDK itself; the headers carry a Boost-style license. FFmpeg treats it as non-free.
  - Users must install Desktop Video drivers. FreeShow uses a `macadam` fork.
- **Electron vs Tauri vs native:**
  - **Electron:** Chromium everywhere, consistent hardware decode (D3D11/VideoToolbox; VA-API on Linux needs flags), mature multi-window and offscreen capture. Costs more RAM.
  - **Tauri v2:** uses the system webview, which differs per OS (WebView2, WKWebView, WebKitGTK). WebKitGTK is weak on Linux for video and performance. Multi-webview is still unstable; fullscreen video and transparency regressions have been reported **[partly unverified, third-party wiki]**. https://v2.tauri.app/reference/webview-versions/
  - **Qt 6 (QML or QWebEngine):** strongest for exact multi-screen control; Qt Multimedia's FFmpeg backend has hardware acceleration.
  - **Flutter desktop:** multi-window support is still maturing **[uncertain]**; media_kit (libmpv) gives hardware decode.
  - **Recommended pattern from both projects:** make outputs dumb renderers driven by a sequenced state broadcast. Render once offscreen and fan out when you need NDI or capture.
- **CCLI SongSelect API:**
  - Not open to the public. OAuth2/OIDC (PKCE) through identityservices.ccli.com, an APIM subscription key, rate limits of 100 calls per 10 s.
  - Reportedly the partner program is retired with no new partners; contact partners@ccli.com **[unverified, from a third-party planning doc]**. https://git2.stadtmission-butzbach.de/public/pp-planer/raw/branch/master/CCLI-API.md
  - The ToS bans automated retrieval, which puts OpenLP-style scraping in a legal gray area.
  - CCLI usage reporting (Copyright Reporting) is a separate integration; Planning Center and Elvanto have it.
- **Planning Center API:** https://developer.planning.center/docs
  - JSON:API with OAuth2 (needed for multi-church apps) or personal access tokens.
  - Services resources: service_types, plans, items, `plans/{id}/live` (Live Controller).
  - Webhook `services.v2.events.plan.live.updated`. FreeShow subscribes to live state via Pusher.

### 7. What the alternatives have that ProPresenter/EasyWorship lack
- **FreeShow:** free and cross-platform including Linux; offline AI speech-to-text with automatic scripture display; OMT; a REST/WebSocket/OSC API; Canva and PCO import; importers for nearly every competitor's format; browser-based stage, remote and camera clients.
- **OpenLP:** the broadest set of legacy importers; OBS plugin; open REST API.
- **Holyrics** (Brazil, free):
  - User JavaScript "Modules" and JS triggers, an API server with per-token permissions, a Bitfocus Companion module, and a JS hook for PCO import (v2.25, Mar 2025). https://holyrics.com.br/changelog
- **WorshipTools Presenter** (formerly Worship Extreme): free with no watermark, cloud sync, auto lyric slides via "Prime", Presenter 2026 beta. https://worshiptools.com/presenter
- **VideoPsalm:** free Windows app with a large Bible download catalog **[few current details found]**.
- **Proclaim** (Faithlife): cloud-first presentations, remote and Signals, Logos integration; "Proclaim 4" is mentioned with no detailed notes found. https://proclaim.faithlife.com/features
- **ChurchTools:** a German church-management system with a songs module that exports to presenters. It is not a presenter itself **[uncertain]**.
- **AI-native newcomers, 2025-26** (vendor claims, **[unverified]**): Creenly (on-device speech recognition, semantic verse search), Pewbeam, WayPresenter, Loghema, SmartVerses (an add-on alongside ProPresenter that catches paraphrased references; cloud features send audio to third-party providers). https://www.smartverses.app/propresenter-alternatives
- **Recurring requests in FreeShow's issue tracker:**
  - Blackmagic output (#124), transitions rework (#2169), Chromecast output (#165).
  - Camera feed on the stage display (#1131), single multiview output (#2235).
  - SongSelect import (#329, #572), multi-Bible projection (#236), auto-splitting long verses (#1305), a Bible study engine with Strong's (#3366).
  - AI: live translation via speech-to-text pushed in through the REST API (#3227), AI scripture auto display (#3733, shipped in 1.6.6), AI background removal (#3455).
  - The OpenLP GitLab issues API needed auth, so its tracker was not surveyed.
- **AI areas still open for a newcomer:**
  - Live multilingual subtitles: today mostly third-party tools such as Glossa, OneAccord and Wordly.
  - Automatic lyric-line sync to audio.
  - Local, private speech-to-text, which FreeShow has proven is feasible on CPU.
  - Paraphrase or semantic verse matching instead of regex references alone.

---
## Research report

## ProPresenter research report (as of 2026-11-05)

**Version status.** Renewed Vision dropped the "7" when subscriptions launched: 7.16.x was followed by version 17 (https://renewedvision.com/blog/propresenter-is-now-available-as-a-subscription). Builds are labelled like `17_285212704` (https://ideas.patchmypc.com/ideas/PATCHMYPC-I-4535).
- **21.3** came out 2026-03-18 and **21.4 / 21.4.2** on 2026-07-01.
- **22** (build 369098928) went into public beta on 2026-11-04. Its additions:
  - Cloud workspace sync
  - Text build animations
  - ProContent "Stickers"
  - Amazing curriculum import
  - HLS stream actions
  - Export to ProDisplay
  - "Disable Screens"
  - macOS 27 support
  - macOS 14 as the minimum
- Source for the release history: https://renewedvision.com/propresenter/download. Uncertain: that page labels every listed build "BETA", so which build is the current stable one is unclear.

### 1. Feature inventory
Main sources: https://renewedvision.com/propresenter/all-features and https://renewedvision.com/propresenter

- **Library and playlists**
  - Multiple Libraries. The default lives in `~/Documents/ProPresenter #`, and media/audio bins are shared across libraries (https://support.renewedvision.com/hc/en-us/articles/360011693974).
  - Playlists with headers, Playlist Templates (7.10), Quick Search across libraries plus SongSelect and MultiTracks, and Calendar scheduling.
  - Announcements: a separate presentation layer running at the same time as the main one.
- **Slide editor**
  - Up to 8 content layers. Objects can be text, shapes (rounded rect, arrow, polygon, star, bezier path) or media, plus video inputs as objects.
  - Fills (gradient, media, cut-out), stroke, shadow, feather, blur/invert effects, text line masks, scrolling text, and builds (on click, with or after previous).
  - Data links: timers, clocks, RSS, file feed, ticker, CCLI text, group name/colour, slide text, PCO Live, chord chart and others (enumerated in `slide.proto`, see section 2).
  - Quick Edit, a Reflow editor, PowerPoint/Keynote import, and Timeline (slides, media and actions on a time track, with timecode).
- **Themes:** a theme is a folder holding a Theme protobuf plus `Assets/`. Updating it restyles content in one click (https://git2.stadtmission-butzbach.de/public/propresenter7-php-lib/src/commit/4d10db4f17bad0ec2c1cc02ba727cc86866bb422/doc/INDEX.md).
- **Bible**
  - In-app store selling 130+ translations in 25+ languages. Paid Bibles are licensed per machine, and internet is needed to buy and install them (https://support.renewedvision.com/hc/en-us/articles/360041347594-Using-Bibles-in-ProPresenter).
  - Multi-translation slides via templates (https://renewedvision.com/blog/?p=214339).
- **Songs**
  - SongSelect import with automatic CCLI usage reporting.
  - Groups (Verse, Chorus and so on), and Arrangements (ordered, repeatable group lists).
  - Chord charts / ChordPro, music key and transposition, and a MultiTracks import (lyrics, charts, MIDI cues).
- **Media**
  - Video/Image and Audio bins with playlists, playback markers, video inputs (SDI via Blackmagic DeckLink/UltraStudio, NDI).
  - Outputs over NDI, SDI, Syphon (Mac) and alpha key/fill.
  - Multi-camera capture: recording and streaming, added in 7.1 (https://www.avnetwork.com/news/renewed-vision-adds-live-streaming-recording-to-propresenter-with-71-update). Resi resilient streaming is also offered.
- **Outputs**
  - Up to 16 independent audience and stage screens, according to current release notes. The marketing page still says 8, so treat the number as uncertain.
  - Looks (per-output layer routing), Masks, Props (persistent overlays), Messages, Stage Messages, Timers and Clocks (countdown, elapsed, time of day, video countdown), Edge Blend, Operator Views (multiview) and test patterns.
- **Stage:** flexible stage layouts showing current/next slide, notes, timers, chord charts and PCO Live.
- **Planning Center Services**
  - Login under Preferences > Services. Adds a plan as a linked playlist, auto-checks for updates, downloads attached media, and can upload presentations back.
  - PCO Live on the stage display, but the current item is not synced in either direction (https://support.renewedvision.com/hc/en-us/articles/4408670102419-Using-Planning-Center-with-ProPresenter, https://planningcenter.com/integrations/propresenter).
- **Remote apps**
  - The new "ProPresenter Remote" is on iOS and Android (https://apps.apple.com/app/id6743939528). The older app is now "ProPresenter Remote Classic" (https://support.renewedvision.com/hc/en-us/articles/43163349444755).
  - Controller and Observer roles, each with its own password.
  - A separate Stage Display app, which lacks PCO Live (https://support.renewedvision.com/hc/en-us/articles/360011700614).
  - A browser-based "ProPresenter Control" is mentioned only by a secondary source (uncertain).
- **Control and automation**
  - MIDI and DMX in, timecode follow, and Stream Deck.
  - Communications module actions: MIDI, GlobalCache, GVG100, Sony BVS (from `action.proto`).
  - Macros with collections (7.16), Slide Actions, Clear Groups and hot keys.
- **ProContent:** 50k+ assets. Subscriptions include 1,000 free assets, with unlimited access on higher tiers.
- **Multi-machine**
  - Network Link (7.8): trigger and mirror across machines on the same LAN for extra outputs and redundancy (https://support.renewedvision.com/hc/en-us/articles/4412193892627-Network-Link).
  - The older folder-based Sync tab (https://support.renewedvision.com/hc/en-us/articles/360041588774).
  - Cloud workspace sync in v22, with 50GB per subscription.

### 2. Architecture and file formats
**Tech stack**
- **macOS:** Swift and Objective-C on AppKit/SwiftUI, with XPC and C/C++, and Metal/OpenGL graphics, according to Renewed Vision job postings (https://builtin.com/job/macos-software-engineer/9146317).
- **Windows:** a native 64-bit rewrite that shares many libraries and code with the Mac version (https://renewedvision.com/blog/propresenter-7-from-renewed-vision-now-available). A DirectX rendering option arrived as a beta in 7.14.
  - The Windows UI framework (Qt, WPF or other) is **unconfirmed**; this is the main thing to settle with static analysis.
  - Default install path is `C:\Program Files\Renewed Vision\ProPresenter`.
- **Web:** web roles ask for React, Next.js and TypeScript, probably for cloud, ProDisplay and Control (inference).
- **Shared core:** proto names such as `proCore`, `workspace.calls`, `workspace.entities.remote` and `document.notifications` suggest a shared C++ core with protobuf RPC for cloud sync. This is inference.

**File formats**
- All documents and configuration files are proto3 binaries in package `rv.data`; ProPresenter 6 used XML.
- The community repo greyshirtguy/ProPresenter7-Proto (MIT) holds auto-generated `.proto` files, currently matching version 21.4 build 352583705, about 160 files (https://github.com/greyshirtguy/ProPresenter7-Proto/tree/main/autogen-proto). It recommends `protodump` for extracting them from the binary.

Key messages:
- **`Presentation`**
  - Identity and metadata: uuid, name, category, notes, background.
  - `ccli` (author, title, publisher, song_number, ...) and `bible_reference` (book, chapter and verse ranges, translation).
  - Song structure: `repeated Arrangement{uuid,name,repeated group_identifiers}`, `repeated CueGroup{Group group, repeated cue_identifiers}` and `repeated Cue cues`.
  - Other fields: `Timeline{cues, duration, loop, timecode_enable/offset}`, transition, music key, multi_tracks_licensing, and `chord_chart` URL.
- **`Cue`:** uuid, name, completion target and action (auto-advance), hot_key, and `repeated Action actions`.
- **`Action`**
  - `ActionType` enum: slide, media (foreground/background), timer, communication, clear, prop, mask, message, stage layout, multiscreen, audience look, audio input, bin playlists, slide destination, macro, clear group, capture, and library playlist.
  - Layers: background, foreground, fill, input.
- **`PresentationSlide`:** `base_slide` (a `Slide`) plus `Notes` (RTF), chord_chart and transition.
- **`Slide.Element`:** a `Graphics.Element` plus builds and DataLinks.
- **`Graphics.Element`:** uuid, name, bounds (Rect), rotation, opacity, locked, path, fill, stroke, shadow, feather, flip, and `text`. Text is stored as **RTF bytes** (`rtf_data`) plus attributes and ChordPro.
- **Playlist:** `PlaylistDocument{type, root_node Playlist, tags, live_video_playlist, downloads_playlist}`.
- **Archives:** `.proplaylist` is a ZIP64 archive embedding presentations and media (it has ZIP64 quirks); `.probundle` is a ZIP of one presentation plus its media (php-lib docs above).
- **Global config files:** Macros, Labels, Groups, ClearGroups, CCLI, Messages, Timers, Stage, Workspace, Props, TestPatterns, Calendar and KeyMappings. CommunicationDevices is JSON.
- Default Library: `~/Documents/ProPresenter #`. "Support Files" can be stored per-user, for all users, or in a custom location. The exact AppData and Application Support paths are **uncertain**.

### 3. Network and remote APIs
**Official REST API**
- OpenAPI 3.0.2, "ProPresenter API v1.0", added in 7.9. The spec is at https://openapi.propresenter.com/swagger.json (Swagger UI at https://openapi.propresenter.com/).
- It serves on `http://host:{port}/` with the port set in Settings > Network; the spec's default is 50001 and real ports vary.
- 194 paths, with **no authentication** declared in the spec.
- Endpoint groups: Announcement, Audio, Capture, Clear, Global Groups, Library, Looks, Macro, Masks, Media, Message, Miscellaneous, Playlist (30 endpoints), Presentation (31, including `chord_chart`, `slide_index`, thumbnails), Prop, Stage (layouts, screens, layout_map, message), Status, Theme, Timer, Transport, Trigger and Video Input.
- Streaming uses chunked HTTP: `?chunked=true` on endpoints such as `.../updates`. `POST /v1/status/updates` multiplexes many streams over one connection to work around browser connection limits.

**TCP/IP variant** (https://support.renewedvision.com/hc/en-us/articles/31606866768147-TCP-IP-Connections-with-ProPresenter-API)
- One JSON object per CRLF-terminated line, of the form `{"url":"v1/...","method":"PUT","body":{...},"chunked":true}`.
- Replies are `{url, data | error}`.
- No authentication is documented.

**Legacy WebSocket protocol** (reverse-engineered, still present; https://jeffmikels.github.io/ProPresenter-API/Pro7/)
- `ws://host:port/remote` and `/stagedisplay`.
- Authenticate with `{"action":"authenticate","protocol":701,"password":...}`.
- Actions include presentationRequest/TriggerIndex, playlistRequestAll, clock*, message*, macrosTrigger, looksTrigger and clear*.
- Pro7 is strict about WebSocket headers, and malformed messages can crash it.

**Network Link**
- Peer to peer over the LAN: enable Link in each machine's Network tab and add peers by IP and port.
- Schema in `networklink.proto`: `NetworkLinkDocument{group_info, enabled}`, and status pairs giving each peer's IP, port, platform and version.
- The `proApiV1Link.proto` file suggests Link reuses the v1 API messages (inference).

### 4. Installers (download page: https://renewedvision.com/propresenter/download)
| Build | macOS | Windows |
|---|---|---|
| 22 (beta) | `https://renewedvision.com/downloads/propresenter/mac/ProPresenter_22_369098928.zip`, about 431 MB | `https://renewedvision.com/downloads/propresenter/win/ProPresenter_22_369098928-Setup.exe`, about 153 MB |
| 21.4 / 21.4.2 | `.../mac/ProPresenter_21.4_352583705.zip`, about 369 MB | `.../win/ProPresenter_21.4.2_352584193-Setup.exe`, about 115 MB |

- Sizes come from HEAD requests only; nothing was downloaded.
- macOS ships as a **.zip, not a .dmg**.
- Older builds back to 7.0 are linked from the same page.
- The page shows a lead form (name, email, industry and so on) with a "Download only" button. The direct URLs returned HTTP 200 without the form or a login.
- The EULA is presumably accepted in the installer or on first launch (unverified).
- The Terms & Conditions (effective 2025-12-04) forbid attempts to "reverse engineer, disassemble, decompile, decode, adapt or otherwise attempt to derive" source code, and point to a separate Software and Services License Agreement that I could not locate (https://renewedvision.com/legal/terms-and-conditions). Get legal advice on interoperability exemptions in your jurisdiction.
- Minimum OS is macOS 13.5 (14 for v22) or Windows 10 1903. A dedicated GPU is recommended above 4 HD outputs (https://support.renewedvision.com/hc/en-us/articles/360042186713).

### 5. Pricing and complaints
**Pricing**
- Subscription only for new users: $289/yr per seat ($24.08/mo billed annually), or $29/mo monthly.
- Campus is about $59/mo or $649/yr. Enterprise starts at 11+ seats.
- 14-day trial; the free install watermarks its output.
- Migrated legacy ProPresenter+ users pay $239 or $579 (https://www.renewedvision.com/propresenter/migrate-your-license).
- Cancelling with no legacy license means losing access entirely. Seat types: Presenter (no watermark), Cloud Editor and Local (both watermarked) (https://support.renewedvision.com/hc/en-us/articles/31800299361427-ProPresenter-Subscription).
- Bibles are sold separately and licensed per machine.

**Common complaints** (Reddit was not reachable, so these come from review sites)
- **Cost and the move to subscription** hurt small churches, and there is no nonprofit tier (https://www.capterra.com/p/170172/ProPresenter/pricing/, https://learnofchrist.com/resources/propresenter).
- **Crashes and instability,** especially on Windows:
  - "Frequent crashes and instability" (Capterra).
  - Crashes when editing from another machine while live, and video breaking on Windows 11 (https://community.logos.com/discussion/comment/1380603).
  - The Windows build reads as a port with "loose ends", and is slow on minimum-spec machines (https://www.softwareadvice.com/worship/propresenter-profile/).
- **Complexity** for volunteers: "WAY to complicated for the average person" (Capterra reviews).
- **Weak PCO Live sync** (no two-way current item) and remote apps that lag the desktop features (support articles above).
- **Users are leaving for** FreeShow (free, GPL-3.0), OpenLP, WorshipTools Presenter, EasyWorship and Proclaim (https://alternativeto.net/software/propresenter/).

**Gaps a competitor could fill:** a perpetual or low-cost licence, a Windows build as stable as the Mac one, a volunteer-friendly mode, true two-way PCO sync, authenticated and documented APIs and remotes, open file formats, and Bible licensing that isn't per machine.

---
## Your message

I like the features that freeshow has. Instead of investigating the closed source apps, investigate freeshow instead.

---
## Research report

## FreeShow AI and operator UI: how it works, as input for designing your own app

All paths below are relative to `/tmp/claude-1000/-home-aaron--config-Claude-scratch-workspaces-e226bed8-d735-4c0e-93e2-dc8a12fdf4e2-53575544-6129-461f-a6ac-0a4ad9987ff5-scratch-2026-11-05-480134/3ca5cce1-e87e-4d34-b7ba-e09d4712a552/scratchpad/src/FreeShow`. I only read the source; nothing was run or installed.

### 1. Speech-to-text pipeline
- **Model:** NVIDIA Nemotron 3.5, a streaming speech model (0.6b parameters, 1120 ms chunks, int8 ONNX files). It is multilingual, covering about 40 languages. The authors picked it over the English-only model after testing on 19 sermon clips (`src/electron/ai/setup/models/nemotron.ts:314-326`). The download is about 682 MB.
- **Runtime:** the native `sherpa-onnx-node` library, run on the CPU only (2 threads) with greedy decoding (`src/electron/ai/stt/models/nemotronWorker.ts:65-83`). There is no GPU path, and Intel Macs are not supported (`nemotron.ts:338-342`).
- **Process model:** speech recognition runs in a separate Electron background process, with an in-process fallback if that can't start (`src/electron/ai/stt/models/NemotronTranscriber.ts:136-151, 193-238`). A watchdog restarts the process if it goes 60 seconds without a message (`:105-108, 284-306`).
- **Audio capture:** the browser mic API with echo cancellation, noise suppression and auto-gain all turned off, mono, 16 kHz (`src/frontend/ai/stt/stt.ts:124-162`). An audio worklet converts samples to 16-bit and sends 1600-sample (100 ms) chunks to the main process (`public/assets/stt-processor.js`). A level analyser drives the mic meter (`stt.ts:201-222`).
- **Voice activity detection:** the Silero VAD model (threshold 0.3, 0.8 s minimum silence, 30 s maximum utterance) (`nemotronWorker.ts:24-28, 89-104`). Recognizer output also counts as speech, because a music bed can keep the VAD shut (`:142-149`).
- **Streaming partials:** words are committed up to the last space. After 0.8 s of trailing silence a segment is "settled"; after 2.5 s the utterance is "closed" (`:30-32, 188-228`).
- **Clean-up:** it detects the model getting stuck repeating a phrase and resets it, with thresholds set high enough to allow a preacher's deliberate repetition (`src/electron/ai/stt/sttHelper.ts:406-457`). It computes a per-segment confidence from token probabilities (`:463-488`) and tags music annotations so they are never sent to detection (`:493-502`).
- **Setup:** model files are pinned to a fixed Hugging Face revision with SHA-256 checks, the download resumes past files that already verify, and a stamp file avoids re-hashing on every start (`nemotron.ts:354-453`, `src/electron/ai/setup/LocalModelManager.ts`). Turning AI on opens the model-manager popup (`src/frontend/ai/components/settings/SmartSettings.svelte:17-20`).
- **Languages:** there is a `language` option in the settings type, but no UI sets it (`src/types/ai/AiSettings.ts:20-31`). In practice the language is auto-detected.

### 2. Detecting scripture from speech
- **Batching the transcript:** finished text is processed straight away; partial text waits 350 ms. Each chunk is at most 120 words with 8 words of overlap, and new words are found by matching against what was sent last time (`src/frontend/ai/stt/transcript.ts:292-414`).
- **Normalisation, run on both the raw text and a corrected copy** (`src/frontend/ai/scripture/BibleSearchDetector.ts:477-528`):
  - **Mishearing table:** e.g. palm→psalm, genius→genesis, revolution→revelation, plus abbreviations (`mishearings.ts`).
  - **Number words in 8 languages:** handles compounds, German-style reversed compounds, French numbers like 76 and 99, hundreds, and range words such as "through", "à", "bis" (`numbers.ts`, `numberDictionary.ts`).
  - **10 regex rules for spoken references** (`references.ts:4-90`). Examples: "verse 16 of John chapter 3", "the 23rd psalm", single-chapter books, "Genesis 1 and 2" kept as two chapters, "John 316" split using the chapter's real verse count.
- **Reference match:** one regex built from the active Bible's book names (`BibleCacheManager.ts:230`). Results are checked against real chapter and verse counts. Confidence is 98 with a verse, and 75 for chapter only (shown as verse 1).
- **Bare verse numbers** ("verse 5") resolve against what is currently live (`BibleSearchDetector.ts:61-129`). A reader saying the next verse number also counts.
- **Matching by the verse's words (not reference):** an inverted index over every verse, with rare-word (IDF) weighting and a 0.98 per-word decay so recent words count more (`:250-474`):
  - bonus for consecutive phrase or word-pair matches, and a check of how much of the verse was covered;
  - boost for the current verse and the next three verses;
  - penalty when two different passages score close (ambiguity);
  - confidence clamped to 51-98 and dropped below 70.
  - It searches both with and without the live context and takes the fresh result if it beats the in-context one by more than 5 (`:497-519`). Other installed Bibles are searched in the background and can raise a "new translation" suggestion (`src/frontend/ai/manager/AiManager.ts:76-110`). This is lexical matching only; there are no embeddings or real paraphrase matching.
- **Version detection:** spoken Bible names such as "KJV" are matched by regex or fuzzy similarity and suggest switching translation (`BibleVersionDetector.ts`).
- **What happens on a match** (`AiManager.ts:125-255`):
  - The setting is "ask", "highest", "high" or "medium", with thresholds of 100/95/75/50.
  - It only auto-presents if the operator hasn't changed the output manually in the last 30 seconds, and never at 50 or below.
  - Otherwise it adds a suggestion to a queue (at most 15, kept for 5 minutes) and shows a smart-action toast (4 seconds if already presented, 30 seconds otherwise) with a confidence meter.
- **LLM fallback:** used only if string matching found nothing and no match happened in the last 5 seconds, and only after at least 15 new words (`AiManager.ts:21-46`, `src/frontend/ai/llm/llmManager.ts:96-120`).
  - It sends a structured-JSON prompt that classifies the text as scripture, lyrics, quote, announcement or empty, with strict anti-hallucination rules: an explicit citation or a word-for-word reading is required, and chapter-only references are not allowed (`src/frontend/ai/llm/prompts.ts:3-70`).
  - Providers are Anthropic, OpenAI, Google and Ollama, all with JSON schemas (`src/electron/ai/llm/providers/*`). Keys are tested and then stored in the app's local secrets store (`src/electron/ai/setup/aiKeys.ts`).

### 3. Other AI features, built or half-built
- **"Generate slide" chat** in the editor: the LLM returns an `items` array or actions (APPLY_TO_SLIDE, CREATE_SLIDE, CREATE_TEMPLATE, CREATE_OVERLAY, CREATE_OUTPUT) (`src/frontend/ai/manager/ChatAction.ts:14`, `AiGenerate.svelte`, `prompts.ts:74-278`).
- **General chat:** the prompt is written (`prompts.ts:280`), but the chat tab is hidden in the floating panel (`AiFloating.svelte:18-21`).
- **Not finished:**
  - only scripture is acted on; lyrics, quote and announcement are dropped (`AiManager.ts:129, 175`);
  - "interpretation mode" for live translation is marked WIP (`AiSettings.ts:27`);
  - auto-lyrics is a TODO (`SmartSettings.svelte:34`);
  - the whole feature is labelled "EXPERIMENTAL!" (`:25`).

### 4. Operator UI and editor
- **Layout:** the main layout (`src/frontend/MainLayout.svelte`) has five pages: show, edit, stage, draw and settings.
  - Top bar.
  - Resizable left panel: projects (service order) on the show page, a navigator on the edit page.
  - Centre: the slide grid (Show), the Editor, or Focus mode.
  - Resizable right panel: output preview with clear buttons, plus context tools (ShowTools, EditTools, MediaTools…).
  - Optional project timeline at the bottom.
  - Bottom drawer with tabs for shows, media, audio, overlays, templates, scripture, calendar and functions (`src/frontend/values/tabs.ts:5-16`).
  - The floating AI panel appears when AI is enabled.
- **Slide views:** grid, simple, groups, list, lyrics and text (`src/types/Main.ts:168`).
- **Editor:**
  - Absolutely positioned items with move, resize, rotate, corner radius and crop handles; shift for multi-select (`src/frontend/components/edit/editbox/Editbox.svelte:47-85`). I found no snapping guides.
  - 19 item types: text, media, camera, timer, clock, button, events, weather, variable, web, QR, icon, slide tracker, visualizer, captions, metronome, current output, chart, table (`src/types/Show.ts:679`).
  - Text panels: align, text, lines, list, outline, shadow, chords, scrolling, special (`src/frontend/components/edit/values/boxes.ts:127-330`).
  - Edit modes: default, chords, text_edit (`src/types/Tabs.ts:65`). Zoom (`edit/scripts/zoom.ts`), auto-size (`autosize.ts`).
- **Shortcuts:** one global keydown handler (`src/frontend/utils/shortcuts.ts:148`).
  - Ctrl tables (`:37-86`): Z/Y undo/redo, Ctrl+1-9 drawer tabs, N new, S save, T toggle panels, F find/replace, O outputs.
  - Output keys (`:347-445`): F1 clear background, F2 clear slide, F3 clear overlays, F4 clear audio, F5 advance, Esc or "." clear all, Space/arrows/PageUp/PageDown navigate, Ctrl+L lock output.
  - Keys are forwarded from output windows (`:157-160`).
- **Undo:** a command-style history with per-action undo/redo, about 2,100 lines (`src/frontend/components/helpers/history.ts`, `historyActions.ts`). Repeated style changes overwrite the previous entry (`history.ts:14`).
- **Quick search:** one palette over shows, settings, stage, overlays, projects, actions, navigation, FAQ, media, audio, Bible and items, with aliases (`src/frontend/components/quicksearch/quicksearch.ts:78, 570-582`).

### 5. Audio
- **Playlists:** loop, auto-next, shuffle and crossfade (`src/frontend/audio/audioPlaylist.ts:13-121`).
- **Routing:** a node-graph matrix in the Web Audio API (`src/frontend/audio/routing/audioRoutingManager.ts`).
  - Inputs: drawer audio, mic, metronome, output window.
  - Outputs: speakers, network, Icecast (`src/types/AudioRouting.ts:4`).
  - Sidechain ducking from -36 dB in to as much as -48 dB of reduction (`audioSidechain.ts:26-36`).
  - Up to 8 channels (7.1) (`audioMultichannel.ts:10`).
- **Per-channel effects:** EQ, filter, noise gate, compressor, reverb, delay, limiter, stereo shaper (`audioRoutingManager.ts:46-55`).
- **Also:** fades, a waveform view, a spectrum analyser, a metronome, and a channel recorder.

### 6. UX pain points vs. strengths
**Pain points**
- Lots of modes: five pages × six slide views × three edit modes × focus mode.
- 64 popups (`components/main/popups`) and 10 settings areas: general, display, styles, audio, connection, files, profiles, theme, AI, other (`values/tabs.ts:3`). The audio routing settings alone are over 1,000 lines.
- Meaning is overloaded across templates, output styles and overlays; the LLM system prompt has to explain it (`prompts.ts:285-305`).
- Function keys clear different layers depending on focus and lock state.
- Scripture auto-detect only works with local Bibles, not API ones (`AiManager.ts:84-88`).
- The AI confidence setting ("ask" / "highest" / "high" / "medium") is abstract.

**Do differently**
- One live screen of queue → preview → live, with the drawer as a single searchable library.
- A suggestion lane that sits next to the preview, not a toast.
- Show the confidence reason ("heard 'John 3:16'" vs "matched by wording").
- Audio routing hidden behind presets.
- Snapping guides in the editor.
- One "clear" control that shows clearly which layer it clears.

**Keep**
- The two-tier detection: deterministic and fast first, LLM only as a fallback.
- Bias towards the next verse while someone is reading.
- The rule that auto-present backs off after a manual change.
- Pinned, hash-checked model downloads.
- A separate speech process with a watchdog.
- Raw mic capture with no browser processing.
- Quick-search palette, command-style undo, keys forwarded from output windows.
- Layered clears for background, slide, overlays and audio.

---
## Research report

FreeShow data model and persistence

All paths are relative to `.../scratchpad/src/FreeShow/`. I only read code; nothing was run or installed.

**1. The Show entity** (`src/types/Show.ts`)

```ts
Show { name; category; private?; locked?; origin?; reference?{type:"scripture"|"calendar"|...,data}
  settings:{activeLayout:ID; template:ID|null; customFonts?}
  timestamps:{created; modified; used}
  meta:{number,title,artist,author,composer,publisher,copyright,CCLI,year,key}   // :48-59
  metadata?:{tags?}
  slides: Record<ID,Slide>; layouts: Record<ID,Layout>; media: Record<ID,Media> }   // :18-64
Slide { group:string|null; globalGroup?:"verse"|"chorus"...; color; children?:ID[];
  settings:{template?,color?,backgroundImage?,resolution?}; notes; items:Item[];
  customDynamicValues? }                                                             // :89-108
Item { type?:ItemType; style:string /*raw CSS*/; align?:string /*CSS*/; lines?:Line[];
  src?; timer?; clock?; chords?{enabled,color,size}; textFit?; conditions?; bindings?;
  fromTemplate?; actions?:any; ...~40 optional per-type fields }                     // :110-178
Line { align:string; text:{value:string; style:string /*CSS*/}[]; chords?:{id,pos,key}[] }  // :292-318
Layout { name; notes; slides: SlideData[] }                                          // :320-327
SlideData { id /*parent slide*/; disabled?; children?:Record<childId,{...overrides}>;
  background?:mediaKey; overlays?; audio?; transition?; nextTimer?; actions?{...} }  // :372-414
```

- **Groups.** A "parent" slide carries the group label (verse, chorus). Continuation slides are listed in `Slide.children`, and the group's sequence is fixed inside the show. Global group definitions (name, colour, template) live in the separate `groups` store (`ShowGroup`, :199). The ProPresenter importer shows this clearly (`converters/propresenter.ts:310-320, 389-412`).
- **Layouts (arrangements).** A layout is an ordered list of parent IDs. Per-layout overrides (background, transition, disabling a child slide) sit on `SlideData`, so one slide pool supports many arrangements.
- **Item types** are listed at `Show.ts:679`: text, media, camera, timer, clock, button, weather, web, qr_code, chart, table, captions, and others.
- **Style is a CSS string.** Positions are absolute pixels on a 1920x1080 canvas, for example `DEFAULT_ITEM_STYLE = "top:88px;left:50px;height:904px;width:1820px;"` (`edit/scripts/itemHelpers.ts:23`).
- **Chords** are stored per line as character offsets (`pos`). ChordPro parsing is at `converters/chordpro.ts:163-188`.

**2. Projects and folders** (`src/types/Projects.ts`)

- `Project{name, parent:folderId, created, modified, used, shows: ProjectShowRef[], timeline?, archived?, deleted?}` (:6-22).
- `Folder{name, parent, deleted?}` (:51). The folder tree is built from `parent` pointers, and project templates are stored as Projects too.
- `ProjectShowRef{id, type:ShowType, layout?, notes?, color?, data?, played?}` (:24-36).
- `ShowType` (`Show.ts:680`) covers show, image, video, audio, player, section, overlay, effect, pdf, ppt, screen, ndi, camera, folder and show_placeholder. Media items reference files by path in `id`, and "section" items act as dividers.

**3. Templates, overlays, styles and stage layouts**

- **Template** is `{name, items:Item[], settings{mode, backgroundColor/Path, overlayId, firstSlideTemplate, maxLinesPerSlide, breakLongLines, styleOverrides}}` (`Show.ts:550-577`).
- **Templates are baked in, not referenced.** `mergeWithTemplate` (`helpers/output.ts:1407`) copies the template's `style` and `align` onto slide items, matching them by type and position. Items it adds are flagged `fromTemplate`.
- The TEMPLATE history action rewrites every slide (`historyActions.ts:~720-780`). A manual edit strips the template link (`helpers/show.ts:385`, `history.ts:77,89`).
- **Overlay** uses the same `Item[]` (`Show.ts:534`) and is attached per slide via `SlideData.overlays`.
- **Styles** are per-output settings (`Settings.ts:13-37`): which layers to show, line limits, scripture templates and metadata display. They are not text styles. "Themes" means UI theming only.
- **StageLayout** is `{settings, items: Record<itemKey, StageItem{style:string, ...}>}` (`Stage.ts:14-76`). It is independent of shows and follows the live output.

**4. Bibles and scripture**

- **Storage.** Each Bible is its own file, `Bibles/<name>.fsb`, containing JSON `[id, Bible]` (`electron/data/save.ts:68-72`). The structure is books → chapters → verses `{number, text}` (`types/Bible.ts:1-20`, and the `json-bible` lib).
- **Import and online sources.** The import format is sniffed by `electron/data/bibleDetecter.ts:3-24`, which recognises zefania, osis, opensong, beblia, softprojector, sqlite, mdb and others. API Bibles go through `JsonBibleApi` (`drawer/bible/scripture.ts:49-62`).
- **Verses to slides.** Slides are generated from a scripture template using placeholders such as `{scripture_text}`, `{scriptureN_*}` (one per translation) and `{scripture_reference_last}` (`scripture.ts:776-830`).
- Per-slide values are kept in `Slide.customDynamicValues`.
- Settings `versesPerSlide`, `smartSplit`, `splitLongVerses`, `longVersesChars=100` and `longVersesTolerance` are at `stores.ts:328-340`.
- Smart grouping is `groupVersesSmartly` (`scripture.ts:720`), using limits derived from the template (`scripture.ts:623-659`).
- Long verses are split into sub-verses "5a/5b" (`scripture.ts:1440-1459`, `getVersePartLetter` :408).
- Multiple translations become parallel content in a `BibleContent[]` (`types/Scripture.ts`).
- A scripture can be saved as a normal Show with `reference.type="scripture"` (`scripture.ts:1810-1880`).

**5. Persistence**

- **Root folder** is `Documents/FreeShow/` (`electron/utils/files.ts:338-360`).
- **One file per show:** `Shows/<show name>.show` holds JSON `[id, Show]` (`save.ts:83-87`). Because the filename is the show name, renames need special handling (`renamedShows`), and deletes re-read the file to check its ID first (`save.ts:91-106`).
- **Bundled JSON via electron-store:** settings, settings_synced, projects, stage, overlays, templates, themes, events, media, history, cache and usage (`store.ts:30-53`).
- **Show index.** `shows.json` holds a trimmed index rebuilt by scanning every `.show` file (`files.ts:1175-1230`). Full shows load lazily into `showsCache` (`helpers/setShow.ts:229`).
- **The save path is all-or-nothing:**
  - The frontend clones every saved store into one `SaveData` message sent over IPC (`utils/save.ts:123-251`, `types/Save.ts:95`).
  - The main process diffs each store, then rewrites any show whose content differs, comparing each against the file on disk (`files.ts:166`).
  - Show files are written with a plain `writeFileSync`, not temp-file-plus-rename.
- **Autosave** is a timer, 15 minutes by default (`utils/common.ts:116-134`, `values/autosave.ts`). The dirty flag comes from subscriptions that call `JSON.stringify` on stores (`save.ts:364-405`).
- **Undo and redo.** Entries hold full deep-cloned `oldData`/`newData` snapshots (`types/History.ts:26-56`). There are two systems side by side:
  - a legacy switch on string IDs (`history.ts:39+`);
  - newer generic `store_create/update/delete` entries (`historyStores.ts`) and `_updaters` (`historyHelpers.ts:33`).
- The stack is capped at 75 entries (`stores.ts:233`) and saved to `history.json`. That file is deleted if it exceeds 30MB (`store.ts:88-95`).
- **Global state.** `stores.ts` has 269 flat `writable` stores, temporary and saved state mixed together, all exported as `$` (`:420`).
- **Cloud sync (ChurchApps)** zips the whole data folder (`syncManager.ts:595`). It has four modes: merge, read_only, upload and replace (:69).
  - Overlays, projects, stage, templates and synced settings are merged per entity, newest `modified`/`timestamps.modified` wins (:655-688).
  - A per-device created/deleted ledger handles deletions (`syncLedger.ts:7-16`).
  - Items with no per-item timestamp fall back to whichever whole file is newer (:375-377).
  - If a device hasn't synced for 30 days, the sync runs read-only (:150-161).
  - There is no field-level merge and no conflict UI.
- **Google Drive** sync is similar: newest wins per file, with `combineFiles` merging by `modified` (`drive.ts:536-560`).

**6. Importers** (dispatch at `IPC/responsesMain.ts:577-611`, file reading at `electron/data/import.ts`)

- **Formats:** FreeShow show/project/template/overlay/theme/action/stage, txt, ChordPro, CSV, Word (word-extractor), PowerPoint (`converters/powerpoint/`, about 2.8k lines), PDF to images, ProPresenter, EasyWorship, VideoPsalm, OpenLP, OpenSong, MediaShout, Quelea, SoftProjector, SongBeamer, EasySlides, VerseVIEW, Lessons.church, Canva, calendar/ICS, and Bibles (Zefania, OSIS, Beblia, OpenSong, SoftProjector).
- **Cheap to support:** txt, ChordPro, CSV, OpenSong/OpenLyrics XML, Quelea, EasySlides and VerseVIEW. These are simple text or XML, about 100-400 lines each.
- **Moderate:** OpenLP (XML or SQLite) and EasyWorship (SQLite plus RTF, with hand-written RTF stripping at `easyworship.ts:111-230`).
- **Expensive:** PowerPoint and ProPresenter.
- **ProPresenter protobuf.** The `.pro` (PP7) decoding lives in `electron/data/import.ts:329-343`. `decodeProto` loads `public/proto/presentation.proto` (one of 10 proto files from greyshirtguy/ProPresenter7-Proto) with protobufjs and turns it into JSON. `converters/propresenter.ts` then maps it. The same converter handles PP6 XML (`.pro6`) and `.json`/`.jsonbundle`, with RTF and base64 decoding at :415-600.

**7. What to avoid and what to keep**

Avoid:
- **CSS strings as the style model** (`Item.style`, `Line.text[].style`, `align`). They are untyped, merged with regex, and fixed to 1920x1080 pixels. Use typed style objects with normalised coordinates.
- **Baking templates into slides** with positional, type-ordered matching. Use live inheritance (theme reference plus per-field overrides).
- **`Item` as a grab-bag** of 40+ optional fields and many `any`. Use a discriminated union per item type.
- **Show name as filename**, which needs rename and delete bookkeeping. Use the ID as the filename.
- **Non-atomic writes for show files.** On parse failure the code auto-deletes the file (`store.ts:97-105`), or truncates and retries at `"}}]"` (`files.ts:1349-1356`).
- **Whole-state snapshot saves and snapshot undo** that is persisted and capped by size. Prefer patch or command history and dirty tracking per document.
- **269 flat global stores**, with deprecated fields kept in the types.
- **Last-writer-wins whole-entity sync.**

Keep:
- the separation of the slide pool from layouts (arrangements);
- parent/child group slides plus global group definitions;
- chords as character offsets on lines;
- one file per show plus a rebuildable index and text cache for search;
- project items as typed references, with show IDs or media paths and per-item overrides;
- template-driven scripture with placeholder tokens and per-translation slots;
- the sync tombstone ledger idea.

---
## Research report

FreeShow analysis. All paths are relative to `.../scratchpad/src/FreeShow/`. I only read the code and ran nothing.

**1. Network servers**
- **Web-client servers** (`src/electron/servers.ts`):
  - Each one is an Express app plus a Socket.IO server on plain HTTP, listening on all interfaces. Ports: REMOTE 5510, STAGE 5511, CONTROLLER 5512, OUTPUT_STREAM 5513 (:26-31). The CAM server is commented out and its port is now used by OUTPUT_STREAM.
  - Each server serves its static Svelte bundle (:72-74) and `/nowplayingcover` (:59).
  - Connections are capped by a shared `max` (default 10, :92). The client name is just an OS guessed from the User-Agent (:245).
  - Message flow: all traffic uses one event named after the server, shaped `{channel, data, id}` (`src/types/Socket.ts`). Client to app goes through `toApp` with `id` replaced by `socket.id` (:230), which is good. App to client is an IPC bridge that sends to one socket if `msg.id` is set, otherwise broadcasts to every socket (:104-108).
  - Dispatch happens in the renderer: `src/frontend/utils/sendData.ts:61-113` routes each channel to `receiveREMOTE`, `receiveSTAGE` or `receiveCONTROLLER`.
- **Discovery**: Bonjour/mDNS (`src/electron/data/bonjour.ts`) publishes `freeshow-<NAME>-<random hex>` as type `_freeshow._udp`, with TXT records `ip` and `ips` (:60-80). It checks for an existing service first (:26). On macOS it runs native `dns-sd` instead, to avoid hostname conflicts (:112).
- **Auth on the web clients**:
  - REMOTE has one optional plaintext password. The client sends `PASSWORD` and gets back whether one is required, then sends `ACCESS`. The app does a string compare and marks the connection `entered` (`remoteTalk.ts:36-69`). Messages from connections that haven't entered are dropped (`sendData.ts:74-85`). The remote client keeps the password in `localStorage` (`server/remote/util/socket.ts:14`).
  - STAGE has an optional password per layout (`stageTalk.ts:86-90`).
  - CONTROLLER and OUTPUT_STREAM have no auth at all.
- **What each client can do and how it gets updates**:
  - **Remote**: browse shows and projects, open a show, jump to a slide or clear (`OUT`), scripture search, overlays and templates, functions (actions, timers, variables), audio mixer, and `API:<action>` calls. It gets an initial snapshot of the shows, then pushed `OUT` and `SHOW` updates.
  - **Stage**: read-only display, plus item buttons that call `RUN_ACTION`.
  - **Controller**: next, previous, clear (pressed twice within 2 s it clears everything), a laser/paint pointer using 0..1 normalised coordinates (`controllerTalk.ts:35`), and pulled output thumbnails (`OUTPUT_FRAME`, `servers.ts:214`).
  - **Output_stream**: pushed base64 frames with ack-based backpressure. A new `STREAM` frame isn't sent until the client replies `STREAM_DONE` (`servers.ts:171-175, 212`).
- **Control API** (`src/electron/utils/api.ts`), off by default:
  - Socket.IO on 5505 using event `data` (:53), with `cors: "*"` (:65).
  - REST on port+1 (5506) at `ALL /`. It takes a JSON body `{action, ...}` or a query string `?action=X&data={json}` (:134-158). Because the Express app is shared, REST also answers on 5505.
  - OSC over UDP on the same port number (5505), at `/freeshow/<action>` with a JSON string as the argument (:164-189). OSC paths are mapped to actions by a tree in `apiOSC.ts:48-86`.
  - One optional password, accepted as a Bearer header or under `auth`, `password`, `token`, `key` etc. in headers, query or body (:20-38). It is compared with plain `===`.
  - The OSC sender opens a new UDP socket for every message (:202-243).

**2. Public API**
- All actions live in one table, `API_ACTIONS`, in `src/frontend/components/actions/api.ts:214-442`. The same names are used by REST, WebSocket, OSC, MIDI, remote `API:` calls, slide actions, the timeline and the calendar. That single registry is the main thing worth copying.
- Action groups:
  - **Project**: `id_select_project`, `next_project_item`, `index_select_project_item`
  - **Show**: `id_select_show`, `start_show`, `change_layout`, `set_plain_text`, `create_show`, transpose
  - **Slide**: `next_slide`, `previous_slide`, `index_select_slide`, `id_select_group`, `disable_slide`
  - **Clear**: `clear_all`, `clear_slide`, `clear_background`, `clear_overlays`, `clear_audio`
  - **Media**: `play_media`, `video_seekto`, `start_camera`, `show_live_source`
  - **Overlays and scripture**: overlay actions, `start_scripture`
  - **Output**: `toggle_output`, `lock_output`, `change_output_style`, `change_stage_output_layout`, `change_transition`, streaming and recording
  - **Audio**: play, pause, `change_volume`, `mute`, playlists, metronome, microphones
  - **Timers**: start, pause, stop and seek, each by id or name
  - **Timeline**: start, stop, pause, set time
  - **Variables and actions**: `change_variable`, `run_action`, `toggle_action`
  - **Integrations**: OBS, Spotify, `sync_content_provider`
  - **Outbound sends**: `emit_action` (OSC, HTTP or MIDI), `send_rest_command`
  - **App**: `close`
  - **Getters** (`get_*`): shows, show, projects, output, slide text, thumbnails, variables, timers, playlists, actions, and more
- Request and response: actions whose name starts with `get_` get a `returnId`. The main process polls every 50 ms, for up to 10 s, until the renderer posts a reply (`api.ts:256-280`, `api.ts:447-464`). Non-`get_` actions get a 204 and no reply. Indexes in the API are 1-based (:453). Variable reads use `{isVariable, keys}` (`api.ts:89`).
- Companion: the settings page labels this service "Companion/API" (`Connection.svelte:73,104`). Companion and Stream Deck talk to the 5505 socket or REST; I found no Companion-specific protocol in the code.

**3. Stage display**
- **Layout model** (`src/types/Stage.ts`): each layout has a name, an optional password, settings (source output, background, resolution, labels) and a map of items plus `itemOrder`. Each item has a type, absolutely positioned CSS style, alignment, conditions, and per-type options:
  - slide text with `slideOffset` (0 is current, 1 is next), `lineCount`, `itemNumber`, `includeMedia`, chords
  - notes, text, slide tracker, clock or analog clock, timer, variable, metronome, media, camera, `current_output` mirror
  - item `flash` and `button` (press/release action ids)
  - The renderer is in `server/stage/components/Stagebox.svelte:197-244`.
- **How it gets data**: when a client opens a layout, the app sends OUT, SHOW_DATA (the whole show JSON), TIMERS, EVENTS, VARIABLES and METRONOME (`stageTalk.ts:100-108`). Media goes as base64 (`stageTalk.ts:244`). The client works out next slides itself. Dynamic text is fetched by request/response (`awaitRequest`, `server/stage/util/socket.ts:48`).
- **Output mirror**: frames go only to subscribed sockets. Subscriptions expire after 10 s unless renewed by a heartbeat (`servers.ts:37-40, 185-198`). This is a good pattern.
- **Scaling**: the client renders at a fixed resolution (the layout's, or 1920x1080) and applies `transform: scale(min(w/W, h/H))`, measured with a ResizeObserver (`server/stage/components/Zoomed.svelte:13-42`).

**4. Actions, triggers and timeline**
- **Action model** (`src/types/Show.ts:467`): `Action {triggers: string[], actionValues{triggerId: data}, customActivation, keypressActivate, midi, shows[]}`. `runAction` runs the triggers in sequence; `wait` is a pseudo-trigger and can be cancelled. A loop guard stops an action after more than 10 runs within 100 ms (`actions.ts:46-135`).
- **What can trigger actions**:
  - **Custom activations** (`customActivation.ts:9-38`): startup, save, output changed, show created or opened, slide click, group start, slide or background cleared, scripture start, video and audio start/end, playlist ended, timer start/end, MIDI received.
  - **Slide entry**: per-slide `data.actions.slideActions[]`, plus legacy flags such as `receiveMidi` and `startShow` (`Show.ts:392-410`).
  - **MIDI in** matches type, note or CC, and channel; velocity or CC value becomes an index (`components/actions/midi.ts:89-150`).
  - **Keypress.**
  - **Time of day**: calendar events of type `action` (`types/Calendar.ts`, `helpers/timerTick.ts:165+`), with countdown toasts.
  - **Stage buttons and remote `run_action`.**
- **Timeline** (`Show.ts:329-351`, `timeline/TimelinePlayback.ts`): a list of `{time ms, duration, type: action|slide|audio|show|style, data, easing}` entries with optional loop. Each tick it fires entries it has passed (:365). It can send or follow LTC/MTC timecode (`timeline/timecode.ts`, `src/electron/timecode/`).
- **Outbound "emitters"** (`emitters.ts`): saved OSC, HTTP or MIDI targets with templated values.

**5. Content providers**
- They share an abstract `ContentProvider` (`contentProviders/base/ContentProvider.ts:40-160`) with connect, disconnect, apiRequest, loadServices and startupLoad. Providers: Planning Center, ChurchApps, OnStage, Canva, AmazingLife.
- **Planning Center auth**: OAuth with PKCE S256, a public client id, and a localhost callback on port 5501 (`planningCenter/connect.ts:63-130`). There is no `state` parameter, and the auth code is logged (:85). Tokens are refreshed on expiry, falling back to a full re-auth (:134-170). Tokens are stored in plaintext in the ACCESS store (`data/contentProviders.ts`).
- **What is imported** (`request.ts`): folders, service types, plans (future, 25 at a time) and plan items. Songs come with their arrangement sections into shows (:557). Media items come with attachments (:978). Headers and regular items become project items.
- **Live sync**: one REST call fetches plan times, the live state and `current_item_time` (`live.ts:35-92`). After that, updates come from the public Pusher `live_channel` (app key hardcoded at `pcoLiveSync.ts:10`). The `goToPlanItemTime` event drives `pco_live` countdown timers, ticking every 1 s, with a debounced re-poll when an event isn't recognised (:186-223).
- Live sync is one-way only: FreeShow follows PCO Live but does not control it.

**6. Weaknesses to avoid**
- **Stage port exposes the whole control API without auth.** `sendData.ts:84` lets any STAGE socket call any `API_ACTIONS` entry, including `close`, `delete_project` and `send_rest_command`. Stage passwords are never checked here, and `RUN_ACTION` is gated only loosely (`stageTalk.ts:223-229`).
- **Broadcasts leak data.** Messages without an id go to every socket (`servers.ts:108`), including unauthenticated remotes and other stages' viewers. Stage `SHOW_DATA` broadcasts full show JSON. Filtering happens only on the client (`remote/util/socket.ts:34`).
- **Cross-site control is possible.** The API uses `cors:*`, has no password by default, and accepts GET `?action=` (`api.ts:65, 143`). Any web page the operator visits could control the app.
- **No TLS anywhere.** Passwords are plaintext, compared with `===`, and kept in browser localStorage. There are no per-device tokens and no rate limiting.
- **The app can be made to send arbitrary HTTP requests (SSRF).** `send_rest_command` and `emit_action` send requests to URLs and ports supplied by the caller (`rest.ts:10-48`).
- **OSC replies go to the default target, not the sender**, and OSC has no real auth.
- **A 10 s polling wait for every request**, and business logic in the renderer: the main process only relays, so the API dies with the UI.
- **Message shapes are untyped and loosely named** (`id` used for both socket ids and show ids). There are many duplicate backward-compatibility actions (by name, index and id).
- **Base64 media over Socket.IO** is used for stage backgrounds.

**Worth keeping**
- One action registry shared by every input (API, OSC, MIDI, slides, timeline, calendar).
- Request/response correlation with a `returnId`.
- mDNS discovery with TXT IPs.
- A layout model with typed items, slide offsets and per-item conditions.
- A fixed design resolution with transform scaling.
- Frame streaming with ack backpressure and subscriptions that expire unless renewed.
- PKCE OAuth.
- Live PCO updates by push (Pusher) with occasional REST re-polling to recover.

---
## Research report

All paths below are relative to `/tmp/claude-1000/-home-aaron--config-Claude-scratch-workspaces-e226bed8-d735-4c0e-93e2-dc8a12fdf4e2-53575544-6129-461f-a6ac-0a4ad9987ff5-scratch-2026-11-05-480134/3ca5cce1-e87e-4d34-b7ba-e09d4712a552/scratchpad/src/FreeShow/`. I only read the code; nothing was run.

## 1. Process and window model
- **Main process** (`src/electron/index.ts`): it applies `app.disableHardwareAcceleration()` once at startup if configured (91-97). The startup order is: loading window, then stores, then servers, then the main window (150-176, 204-251). A `prevent-display-sleep` power-save blocker is started.
  - IPC is one `ipcMain.on` per channel (`MAIN`, `OUTPUT`, `NDI`, `OMT`, `BLACKMAGIC`, `AUDIO`) at 414-422.
  - `toApp()` (425) sends to the main window only.
- **Every window loads the same SPA bundle** (`loadWindowContent`, 266-288). When the page sends `STARTUP READY`, main replies `TYPE: null|"output"|"media"` and the frontend switches role from that.
- **Output window defaults** (`src/electron/utils/windowOptions.ts:42-72`): `frame:false`, `transparent:true`, `alwaysOnTop`, `skipTaskbar`, `resizable:false`, `hasShadow:false`, `enableLargerThanScreen`, `backgroundThrottling:false`, `autoplayPolicy:no-user-gesture-required`, `sandbox:false`, `webviewTag:true`.
  - Per output it adds the background colour `#00000000` or `#000000` (`OutputLifecycle.ts:119`).
  - Invisible outputs get `offscreen:{useSharedTexture}` (251-291).
- **No real fullscreen or kiosk.** A borderless window is set to the display's bounds instead.
  - Always-on-top uses level `screen-saver` on Windows and `pop-up-menu` elsewhere (`OutputAlwaysOnTop.ts:6-21`).
  - macOS uses `type:"panel"` (25-27). Windows runs an Aero Peek helper exe (31-40).
- **Display selection** (`OutputVisibility.resolveOutputBounds`, 76-110), in order:
  1. Keep the saved bounds if their centre is on a live display.
  2. Otherwise use the stored `screen` display id.
  3. Otherwise auto-pick the second display, avoiding the one the main window covers (112-134).
- **Hot-plug**: `display-added/removed/metrics-changed` call `restoreAllOutputBounds` after a 500/1000 ms delay (`OutputLifecycle.ts:52-90`).
- **DPI**: capture-only windows are sized at bounds ÷ scaleFactor so captures come out at the configured pixels (`OutputBounds.ts:274-295`). `setBounds` is called three times (0/10/80 ms) as a workaround (247-271).

## 2. State protocol, controller to output
- **Path**: renderer `send(OUTPUT, [CHANNEL], data)` → `OutputHelper.receiveOutput` (`OutputHelper.ts:20-58`).
  - Control channels are handled in main: `CREATE`, `REMOVE`, `TOGGLE_OUTPUTS`, `SET_VALUE`, `UPDATE_BOUNDS`, `CAPTURE`, `MEDIA_LAYERS`, `RENDER_SIGNATURES`, `PREVIEW_*`.
  - Anything else is broadcast to every output window and its capture surface (`OutputSend.ts:10-28`).
- **Each output window mirrors the whole controller store.** About 40 channels are sent from `src/frontend/utils/listeners.ts:73-401`, with the initial sync at 508-524. They include `OUTPUTS`, `STYLES`, `SHOWS` (the show cache, sent before `OUTPUTS`, 93), `OVERLAYS`, `TEMPLATES`, `TRANSITION`, `MEDIA`, `EFFECTS`, `TIMERS`, `VARIABLES`, `PLAYING_VIDEO_STATE`, `DRAW`, `SPECIAL`, and others.
  - Receivers just call `store.set()` (`src/frontend/utils/receivers.ts:176-271`).
  - `OUTPUTS` is trimmed per window to `{[id]: output}` (`OutputSend.ts:30-35`) and de-duplicated with JSON.stringify (`receivers.ts:177-195`).
- **The "out" state** is `Output.out: OutData = {refresh, background, slide, effects, overlays, transition, scene}` (`src/types/Output.ts:76-84`).
  - `OutSlide` is a reference (`id`, `layout`, `index`, `line`, `revealCount`, temp items, pdf page). It is resolved against the mirrored `showsCache` inside the output (`src/types/Show.ts:623-645`).
  - `OutBackground` holds path, type, startAt, loop, filter (601-621).
  - `OutTransition` is only `{duration}` (647).
- **Sequencing and acks**: main stamps a per-output `seq` on every message (`OutputSend.ts:20`, `RenderGroups.stamp` 104-108).
  - The page answers `RENDER_BUSY {busy, dom: hash(innerHTML), seq}` from a MutationObserver plus animation events (`src/frontend/MainOutput.svelte:63-119`), handled by `pageBusy` (`OutputLifecycle.ts:200-210`).
  - This ack is used only for render sharing. It does not guarantee delivery.

## 3. Layers, transitions, video sync, styles
- **Layer stack** (`src/frontend/components/output/Output.svelte:406-482`, bottom to top):
  1. Style background image
  2. Scene media
  3. Background media (gated by `layers.includes("background")`)
  4. Colour bars
  5. Effects placed under the slide
  6. Underlays (overlays with `placeUnderSlide`)
  7. PDF / PPT window / `SlideContent`
  8. Metadata overlay
  9. Effects over the slide
  10. Overlays
  11. Attribution
  12. Draw
  13. `RepaintTick`

  Content is letterboxed inside a `Zoomed` component.
- **Styles**: each output has a style id, overridable by a scene (`Output.svelte:40-56`). A style controls which layers are shown (`currentStyle.layers`, 76-83), plus resolution and aspect, templates, line limits, transitions, cropping and background.
- **Transitions**: Svelte `in:`/`out:` on wrapper divs (`transitions/OutputTransition.svelte`, `utils/transitions.ts:74`). Priority is slide setting, then style, then the global `TRANSITION` store, separately for text, media and overlay (`helpers/output.ts:1860-1884`).
- **Video sync**: the controller window plays each video's *audio* as the master clock and broadcasts `playingVideoState` every 100 ms (500 ms in optimized mode) (`media/video/videoPlayer.ts:820-830`).
  - Output `<video>` elements are muted. They extrapolate `currentTime + (now - at)` (`media/Video.svelte:53-80`).
  - They correct drift with a hard seek above roughly 0.4-0.8 s, or a playbackRate nudge with an 80 ms deadband (`video/videoSync.ts:47-130`).
  - Optional "media layers": one hidden media window per shared video, composited under the pages by a native addon (`output/helpers/MediaLayers.ts`, `layers/mediaLayers.ts`).

## 4. Capture, NDI, OMT, DeckLink, streaming
- **Two capture paths**:
  - **OSR paint events**: offscreen window, `setFrameRate`, `webContents.on("paint")`.
    - The GPU shared-texture path goes through the `osr-capture` addon with an adaptive in-flight depth (`OutputLifecycle.ts:457-475`, 893+, paint at 1274).
    - The CPU bitmap path keeps the latest frame and re-sends it on a timer at the configured fps (1457-1512).
  - **`capturePage()` polling** on a `setTimeout` loop (`capture/helpers/CaptureLifecycle.ts:23-142`).
- **Displayed outputs** that need capture get a hidden offscreen "capture surface" twin. The visible window then draws the captured frames (the presenter) instead of rendering (`OutputLifecycle.ts:362-397`, `OutputPresenter.ts`).
- **Frame rates** (`CaptureHelper.ts:16-50`): NDI/OMT 30 when a receiver is connected, 1 when not; stage 20; WebRTC/RTMP 30; maximum 60. The render rate follows the fastest consumer (116-146).
  - Linux needs a timer-driven `invalidate` paint drive (`OutputLifecycle.ts:476-555`).
  - Forced repaints draw a 1px canvas (`RepaintTick.svelte`).
- **Alpha**: the readback format is BGRA, UYVY (opaque) or UYVA (transparent) (`CaptureTransmitter.ts:61-77`). The NDI fourCC is UYVY/UYVA (`ndi/ndiWorker.ts:107-150`, `clockVideo:false`).
- **Workers**: one shared `worker_threads` worker runs NDI (grandiose), OMT, Blackmagic (macadam), RTMP (ffmpeg spawn) and stream receive (`capture/SenderThread.ts:5`).
  - Previews and the WebRTC host get frames through a loopback WebSocket plus a shared-memory ring (`capture/FrameServer.ts:1`).
  - WHIP signalling runs from main (`streaming/WebRtcHost.ts:24-87`).
  - Recording reuses the RTMP encode (`OutputRecording.ts:6`).
- **Audio over NDI**: the renderer captures audio and posts planar Float32 over a `MessageChannelMain` port (`audio/receiveAudio.ts:38-65`). `processAudio` routes it to NDI/OMT per target id, or to all senders (`processAudio.ts:27-44`). The NDI frame format is FLTp.

## 5. Things a reimplementation should avoid
- **Whole SPA per output, full store mirroring.** Many channels with ordering dependencies, rate-limited with `hasNewerUpdate` debounces, and JSON.stringify diffing everywhere (`Output.svelte:47-117`). Send one versioned, self-contained render-state snapshot or diff per output instead.
- **No atomic frame state and no real acks.** `seq` exists only for render sharing.
- **Render sharing by hashing `innerHTML`** (`MainOutput.svelte:75-96`) plus `RenderGroups` (255 lines) and a 1626-line `OutputLifecycle` (adaptive pipeline depth, demotion, dead-capture watchdog). This is very complex. Decide rendering in a deterministic layer from state, not from the DOM.
- **Magic timers**: setBounds three times, a 1200 ms capture-start delay (`OutputLifecycle.ts:134-140`), a 2 s `loaded` gate (`MainOutput.svelte:57-61`), and hot-plug delays.
- **Offscreen mode is fixed at window creation.** Toggling NDI and similar options rebuilds the window (`OutputValues.ts:9-13`), and GPU demotion requires an app restart (`OutputLifecycle.ts:337-356`).
- **Platform hacks**: a +2px X11 resize (295-306), the Linux paint drive, the 1px repaint canvas, and an Aero Peek exe.
- **Video sync** depends on 100 ms IPC clock broadcasts from the UI window's audio elements, with each output decoding separately. A dedicated media clock or a shared decode is better.
- **Weak security defaults**: `sandbox:false`, `webviewTag:true`, and `webSecurity`/`nodeIntegration` relaxed in development (`windowOptions.ts:61-71`).
- **Legacy left in place**: deprecated animation code and commented-out preview windows remain throughout.

---
## Final summary from the session

I've written the blueprint from reading FreeShow's code: [church-presenter-blueprint.md](church-presenter-blueprint.md). I didn't use REA, because FreeShow's source is public and REA is for apps without source code; the code was read directly.

**What FreeShow gets right:**
- **Songs:** a song's slides are stored separately from the arrangements that order them, so one song can have several arrangements.
- **Commands:** one list of commands is shared by every input: the phone remote, the control API, OSC, MIDI, macros and the timeline.
- **Spoken scripture:** detection runs in two steps. Fast rules and matching against the Bible's text go first, and an online AI model is asked only when those find nothing.
- **Speech recognition:** it runs on the computer itself and needs no GPU.
- **Imports:** it reads almost every competitor's file format, ProPresenter and EasyWorship included.

**What to do differently:**
- **Text styling:** styles are stored as raw CSS text at fixed 1920×1080 pixel positions.
- **Templates:** each template is copied into every slide instead of being linked.
- **Saving:** files are overwritten directly, so a crash or power cut mid-save can damage a song.
- **Output screens:** every output screen keeps its own full copy of the app's data.
- **App logic:** everything runs inside the operator's window, so the API stops working if that window reloads.
- **Security:**
  - **Stage display:** a device connected to the stage display port can run any command, including deleting services.
  - **Control API:** it has no password by default and accepts requests from any website.

**My stack recommendation:** Electron for the desktop app, because FreeShow has already proven the hard parts with it: driving several screens and sending video to NDI and capture cards. Flutter for the phone remote, stage display and congregation apps, where your experience pays off most.

**Custom features where you can beat ProPresenter, EasyWorship and FreeShow** (all in the doc):
- **Bilingual services:** English and Swahili on every slide, and live translated subtitles for the sermon. FreeShow's version of this is unfinished.
- **Congregation phones:** attendees scan a QR code and follow lyrics and scripture in their own language, with sermon notes and an M-Pesa giving slide.
- **Smarter scripture AI:** it recognizes paraphrased verses, and suggestions sit beside the preview screen with the reason for each match.
- **Volunteer mode:** a locked-down simple screen, plus a rehearsal mode for practice.
- **Crash recovery:** after a crash or power cut, every screen goes back to exactly what it was showing.
- **Two-way Planning Center sync:** both FreeShow and ProPresenter only follow Planning Center, they can't update it.

**Open questions:** I haven't checked how well the speech model handles Swahili. Copyright on Swahili Bible translations also needs checking one translation at a time.

**Open source or commercial decides how to build it:** FreeShow is licensed GPL-3.0. If your app is also GPL-3.0, you can reuse FreeShow's code directly. A closed-source commercial app has to be written from scratch, using the blueprint's designs but none of FreeShow's code.

If you want to keep this work, I can move this session to a folder you choose.

