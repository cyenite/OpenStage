import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Chrome, ScreensState, WindowState } from '../chrome'

// MessagePorts cannot cross contextBridge, so the port is handed to the page with window.postMessage.
ipcRenderer.on('engine-port', (event, hello) => {
  window.postMessage({ type: 'openstage:engine-port', hello }, '*', event.ports)
})

const chrome: Chrome = {
  platform: process.platform,
  pathForFile: (file) => webUtils.getPathForFile(file),
  setTheme: (source) => ipcRenderer.send('theme', source),
  windowAction: (action) => ipcRenderer.send('window', action),
  onWindowState: (listener) => {
    const forward = (_event: unknown, state: WindowState) => listener(state)
    ipcRenderer.on('window-state', forward)
    return () => void ipcRenderer.removeListener('window-state', forward)
  },
  getScreens: () => ipcRenderer.invoke('screens'),
  chooseScreen: (outputId, choice) => ipcRenderer.send('screen-choice', outputId, choice),
  onScreens: (listener) => {
    const forward = (_event: unknown, state: ScreensState) => listener(state)
    ipcRenderer.on('screens', forward)
    return () => void ipcRenderer.removeListener('screens', forward)
  },
}

contextBridge.exposeInMainWorld('openstageChrome', chrome)
