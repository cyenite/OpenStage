# OpenStage

Free, open-source church presentation software (lyrics, scripture, backgrounds, lower thirds, stage
display), in the same family as ProPresenter, EasyWorship and FreeShow. It is built first for Kenyan and
East African churches: bilingual English/Swahili services, modest Windows PCs, volunteer operators and
M-Pesa giving slides, with nothing in the design that stops it working anywhere else.

Status: **phase 0** (technical spikes). An engine process drives two output windows from an operator
window with Preview/Live and per-layer clears. Songs, Bibles, editing and importers start in phase 1;
see [docs/phase-1-plan.md](docs/phase-1-plan.md).

## Running it

Needs Node 22.12+ and pnpm 10.

```bash
pnpm install
pnpm dev          # Electron with hot reload
pnpm build        # bundle to apps/desktop/out
pnpm start        # run the built app
pnpm test         # engine unit tests (Vitest)
pnpm typecheck
pnpm test:e2e     # builds, then drives the real app with Playwright
```

On Linux, run the end-to-end tests off screen with `xvfb-run -a pnpm test:e2e` (unset `WAYLAND_DISPLAY`
first on a Wayland desktop, or Electron opens on your screen).

Output windows go frameless over each extra display (projector first, then stage). With only one display
they open as small windows on the right of the screen. `OPENSTAGE_WINDOWED_OUTPUTS=1` forces windowed
outputs even when displays are attached; `OPENSTAGE_USER_DATA=<dir>` points the app at a different data
folder.

### Operator keys

| Key | Action |
|---|---|
| Space | Send Preview to Live, queue the following slide |
| → / PageDown, ← / PageUp | Next / previous live slide |
| F1, F2, F3, F4 | Clear background, slides, lower third, audio |
| Esc | Clear everything (black screen) |
| Double-click a slide | Send it straight to Live |

## How it is built

```
+----------- Engine (Electron utility process, packages/engine) ------------+
|  Live state + command reducer   Output resolver   Atomic live-state save  |
+-------------+-----------------------------+-------------------------------+
              | MessagePort                  | MessagePort, RenderState{seq}
   Operator window (React)          Output windows: Projector, Stage
   apps/desktop/src/renderer        packages/output (dumb DOM renderer)
```

- **The engine owns all state.** Every input becomes a `Command`; the engine reduces it, resolves one
  self-contained `RenderState` per output, and sends it only to outputs whose frame changed.
- **Outputs are dumb.** They draw the `RenderState` they get, then ack its `seq`. They never see the
  library. The operator's Preview and Live panes use the same renderer, so they show exactly what the
  screens show.
- **The main process only wires MessagePorts** between windows and the engine. If the engine crashes it
  is restarted and every window is reconnected; outputs keep their last frame in the meantime.
- **Live state survives a crash or power cut.** It is written atomically (temp file, fsync, rename) and
  restored at start-up, dropping anything that no longer points at real content.
- **Layers**: background, slides, lower third, audio. Each output profile chooses which layers it shows
  (the stage display shows slides only, with the next slide underneath).

## Repository layout

| Path | What |
|---|---|
| `apps/desktop` | Electron app: main process (`src/main`), preload, operator UI (`src/renderer/operator`), output page (`src/renderer/output`) |
| `packages/engine` | Headless engine: state, commands, output resolution, persistence, utility-process entry |
| `packages/output` | `OutputSurface`, the DOM renderer for a `RenderState`, with crossfades and text fit |
| `packages/shared` | Types shared by everything: library model, layers, `RenderState`, wire protocol |
| `apps/mobile` | Flutter remote, stage and congregation apps (placeholders until phase 2) |
| `e2e` | Playwright tests that launch the real Electron app |
| `docs` | Research, blueprint and plans |

## Licence and content

OpenStage is licensed under the [GNU GPL v3 or later](LICENSE). Being GPL, it may reuse code from
FreeShow (also GPL-3.0) with attribution; see `docs/research/` for the design study.

Bundled content must be public domain or under a compatible open licence. The demo service uses public
domain hymns and the KJV and World English Bible. Planned bundled Bibles are KJV, WEB and Neno: Bibilia
Takatifu 2015 (CC BY-SA 4.0, shipped as a separate data file with its notice). The Swahili Union Version
and Biblia Habari Njema are copyrighted by the Bible Societies of Kenya and Tanzania and must not be
bundled; churches can import Bible files they hold rights to.
