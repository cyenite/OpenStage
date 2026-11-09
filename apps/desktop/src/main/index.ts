import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, nativeTheme, net, protocol, screen, type BrowserWindowConstructorOptions } from 'electron'
import { outputs, type OutputProfile } from '@openstage/engine'
import { EngineHost } from './engine-host'

if (process.env['OPENSTAGE_USER_DATA']) app.setPath('userData', process.env['OPENSTAGE_USER_DATA'])

const engine = new EngineHost()

// Images and videos in the library reach every window through this scheme; `stream` lets videos seek.
protocol.registerSchemesAsPrivileged([{ scheme: 'openstage-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
const isMac = process.platform === 'darwin'
const forceWindowedOutputs = process.env['OPENSTAGE_WINDOWED_OUTPUTS'] === '1'
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
 * An output goes frameless over the matching external display, like FreeShow does, rather than
 * using OS fullscreen. With no spare display (a laptop at rehearsal) it opens as a normal window.
 */
function createOutputWindow(profile: OutputProfile, index: number): BrowserWindow {
  const primary = screen.getPrimaryDisplay()
  const display = forceWindowedOutputs ? undefined : screen.getAllDisplays().filter((d) => d.id !== primary.id)[index]
  const width = 640
  const height = 360
  const placement: BrowserWindowConstructorOptions = display
    ? { ...display.bounds, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false }
    : {
        width,
        height,
        useContentSize: true,
        x: primary.workArea.x + primary.workArea.width - width - 24,
        y: primary.workArea.y + 24 + index * (height + 48),
      }
  const window = new BrowserWindow({
    ...placement,
    title: `OpenStage output: ${profile.name}`,
    show: false,
    backgroundColor: '#000000',
    webPreferences: { ...webPreferences, backgroundThrottling: false },
  })
  if (display) window.setAlwaysOnTop(true, 'screen-saver')
  window.once('ready-to-show', () => window.showInactive())
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

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let isQuitting = false

  app.whenReady().then(() => {
    serveMedia()
    engine.start()
    handleWindowRequests()
    const operator = createOperatorWindow()
    outputs.forEach((profile, index) => createOutputWindow(profile, index))
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
