# Phase 1 plan: a church can run a full Sunday service

Written 2026-11-05, after the first phase 0 session. Scope comes from blueprint sections 6 and 11.4.
Licence is GPL-3.0-or-later and the stack is Electron + React for desktop, Flutter for phones
(both decided 2026-11-05).

## Where phase 0 stands

Done:
- Engine in an Electron utility process holding the live state; commands go through one reducer.
- Two output windows (Projector, Stage) driven by a versioned `RenderState` per output, with acks.
- Operator window: service order, Preview/Live (drawn by the output renderer itself), layer bar with
  per-layer clears and black screen, slide grid, backgrounds and lower thirds drawer, keyboard shortcuts.
- Atomic live-state save with restore after a crash; engine restart that rewires every window.
- Unit tests for the engine, Playwright tests that drive the real app.

Still open from phase 0, worth finishing before phase 1 builds on top:
1. **Offscreen capture to NDI** (one output) to prove the broadcast path: offscreen twin window,
   `paint` events, a worker thread with `grandiose`. Decide here whether a capture-only output is a
   window or a hidden twin.
2. **Video backgrounds with an engine media clock**: the engine owns position and play state; outputs
   follow with rate nudges and hard seeks. Test with two outputs on one low-end Windows PC.
3. **Display hot-plug**: re-place outputs when a projector is connected or removed mid-service.
4. **A Windows test machine**: a 4 GB RAM, integrated-GPU laptop like many churches use, to set the
   performance budget early.

## Phase 1 work, in order

Each step lands in a working app; nothing waits for the end.

### 1. Document store
- One JSON file per document named by id, written atomically (the phase 0 helper), with a rolling
  backup per file. A SQLite index (Node's built-in `node:sqlite` in the engine) for titles, full-text lyrics search
  and usage history for CCLI reports. The index can always be rebuilt from the files.
- Command-log undo per open document, not snapshots.
- Library replaces the demo data; the engine's `Library` type grows into the blueprint 4.3 model.

### 2. Songs
- Sections (slide pool) and arrangements, chords as character offsets per line, transpose, CCLI metadata.
- `translations` on every slide: second-language lines edited side by side with the first.
- Song editor screen from the design canvas (`SongEditor`), with the paste-lyrics fast path:
  blank lines split slides, `[Chorus]`-style headings become sections.

### 3. Themes
- Typed `Theme` with boxes per role (main, secondary language, reference) in normalised coordinates,
  referenced from songs and services, never copied into them. Per-output overrides (stage, lower-third-only
  stream output).
- Bundle fonts with the app (Inter and Newsreader via Fontsource) so outputs look the same offline.

### 4. Scripture
- Bible store with KJV, BSB, WEB, ASV and BBE bundled as separate data files with their notices
  (decided 2026-11-06; Neno 2015 may follow). **Never bundle SUV, BHN, NIV or NKJV.**
- Passage-set builder (`Scripture` screen): type `jn 3 16-18`, `Yohana 3:16`, pick translations in display
  order, verses per slide, smart split of long verses (5a/5b) that keeps both languages aligned.
- Swahili book names and abbreviations in the reference parser from day one.

### 5. Service order and templates
- Services as documents: typed items with per-item overrides (arrangement, theme, language order, notes).
- Service templates (blueprint 11.2): ordered slots with durations, fixed content or rules, linked so
  untouched services follow template edits.
- Starter templates: Sunday service, Swahili service, midweek Bible study, youth night, wedding, funeral.
- Service timeline forecast from slot durations (the footer rail in the `Main` design).

### 6. Calendar
- Month and list views of every service with readiness status (ready, needs songs, no operator).
- Opening a service from the calendar goes straight to Present.

### 7. Stage display
- Stage layouts (current, next, notes, clocks, timers, stage message) as an engine output profile,
  plus the "message to stage" box and quick messages from the `Main` design inspector.

### 8. Importers
Start with the formats that move the most churches, each with the import rules from blueprint 11.1
(never overwrite silently, duplicate detection with Merge / Keep both / Compare, a report with reasons):
1. OpenLyrics, ChordPro, plain text, SongSelect `.usr`/`.txt`
2. ProPresenter 6/7 (`.pro` via the MIT `ProPresenter7-Proto` schemas), EasyWorship 2009/6/7 and `.ewsx`
3. OpenLP, FreeShow `.show`/`.project` (GPL lets us reuse FreeShow's converters with attribution)
4. Bibles: OSIS, Zefania, USFM/USX, eBible.org downloads
The remaining formats in blueprint 11.1 follow in the same importer framework.

### 9. Volunteer mode
- The locked-down `Volunteer` screen: service order, Preview/Live, big Next/Previous, one clear button
  that says what it will clear; admin behind a PIN. Rehearsal mode runs the service off-air.

## Engineering rules carried forward
- Outputs only ever receive resolved `RenderState`; no library access in output windows.
- Every input maps to a `Command`; phase 2's network API and Companion module reuse the same registry.
- Speech recognition, when it arrives in phase 4, is English only; no Swahili models for now.
- Bundled Bibles: public domain or CC BY-SA only (now KJV, BSB, WEB, ASV, BBE; Neno 2015 allowed).

## Open questions
1. Whether the Bible Society of Kenya will license SUV/BHN for software (blueprint 10.3). Worth asking now:
   its answer decides how Swahili churches get their main translation.
2. Pricing and sustainability (blueprint section 9, question 4): GPL allows paid builds, support or
   cloud, but the decision shapes what phase 5 looks like.
3. Packaging and updates for Windows (installer, code signing, offline updates by USB).
