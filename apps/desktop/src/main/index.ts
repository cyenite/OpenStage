import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, screen, type BrowserWindowConstructorOptions, type Display } from 'electron'
import { outputs, type OutputProfile } from '@openstage/engine'
import { EngineHost } from './engine-host'
import { isScreenChoice, ScreenManager } from './screens'

if (process.env['OPENSTAGE_USER_DATA']) app.setPath('userData', process.env['OPENSTAGE_USER_DATA'])

const engine = new EngineHost()

// Images and videos in the library reach every window through this scheme; `stream` lets videos seek.
protocol.registerSchemesAsPrivileged([{ scheme: 'openstage-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
const isMac = process.platform === 'darwin'
const forceWindowedOutputs = process.env['OPENSTAGE_WINDOWED_OUTPUTS'] === '1'
// Native Wayland ignores where an app asks to put its windows and lists other screens only once a
// window is up, so outputs land wherever the compositor likes. XWayland honours placement. The
// switch must be on the real command line: appended from here, the GPU process crashes to software.
// Electron fills in `ozone-platform` itself, so only the arguments say whether someone chose one.
const hasOzoneChoice = process.argv.some((arg) => arg.startsWith('--ozone-platform='))
const needsX11 = process.platform === 'linux' && !!process.env['WAYLAND_DISPLAY'] && !!process.env['DISPLAY'] && !forceWindowedOutputs && !hasOzoneChoice
const titleBarColor = () => (nativeTheme.shouldUseDarkColors ? '#1C1C1F' : '#ECECEE')
const themeSources = ['system', 'light', 'dark'] as const

const webPreferences: BrowserWindowConstructorOptions['webPreferences'] = {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
}

function load(window: BrowserWindow, page: 'operator' | 'output', query: Record<string, string> = {}): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void window.loadURL(`${devUrl}/${page}.html?${new URLSearchParams(query)}`)
  } else {
    void window.loadFile(join(__dirname, `../renderer/${page}.html`), { query })
  }
}

/**
 * The toolbar is the title bar, as in the design: macOS keeps its own traffic lights inset into it,
 * everywhere else the window is frameless and the page draws matching ones.
 */
function createOperatorWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: 'OpenStage',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 18, y: 20 } } : { frame: false }),
    backgroundColor: titleBarColor(),
    webPreferences,
  })
  const sendState = () => {
    if (window.isDestroyed()) return
    const state = { isFocused: window.isFocused(), isMaximized: window.isMaximized(), isFullScreen: window.isFullScreen() }
    window.webContents.send('window-state', state)
  }
  for (const event of ['focus', 'blur', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) window.on(event as 'focus', sendState)
  window.webContents.on('did-finish-load', sendState)
  engine.attach(window.webContents, { role: 'operator' })
  load(window, 'operator')
  window.on('closed', () => app.quit())
  return window
}

function handleScreenRequests(screens: ScreenManager): void {
  ipcMain.handle('screens', () => screens.state())
  ipcMain.on('screen-choice', (_event, outputId: unknown, choice: unknown) => {
    if (typeof outputId === 'string' && isScreenChoice(choice)) screens.choose(outputId, choice)
  })
}

function handleWindowRequests(): void {
  ipcMain.on('window', (event, action: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (action === 'close') window.close()
    else if (action === 'minimize') window.minimize()
    else if (action === 'toggle-maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
  })
  ipcMain.on('theme', (event, source: unknown) => {
    if (!themeSources.includes(source as (typeof themeSources)[number])) return
    nativeTheme.themeSource = source as (typeof themeSources)[number]
    BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(titleBarColor())
  })
}

/**
 * An output goes frameless over its display, like FreeShow does, rather than using OS fullscreen.
 * With no display for it (a laptop at rehearsal) it opens as a normal window beside the operator.
 */
function createOutputWindow(operator: BrowserWindow, profile: OutputProfile, display: Display | null): BrowserWindow {
  const index = outputs.indexOf(profile)
  const width = 640
  const height = 360
  const { workArea } = screen.getDisplayMatching(operator.getBounds())
  const placement: BrowserWindowConstructorOptions = display
    ? { ...display.bounds, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false }
    : {
        width,
        height,
        useContentSize: true,
        x: workArea.x + workArea.width - width - 24,
        y: workArea.y + 24 + index * (height + 48),
      }
  const window = new BrowserWindow({
    ...placement,
    title: `OpenStage output: ${profile.name}`,
    show: false,
    backgroundColor: '#000000',
    webPreferences: { ...webPreferences, backgroundThrottling: false },
  })
  if (display) window.setAlwaysOnTop(true, 'screen-saver')
  // GNOME ignores the position a window is created with when it is shown without focus, and its own
  // placement can land after a position set on show, so it is set again once that has settled.
  window.once('show', () => {
    const { x, y } = placement
    if (display || x === undefined || y === undefined) return
    window.setPosition(x, y)
    setTimeout(() => window.isDestroyed() || window.setPosition(x, y), 300)
  })
  window.once('ready-to-show', () => {
    window.showInactive()
    // GNOME pushes a screen-sized borderless window clear of the dock, onto the next screen; fullscreen it allows.
    if (display && process.platform === 'linux') window.setFullScreen(true)
  })
  engine.attach(window.webContents, { role: 'output', outputId: profile.id })
  load(window, 'output', { output: profile.id })
  return window
}

/** Serves only plain file names from the media folder, so a page can never ask for a path outside it. */
function serveMedia(): void {
  const folder = join(app.getPath('userData'), 'library', 'media-files')
  protocol.handle('openstage-media', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.slice(1))
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,200}$/.test(name) || name.includes('..')) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(join(folder, name)).toString(), { headers: request.headers })
  })
}

if (needsX11) {
  app.relaunch({ args: [...process.argv.slice(1), '--ozone-platform=x11'] })
  app.exit(0)
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let isQuitting = false

  app.whenReady().then(async () => {
    serveMedia()
    engine.start()
    handleWindowRequests()
    const operator = createOperatorWindow()
    const screens = new ScreenManager(join(app.getPath('userData'), 'screens.json'), forceWindowedOutputs, operator, (profile, display) => createOutputWindow(operator, profile, display))
    handleScreenRequests(screens)
    await screens.start()
    operator.focus()
  })

  app.on('second-instance', () => BrowserWindow.getAllWindows()[0]?.focus())

  app.on('before-quit', (event) => {
    if (isQuitting) return
    event.preventDefault()
    isQuitting = true
    void engine.stop().finally(() => app.quit())
  })

  app.on('window-all-closed', () => app.quit())
}
