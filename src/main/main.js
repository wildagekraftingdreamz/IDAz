import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, Menu } from 'electron'
import { registerMediaScheme, MediaStore, serveMedia } from './media.js'
import { Store } from './store.js'
import { Messenger } from './messenger.js'
import { Windows } from './windows.js'
import { registerIpc } from './ipc.js'
import { seedDemo } from './demo.js'

registerMediaScheme()
app.setName('IDAz')

const demoMode = process.argv.includes('--demo') || process.env.IDAZ_DEMO === '1'
// Demo runs must never touch a real account's sessions or history.
app.setPath(
  'userData',
  demoMode ? path.join(app.getPath('temp'), 'IDAz-demo') : path.join(app.getPath('appData'), 'IDAz'),
)
let windows = null
let messenger = null
let store = null

async function checkSdkImports() {
  const result = {}
  try {
    const baileys = await import('@whiskeysockets/baileys')
    result.baileys =
      typeof baileys.makeWASocket === 'function' && typeof baileys.getContentType === 'function'
  } catch (error) {
    result.baileys = `FAILED: ${error?.message || error}`
  }
  try {
    const { createRequire } = await import('node:module')
    const req = createRequire(import.meta.url)
    const telegram = req('telegram')
    const sessions = req('telegram/sessions')
    result.telegram =
      typeof telegram.TelegramClient === 'function' && typeof sessions.StringSession === 'function'
  } catch (error) {
    result.telegram = `FAILED: ${error?.message || error}`
  }
  return result
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  )
}

async function boot() {
  buildMenu()

  const userData = app.getPath('userData')
  store = new Store(userData)
  const media = new MediaStore(path.join(userData, 'media'))
  serveMedia(media)

  windows = new Windows()
  messenger = new Messenger({
    store,
    media,
    windows,
    sessionsDir: path.join(userData, 'sessions'),
    version: app.getVersion(),
    demo: demoMode,
  })

  if (demoMode) seedDemo(store, media)

  registerIpc({ messenger, windows })

  windows.createMain()
  await messenger.init()

  const accounts = store.data.accounts
  if (!demoMode && !accounts.whatsapp?.linked && !accounts.telegram?.linked) {
    windows.openLogin()
  }

  if (process.env.IDAZ_SMOKE === '1' && demoMode) {
    windows.openChat('demo:mira')
    setTimeout(() => windows.openViewer('demo:mira', 'demo:m4'), 900)
    setTimeout(async () => {
      let themeCheck = null
      try {
        const mainWin = windows.main
        if (mainWin && !mainWin.isDestroyed()) {
          await mainWin.webContents.executeJavaScript(
            `window.idaz.invoke('idaz:settings:update', { patch: { skin: 'classic', fontSize: 'lg' } })`,
          )
          await new Promise((resolve) => setTimeout(resolve, 450))
          themeCheck = await mainWin.webContents.executeJavaScript(`(() => ({
            skin: document.documentElement.dataset.skin,
            font: document.documentElement.dataset.font,
            bodyFont: getComputedStyle(document.body).fontSize,
            bodyBg: getComputedStyle(document.body).backgroundColor,
            titlebar: getComputedStyle(document.querySelector('.titlebar')).backgroundImage.slice(0, 70)
          }))()`)
          await mainWin.webContents.executeJavaScript(
            `window.idaz.invoke('idaz:settings:update', { patch: { skin: 'teal', fontSize: 'md' } })`,
          )
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      } catch (error) {
        themeCheck = { error: String(error?.message || error) }
      }

      const report = []
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          const info = await win.webContents.executeJavaScript(`(() => ({
            hash: location.hash,
            rows: document.querySelectorAll('[data-contact-row]').length,
            bubbles: document.querySelectorAll('[data-message-bubble]').length,
            images: Array.from(document.images).map(i => ({ w: i.naturalWidth, h: i.naturalHeight })).slice(0, 3),
            text: (document.querySelector('#root')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 260),
            bg: getComputedStyle(document.body).backgroundColor,
            font: getComputedStyle(document.body).fontSize
          }))()`)
          report.push({ url: win.webContents.getURL(), ...info })
        } catch (error) {
          report.push({ url: win.webContents.getURL(), error: String(error?.message || error) })
        }
      }
      const sdkCheck = await checkSdkImports()

      let historyCheck = null
      try {
        const mainWin = windows.main
        if (mainWin && !mainWin.isDestroyed()) {
          historyCheck = await mainWin.webContents.executeJavaScript(`(async () => {
            const before = (await window.idaz.invoke('idaz:chat:get', { peerId: 'demo:mira' })).messages.length
            const cleared = await window.idaz.invoke('idaz:chat:clearHistory')
            const after = (await window.idaz.invoke('idaz:chat:get', { peerId: 'demo:mira' })).messages.length
            await new Promise((resolve) => setTimeout(resolve, 600))
            return { before, after, cleared, rows: document.querySelectorAll('[data-contact-row]').length }
          })()`)
          const chatWin = BrowserWindow.getAllWindows().find((win) =>
            win.webContents.getURL().includes('#/chat/'),
          )
          if (chatWin) {
            historyCheck.bubblesAfterClear = await chatWin.webContents.executeJavaScript(
              `document.querySelectorAll('[data-message-bubble]').length`,
            )
          }
        }
      } catch (error) {
        historyCheck = { error: String(error?.message || error) }
      }

      const payload = { themeCheck, sdkCheck, historyCheck, windows: report }
      if (process.env.IDAZ_SMOKE_OUT) {
        try {
          fs.writeFileSync(process.env.IDAZ_SMOKE_OUT, JSON.stringify(payload, null, 2))
        } catch (error) {
          console.error('[smoke] could not write report:', error)
        }
      }
      console.log('[smoke]', JSON.stringify(payload, null, 2))
      app.quit()
    }, 4200)
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (windows) windows.createMain()
  })

  app.whenReady().then(boot).catch((error) => {
    console.error('[idaz] failed to start:', error)
    app.quit()
  })

  app.on('activate', () => {
    if (windows && BrowserWindow.getAllWindows().length === 0) windows.createMain()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    if (store) store.flush()
    if (messenger) messenger.shutdown()
  })
}
