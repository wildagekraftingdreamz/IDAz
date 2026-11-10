// All BrowserWindow management: the roster, one floating window per chat, the
// account/login window and the fullscreen media viewer.
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, dialog, shell } from 'electron'

const here = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD = path.join(here, '..', 'preload', 'preload.cjs')
const RENDERER = path.join(here, '..', '..', 'dist-renderer', 'index.html')
const DEV_URL = process.env.VITE_DEV_SERVER_URL
const ICON = path.join(here, '..', '..', 'build', 'icon.png')

let mainWindow = null
const chatWindows = new Map()
let loginWindow = null
let viewerWindow = null
let profileWindow = null
let cascade = 0

function loadRoute(win, route) {
  if (DEV_URL) {
    win.loadURL(`${DEV_URL}/#${route}`)
  } else {
    win.loadFile(RENDERER, { hash: route })
  }
}

function baseOptions(extra = {}) {
  return {
    frame: false,
    show: false,
    backgroundColor: '#081d1a',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webSecurity: true,
    },
    ...extra,
  }
}

function instrument(win, label) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (process.env.IDAZ_DEBUG) {
    win.webContents.on('console-message', (...args) => {
      const first = args[0]
      const message = first && typeof first === 'object' && 'message' in first ? first.message : args[2]
      const level = first && typeof first === 'object' && 'level' in first ? first.level : args[1]
      console.log(`[renderer:${label}] (${level}) ${message}`)
    })
    win.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error(`[preload:${label}] ${preloadPath}: ${error?.message || error}`)
    })
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[renderer:${label}] gone:`, details)
    })
  }
  win.once('ready-to-show', () => {
    win.show()
    if (label === 'main') win.focus()
  })
  win.on('closed', () => {
    if (label === 'main') mainWindow = null
  })
}

export class Windows {
  createMain() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
      return mainWindow
    }
    const win = new BrowserWindow(
      baseOptions({
        width: 376,
        height: 728,
        minWidth: 330,
        minHeight: 470,
        resizable: true,
        maximizable: true,
        title: 'IDAz',
      }),
    )
    mainWindow = win
    instrument(win, 'main')
    loadRoute(win, '/')
    win.on('closed', () => {
      mainWindow = null
      app.quit()
    })
    return win
  }

  get main() {
    return mainWindow
  }

  openChat(peerId, messageId) {
    const existing = chatWindows.get(peerId)
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      if (messageId) existing.webContents.send('idaz:chat:focusMessage', { messageId: String(messageId) })
      return existing
    }
    const bounds = mainWindow?.getBounds()
    const win = new BrowserWindow(
      baseOptions({
        width: 668,
        height: 592,
        minWidth: 430,
        minHeight: 340,
        resizable: true,
        title: 'IDAz chat',
        ...(bounds
          ? {
              x: Math.min(bounds.x + bounds.width + 12 + cascade * 22, 2400),
              y: Math.max(40, bounds.y + 20 + cascade * 22),
            }
          : {}),
      }),
    )
    cascade = (cascade + 1) % 8
    chatWindows.set(peerId, win)
    instrument(win, `chat:${peerId}`)
    const target = messageId ? `?m=${encodeURIComponent(messageId)}` : ''
    loadRoute(win, `/chat/${encodeURIComponent(peerId)}${target}`)
    win.on('closed', () => {
      if (chatWindows.get(peerId) === win) chatWindows.delete(peerId)
    })
    return win
  }

  openProfile(peerId) {
    const route = `/profile/${encodeURIComponent(peerId)}`
    if (profileWindow && !profileWindow.isDestroyed()) {
      loadRoute(profileWindow, route)
      profileWindow.show()
      profileWindow.focus()
      return profileWindow
    }
    const bounds = mainWindow?.getBounds()
    const win = new BrowserWindow(
      baseOptions({
        width: 372,
        height: 486,
        minWidth: 340,
        minHeight: 420,
        resizable: true,
        title: 'IDAz — Profile',
        ...(bounds
          ? {
              x: Math.min(bounds.x + bounds.width + 12, 2400),
              y: Math.max(40, bounds.y + 96),
            }
          : {}),
      }),
    )
    profileWindow = win
    instrument(win, `profile:${peerId}`)
    loadRoute(win, route)
    win.on('closed', () => {
      if (profileWindow === win) profileWindow = null
    })
    return win
  }

  openLogin() {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.show()
      loginWindow.focus()
      return loginWindow
    }
    const win = new BrowserWindow(
      baseOptions({
        width: 500,
        height: 690,
        minWidth: 440,
        minHeight: 600,
        resizable: true,
        title: 'IDAz — Link an account',
      }),
    )
    loginWindow = win
    instrument(win, 'login')
    loadRoute(win, '/login')
    win.on('closed', () => {
      if (loginWindow === win) loginWindow = null
    })
    return win
  }

  openViewer(peerId, messageId) {
    if (viewerWindow && !viewerWindow.isDestroyed()) {
      loadRoute(viewerWindow, `/viewer/${encodeURIComponent(peerId)}/${encodeURIComponent(messageId)}`)
      viewerWindow.show()
      viewerWindow.focus()
      return viewerWindow
    }
    const win = new BrowserWindow(
      baseOptions({
        width: 1100,
        height: 760,
        fullscreen: true,
        frame: false,
        resizable: true,
        backgroundColor: '#000000',
        title: 'IDAz media',
      }),
    )
    viewerWindow = win
    win.setMenuBarVisibility(false)
    instrument(win, 'viewer')
    loadRoute(win, `/viewer/${encodeURIComponent(peerId)}/${encodeURIComponent(messageId)}`)
    win.on('closed', () => {
      if (viewerWindow === win) viewerWindow = null
    })
    return win
  }

  isChatFocused(peerId) {
    const win = chatWindows.get(peerId)
    return !!win && !win.isDestroyed() && win.isFocused()
  }

  hasOpenChat(peerId) {
    const win = chatWindows.get(peerId)
    return !!win && !win.isDestroyed()
  }

  broadcast(channel, payload) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }

  sendToMain(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  }

  notify(peerId, title, body, settings) {
    this.sendToMain('idaz:sound:play', { name: 'message', settings })
    const win = chatWindows.get(peerId) || mainWindow
    if (win && !win.isDestroyed()) {
      win.flashFrame(true)
      win.once('focus', () => {
        if (!win.isDestroyed()) win.flashFrame(false)
      })
    }
  }

  setUnreadBadge(count) {
    if (process.platform === 'darwin' || process.platform === 'linux') {
      try {
        app.setBadgeCount(Math.max(0, Number(count) || 0))
      } catch {
        // unsupported on some Linux desktops
      }
    }
  }

  flashMain() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.flashFrame(true)
      mainWindow.once('focus', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false)
      })
    }
  }

  async pickFiles() {
    const parent = mainWindow || undefined
    const result = await dialog.showOpenDialog(parent, {
      title: 'Send a file',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'ogg', 'wav', 'm4a'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    return result.canceled ? [] : result.filePaths
  }

  async saveFileDialog(defaultName) {
    const parent = viewerWindow || mainWindow || undefined
    const result = await dialog.showSaveDialog(parent, {
      title: 'Save media',
      defaultPath: defaultName,
    })
    return result.canceled || !result.filePath ? null : result.filePath
  }

  revealFile(filePath) {
    shell.showItemInFolder(filePath)
  }

  closeFromEvent(event) {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    if (win === mainWindow) app.quit()
    else win.close()
  }

  control(event, action) {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    } else if (action === 'close') {
      if (win === mainWindow) app.quit()
      else win.close()
    }
  }
}
