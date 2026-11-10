// IPC surface shared by every renderer window. All privileged work stays here
// in the main process; renderers only ever receive plain JSON.
import { clipboard, ipcMain, shell } from 'electron'

export function registerIpc({ messenger, windows }) {
  const handle = (channel, handler) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await handler(event, payload)
      } catch (error) {
        console.error(`[ipc] ${channel}:`, error?.message || error)
        throw new Error(error?.message || 'Something went wrong.')
      }
    })
  }

  handle('idaz:bootstrap', () => messenger.bootstrap())
  handle('idaz:search', (_event, { query, limit } = {}) =>
    messenger.search(String(query || ''), Number(limit) || 40),
  )

  handle('idaz:chat:get', (_event, { peerId } = {}) => messenger.getChat(String(peerId || '')))
  handle('idaz:chat:older', (_event, { peerId } = {}) => messenger.loadOlder(String(peerId || '')))
  handle('idaz:chat:read', (_event, { peerId } = {}) => messenger.markRead(String(peerId || '')))
  handle('idaz:chat:clearUnread', (_event, { peerId } = {}) => messenger.clearUnread(String(peerId || '')))
  handle('idaz:chat:clearHistory', () => messenger.clearHistory())
  handle('idaz:chat:mute', (_event, { peerId, muted } = {}) =>
    messenger.setMuted(String(peerId || ''), !!muted),
  )
  handle('idaz:chat:send', (_event, { peerId, text } = {}) =>
    messenger.sendText(String(peerId || ''), String(text || '')),
  )
  handle('idaz:chat:attach', (_event, { peerId } = {}) => messenger.attach(String(peerId || '')))
  handle('idaz:chat:typing', (_event, { peerId, typing } = {}) =>
    messenger.typingToPeer(String(peerId || ''), !!typing),
  )

  handle('idaz:media:get', (_event, { peerId, messageId } = {}) =>
    messenger.getMedia(String(peerId || ''), String(messageId || '')),
  )
  handle('idaz:media:download', (_event, { peerId, messageId } = {}) =>
    messenger.ensureMedia(String(peerId || ''), String(messageId || '')),
  )
  handle('idaz:media:save', (_event, { peerId, messageId } = {}) =>
    messenger.saveMedia(String(peerId || ''), String(messageId || '')),
  )
  handle('idaz:media:reveal', (_event, { peerId, messageId } = {}) =>
    messenger.revealMedia(String(peerId || ''), String(messageId || '')),
  )
  handle('idaz:media:openPath', async (_event, { peerId, messageId } = {}) => {
    const info = await messenger.ensureMedia(String(peerId || ''), String(messageId || ''))
    const message = messenger.store.findMessage(String(peerId || ''), String(messageId || ''))
    if (!message?.media?.localPath) return { ok: false }
    const error = await shell.openPath(messenger.media.pathFor(message.media.localPath))
    return error ? { ok: false, error } : { ok: true, url: info.url }
  })

  handle('idaz:clipboard:copyMessage', (_event, { peerId, messageId } = {}) => {
    const message = messenger.store.findMessage(String(peerId || ''), String(messageId || ''))
    const text = typeof message?.text === 'string' ? message.text : ''
    if (!text) return { ok: false, error: 'This message has no text to copy.' }
    clipboard.writeText(text)
    return { ok: true }
  })

  handle('idaz:window:chat', (_event, { peerId, messageId } = {}) => {
    windows.openChat(String(peerId || ''), messageId ? String(messageId) : undefined)
    return { ok: true }
  })
  handle('idaz:window:profile', (_event, { peerId } = {}) => {
    windows.openProfile(String(peerId || ''))
    return { ok: true }
  })
  handle('idaz:window:login', () => {
    windows.openLogin()
    return { ok: true }
  })
  handle('idaz:window:media', (_event, { peerId, messageId } = {}) => {
    windows.openViewer(String(peerId || ''), String(messageId || ''))
    return { ok: true }
  })

  handle('idaz:settings:update', (_event, { patch } = {}) => messenger.updateSettings(patch || {}))

  handle('idaz:app:openExternal', async (_event, { url } = {}) => {
    const target = String(url || '')
    if (!/^https?:\/\//i.test(target)) throw new Error('Only http(s) links can be opened.')
    await shell.openExternal(target)
    return { ok: true }
  })

  handle('idaz:auth:start', (_event, { service, mode, phone } = {}) =>
    messenger.startLogin(String(service || ''), String(mode || 'qr'), { phone }),
  )
  handle('idaz:auth:answer', (_event, { id, value } = {}) =>
    messenger.answerPrompt(String(id || ''), value),
  )
  handle('idaz:auth:cancel', (_event, { service } = {}) => messenger.cancelLogin(String(service || '')))
  handle('idaz:auth:logout', (_event, { service } = {}) => messenger.logout(String(service || '')))

  ipcMain.on('idaz:window:control', (event, action) => {
    windows.control(event, String(action || ''))
  })
  ipcMain.on('idaz:window:close', (event) => {
    windows.closeFromEvent(event)
  })
}
