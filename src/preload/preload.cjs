const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_EVENTS = new Set([
  'idaz:roster:update',
  'idaz:accounts:update',
  'idaz:chat:append',
  'idaz:chat:patch',
  'idaz:chat:peer',
  'idaz:chat:cleared',
  'idaz:chat:typing',
  'idaz:chat:focusMessage',
  'idaz:media:update',
  'idaz:auth:prompt',
  'idaz:settings:update',
  'idaz:sound:play',
])

contextBridge.exposeInMainWorld('idaz', {
  invoke: (channel, payload) => {
    if (typeof channel !== 'string' || !channel.startsWith('idaz:')) {
      return Promise.reject(new Error('Blocked IPC channel'))
    }
    return ipcRenderer.invoke(channel, payload)
  },
  on: (channel, callback) => {
    if (!ALLOWED_EVENTS.has(channel) || typeof callback !== 'function') return () => {}
    const listener = (_event, data) => {
      try {
        callback(data)
      } catch (error) {
        console.error('[bridge] listener failed:', error)
      }
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  control: (action) => ipcRenderer.send('idaz:window:control', action),
  closeWindow: () => ipcRenderer.send('idaz:window:close'),
  platform: process.platform,
})
