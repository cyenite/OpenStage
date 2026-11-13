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

Output windows go frameless over each screen other than the operator's (projector first, then stage), and
follow screens as they are plugged in or pulled out. "Shows on" under each screen in Present picks a
particular screen or a window, remembered per machine. With no spare screen they open as small windows
beside the operator. `OPENSTAGE_WINDOWED_OUTPUTS=1` forces windowed outputs even when displays are
attached; `OPENSTAGE_USER_DATA=<dir>` points the app at a different data folder.

On a Linux Wayland desktop the app runs under XWayland (`--ozone-platform=x11`), because Wayland does not
let an app put its windows on a chosen screen. The scripts pass the flag; any other launch restarts itself
with it. Pass `--ozone-platform=wayland` to stay on Wayland.

## Download

Installers for Windows (`.exe`), macOS (`.dmg`, Apple Silicon and Intel) and Linux (`.deb` and
`.AppImage`) are on the [releases page](https://github.com/cyenite/OpenStage/releases/latest). The website
is at [cyenite.github.io/OpenStage](https://cyenite.github.io/OpenStage/).

- The builds are not code-signed yet (see the [code signing policy](#code-signing-policy)). Windows
  SmartScreen asks for "More info" then "Run anyway"; on macOS, right-click the app and choose Open, or run
  `xattr -cr /Applications/OpenStage.app`.
- The AppImage needs `libfuse2` (`sudo apt install libfuse2t64` on Ubuntu 24.04). The `.deb` does not.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)

OpenStage has applied to SignPath Foundation. Until the project is accepted, releases are not signed;
v0.1.0 is unsigned.

- Only the Windows app (`OpenStage.exe`) and its installer are signed, and only when they are built by the
  release workflow on GitHub-hosted runners from this repository. Upstream files such as Electron's DLLs are
  shipped as their authors published them.
- Committers and reviewers: [cyenite](https://github.com/cyenite)
- Approvers: [cyenite](https://github.com/cyenite). Every release is approved by hand in SignPath before it
  is signed.

Privacy: this program will not transfer any information to other networked systems unless specifically
requested by the user or the person installing or operating it. It goes online only when the operator opens
the Bible downloads (bible.com) or the song catalogue (Worship Leader).

## Releasing

Push a version tag and GitHub Actions builds every installer and publishes a release with them:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The version comes from the tag (a tag with a hyphen, such as `v0.1.0-beta.1`, is marked as a pre-release).
`pnpm --filter @openstage/desktop dist` packages for the current OS locally, into `apps/desktop/release`.
The website in `website/` deploys to GitHub Pages on every push to `main` that changes it.

### Windows signing with SignPath

The release workflow signs the Windows build once these are set on the repository (Settings, Secrets and
variables, Actions). Without them it releases the Windows installer unsigned, as before.

- Variables: `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`
- Secret: `SIGNPATH_API_TOKEN`, for a SignPath user with submitter rights on the project

In SignPath, link the GitHub.com trusted build system to the project and add two artifact configurations,
with the slugs `app` and `installer`, from [.signpath/artifact-configurations](.signpath/artifact-configurations).
SignPath cannot sign inside an NSIS installer, so the workflow signs `OpenStage.exe` first, builds the
installer around it, then signs the installer. Each release therefore asks the approver twice; each request
waits up to an hour.

### Operator keys

| Key | Action |
|---|---|
| Click a slide | Show it now |
| Space | Show what is cued: the following slide, or what was just picked in the order or the Library |
| → / PageDown, ← / PageUp | Next / previous slide, running on into the next item |
| ↑ / ↓ | Select the previous / next service item (the screens do not change) |
| C, 1-9, B, P, E, T, I | Jump to the chorus, verse n, bridge, pre-chorus, ending, tag or intro of the song on screen |
| F1, F2, F3, F4 | Clear the background pick, slides, lower third, audio |
| F5, F6 | Stop the media layer, take every overlay off |
| Esc | Black screen; press again to bring back what was there |
| / or Ctrl+L (Cmd+L) | Open the Library drawer with its search focused |

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
| `website` | The homepage: one self-contained `index.html`, no build step |
| `e2e` | Playwright tests that launch the real Electron app |
| `docs` | Research, blueprint and plans |

## Volunteer mode and rehearsal

The lock button in the title bar sets a PIN and locks the window to a simple screen: the service, what is
on screen, what comes next, and big Back, Next and Clear buttons. Nothing can be edited or deleted until
someone unlocks it with the PIN, and the lock survives a restart. Rehearse runs the service off-air: the
screens keep what they showed, and stopping puts everything back.

## Importing

Edit → Songs → Import songs (or drop files on the library) reads OpenLyrics, ChordPro, SongSelect `.usr`/`.txt`,
plain text, FreeShow `.show`, OpenLP `songs.sqlite`, ProPresenter 6 and EasyWorship 6/7 (`Songs.db` with
`SongWords.db`). Edit → Scripture → Import a Bible reads OSIS, Zefania, USFX, USX and USFM, including
eBible.org downloads. Every import shows what it found first; duplicates are skipped unless you choose
Merge or Keep both.

## Licence and content

OpenStage is licensed under the [GNU GPL v3 or later](LICENSE). Being GPL, it may reuse code from
FreeShow (also GPL-3.0) with attribution; see `docs/research/` for the design study.

Bundled content must be public domain or under a compatible open licence. The demo service uses public
domain hymns. The bundled Bibles are the King James Version, Berean Standard Bible, World English Bible,
American Standard Version and Bible in Basic English, all public domain, converted from
[open-bibles](https://github.com/seven1m/open-bibles) by `pnpm build:bibles` into
`apps/desktop/resources/bibles/`; each carries its notice, shown in the Scripture screen. Neno: Bibilia
Takatifu 2015 (CC BY-SA 4.0) may be added later. Copyrighted translations such as the NIV, NKJV, the
Swahili Union Version and Biblia Habari Njema must not be bundled; churches can import Bible files they
hold rights to.

The fonts Inter (The Inter Project Authors) and Newsreader (The Newsreader Project Authors) are bundled
through Fontsource under the SIL Open Font License 1.1, so slides look the same on every machine and
offline. Their licence files ship with the `@fontsource-variable` packages.
