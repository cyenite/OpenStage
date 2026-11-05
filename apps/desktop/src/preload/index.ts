import { ipcRenderer } from 'electron'

// MessagePorts cannot cross contextBridge, so the port is handed to the page with window.postMessage.
ipcRenderer.on('engine-port', (event, hello) => {
  window.postMessage({ type: 'openstage:engine-port', hello }, '*', event.ports)
})
