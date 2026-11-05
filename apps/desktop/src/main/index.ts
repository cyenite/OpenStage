import { join } from 'node:path'
import { app, BrowserWindow, screen, type BrowserWindowConstructorOptions } from 'electron'
import { outputs, type OutputProfile } from '@openstage/engine'
import { EngineHost } from './engine-host'

if (process.env['OPENSTAGE_USER_DATA']) app.setPath('userData', process.env['OPENSTAGE_USER_DATA'])

const engine = new EngineHost()
const forceWindowedOutputs = process.env['OPENSTAGE_WINDOWED_OUTPUTS'] === '1'

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

function createOperatorWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: 'OpenStage',
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0E0E10',
    webPreferences,
  })
  engine.attach(window.webContents, { role: 'operator' })
  load(window, 'operator')
  window.on('closed', () => app.quit())
  return window
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

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let isQuitting = false

  app.whenReady().then(() => {
    engine.start()
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
