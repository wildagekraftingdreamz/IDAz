// The messenger core: owns both adapters, normalizes their events into the
// store, and keeps every window in sync over IPC.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { WhatsAppAdapter } from './adapters/whatsapp.js'
import { TelegramAdapter } from './adapters/telegram.js'
import { extFromMime, extFromName, kindFromExt, mimeFromExt, previewFor, safeBaseName } from './util.js'

const SERVICE_NAMES = { whatsapp: 'WhatsApp', telegram: 'Telegram' }

function stripMessage(message) {
  if (!message) return message
  const { raw, key, ...rest } = message
  return rest
}

export class Messenger {
  constructor({ store, media, windows, sessionsDir, version, demo = false }) {
    this.store = store
    this.media = media
    this.windows = windows
    this.version = version
    this.demo = demo
    this.typing = new Map()
    this.prompts = new Map()
    this.downloads = new Map()
    this.refreshTimes = new Map()

    this.accounts = {
      whatsapp: { state: 'off', detail: '', qr: null, linked: false, name: null, phone: null },
      telegram: { state: 'off', detail: '', qr: null, linked: false, name: null, phone: null },
    }
    for (const service of ['whatsapp', 'telegram']) {
      const saved = this.store.data.accounts[service]
      if (saved) {
        this.accounts[service].linked = !!saved.linked
        this.accounts[service].name = saved.name || null
        this.accounts[service].phone = saved.phone || null
      }
    }

    this.adapters = {
      whatsapp: new WhatsAppAdapter({
        sessionFile: path.join(sessionsDir, 'whatsapp.json'),
        ctx: this.adapterContext('whatsapp'),
      }),
      telegram: new TelegramAdapter({
        sessionFile: path.join(sessionsDir, 'telegram.session'),
        ctx: this.adapterContext('telegram'),
        getSettings: () => this.store.settings,
      }),
    }
  }

  adapterContext(service) {
    return {
      status: (state, detail) => this.setStatus(service, state, detail),
      qr: (text) => this.setQr(service, text),
      self: (info) => this.setSelf(service, info),
      peer: (peer) => this.upsertPeer(peer),
      name: (peerId, name) => this.renamePeer(peerId, name),
      message: (peer, message, options) => this.ingest(peer, message, options),
      patch: (peerId, remoteId, patch) => this.patchRemote(peerId, remoteId, patch),
      typing: (peerId, typing) => this.setTyping(peerId, typing),
      readOut: (peerId, maxRemoteId) => this.markOutgoingRead(peerId, maxRemoteId),
      ask: (request) => this.ask(request),
      getSettings: () => this.store.settings,
      peerMeta: (peerId) => this.store.peer(peerId),
      chatFocused: (peerId) => this.windows.isChatFocused(peerId),
      markRead: (peerId) => this.markRead(peerId),
    }
  }

  async init() {
    if (this.demo) return
    await Promise.all(
      Object.values(this.adapters).map((adapter) => adapter.init().catch((error) => {
        console.error('[messenger] adapter init failed:', error?.message || error)
      })),
    )
  }

  async shutdown() {
    this.store.flush()
    for (const adapter of Object.values(this.adapters)) {
      try {
        await adapter.disconnect?.()
      } catch {
        // ignore
      }
    }
  }

  bootstrap() {
    return {
      settings: this.store.settings,
      accounts: this.accountsView(),
      peers: this.roster(),
      platform: process.platform,
      version: this.version,
      demo: this.demo,
    }
  }

  accountsView() {
    const view = {}
    for (const service of ['whatsapp', 'telegram']) {
      const account = this.accounts[service]
      view[service] = {
        state: account.state,
        detail: account.detail || '',
        qr: account.qr || null,
        linked: account.linked,
        name: account.name || null,
        phone: account.phone || null,
        label: SERVICE_NAMES[service],
      }
    }
    return view
  }

  /* ------------------------------------------------------------ accounts */

  setStatus(service, state, detail = '') {
    const account = this.accounts[service]
    if (!account) return
    const changed = account.state !== state || account.detail !== detail
    account.state = state
    account.detail = detail || ''
    if (state !== 'qr') account.qr = null
    if (state === 'logged_out') {
      account.linked = false
      this.store.setAccount(service, { linked: false, name: null, id: null, phone: null })
    }
    const adapter = this.adapters?.[service]
    if (adapter) adapter.status = state
    if (changed || state === 'qr') this.windows.broadcast('idaz:accounts:update', this.accountsView())
  }

  async setQr(service, text) {
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        margin: 1,
        width: 360,
        errorCorrectionLevel: 'M',
        color: { dark: '#062b24', light: '#e8fff4' },
      })
      this.accounts[service].qr = dataUrl
      this.windows.broadcast('idaz:accounts:update', this.accountsView())
    } catch (error) {
      console.error('[messenger] qr render failed:', error.message)
    }
  }

  setSelf(service, info) {
    const account = this.accounts[service]
    account.linked = true
    account.name = info.name || account.name
    account.phone = info.phone || account.phone
    this.store.setAccount(service, {
      linked: true,
      name: account.name,
      id: info.id || null,
      phone: account.phone,
    })
    this.store.save()
    this.windows.broadcast('idaz:accounts:update', this.accountsView())
  }

  async startLogin(service, mode = 'qr', payload = {}) {
    const adapter = this.adapters[service]
    if (!adapter) throw new Error('Unknown service')
    this.accounts[service].state = 'connecting'
    this.accounts[service].detail = ''
    this.windows.broadcast('idaz:accounts:update', this.accountsView())
    try {
      const result = service === 'whatsapp' ? await adapter.startLogin() : await adapter.startLogin(mode, payload)
      return result || { ok: true }
    } catch (error) {
      const message = error?.message || String(error)
      this.setStatus(service, 'error', message)
      return { ok: false, error: message }
    }
  }

  answerPrompt(id, value) {
    const prompt = this.prompts.get(id)
    if (!prompt) return { ok: false, error: 'That prompt expired.' }
    prompt.resolve(String(value ?? ''))
    return { ok: true }
  }

  async cancelLogin(service) {
    for (const [id, prompt] of this.prompts) {
      if (prompt.service === service) {
        prompt.reject(new Error('Sign-in cancelled.'))
        this.prompts.delete(id)
      }
    }
    const adapter = this.adapters[service]
    if (adapter?.cancelLogin) await adapter.cancelLogin().catch(() => {})
    this.setStatus(service, 'off', 'Sign-in cancelled.')
    return { ok: true }
  }

  async logout(service) {
    const adapter = this.adapters[service]
    if (!adapter) return { ok: false }
    await adapter.logout().catch(() => {})
    this.store.setAccount(service, { linked: false, name: null, id: null, phone: null })
    this.accounts[service] = {
      state: 'logged_out',
      detail: 'Signed out.',
      qr: null,
      linked: false,
      name: null,
      phone: null,
    }
    this.clearService(service)
    this.windows.broadcast('idaz:accounts:update', this.accountsView())
    this.sendRoster()
    return { ok: true }
  }

  ask({ service, kind, hint }) {
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      const timer = setTimeout(() => {
        this.prompts.delete(id)
        reject(new Error('Timed out waiting for sign-in details.'))
      }, 5 * 60 * 1000)
      if (typeof timer.unref === 'function') timer.unref()
      this.prompts.set(id, {
        service,
        resolve: (value) => {
          clearTimeout(timer)
          this.prompts.delete(id)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          this.prompts.delete(id)
          reject(error)
        },
      })
      this.windows.broadcast('idaz:auth:prompt', {
        id,
        service,
        kind,
        hint: hint || '',
        at: Date.now(),
      })
    })
  }

  /* --------------------------------------------------------------- peers */

  upsertPeer(info) {
    const peer = this.store.upsertPeer({
      id: info.id,
      service: info.service,
      name: info.name,
      isGroup: info.isGroup,
      unread: info.unread,
      meta: info.meta,
    })
    if (info.unread !== undefined) this.sendRoster()
    return peer
  }

  renamePeer(peerId, name) {
    const existing = this.store.peer(peerId)
    if (!existing || !name || existing.name === name) return
    this.store.patchPeer(peerId, { name })
    this.sendRoster()
    this.windows.broadcast('idaz:chat:peer', { peerId, peer: this.peerView(this.store.peer(peerId)) })
  }

  peerView(peer) {
    if (!peer) return null
    return {
      id: peer.id,
      service: peer.service,
      name: peer.name,
      isGroup: !!peer.isGroup,
      unread: peer.unread || 0,
      lastTs: peer.lastTs || 0,
      lastPreview: peer.lastPreview || '',
      lastFromMe: !!peer.lastFromMe,
      muted: !!peer.muted,
      typing: this.isTyping(peer.id),
      username: peer.meta?.username || null,
    }
  }

  roster() {
    return Object.values(this.store.peers)
      .filter((peer) => (peer.lastTs || 0) > 0 || (peer.unread || 0) > 0)
      .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0))
      .map((peer) => this.peerView(peer))
  }

  search(query, limit = 40) {
    const needle = String(query || '').trim().toLowerCase()
    if (needle.length < 2) return []
    const max = Math.min(Math.max(Number(limit) || 40, 1), 100)
    const hits = []
    for (const peer of Object.values(this.store.peers)) {
      for (const message of this.store.messages(peer.id)) {
        const mediaName = message.media?.name || ''
        const source = message.text || mediaName
        if (!source) continue
        if (!`${source} ${mediaName}`.toLowerCase().includes(needle)) continue
        hits.push({
          peerId: peer.id,
          peerName: peer.name,
          service: peer.service,
          messageId: message.id,
          ts: message.ts || 0,
          fromMe: !!message.fromMe,
          kind: message.kind || 'text',
          author: message.author || null,
          hasText: !!message.text,
          text: source.length > 180 ? `${source.slice(0, 177)}…` : source,
        })
      }
    }
    return hits.sort((a, b) => b.ts - a.ts).slice(0, max)
  }

  clientMessage(message) {
    const clean = stripMessage(message)
    if (clean?.media?.localPath) {
      clean.media = { ...clean.media, url: this.media.urlFor(clean.media.localPath) }
    }
    return clean
  }

  sendRoster() {
    const peers = this.roster()
    this.windows.broadcast('idaz:roster:update', peers)
    this.windows.setUnreadBadge(peers.reduce((sum, peer) => sum + (peer.unread || 0), 0))
  }

  /* ------------------------------------------------------------ messages */

  ingest(peerInfo, message, { notify = false, unread, seed = false } = {}) {
    if (!message?.peerId) return
    const focused = this.windows.isChatFocused(message.peerId)
    const peer = this.store.upsertPeer({
      id: message.peerId,
      service: message.service || peerInfo.service,
      name: peerInfo.name,
      isGroup: peerInfo.isGroup,
      meta: peerInfo.meta,
    })

    if (unread !== undefined) peer.unread = unread
    if (!message.fromMe && !seed && !focused) peer.unread = (peer.unread || 0) + 1

    const preview = previewFor(message.kind, message.text, message.media?.name)
    if ((message.ts || 0) >= (peer.lastTs || 0)) {
      peer.lastTs = message.ts || Date.now()
      peer.lastPreview = preview
      peer.lastFromMe = !!message.fromMe
    }

    const result = this.store.appendMessage(message)
    this.store.save()

    if (result.added) {
      this.windows.broadcast('idaz:chat:append', {
        peerId: message.peerId,
        messages: [this.clientMessage(result.message)],
      })
    } else if (!message.fromMe && result.message && message.remoteId) {
      this.store.patchMessage(message.peerId, result.message.id, {
        status: message.status,
        text: message.text || result.message.text,
      })
    }

    this.sendRoster()

    if (!message.fromMe) {
      if (focused) {
        this.markRead(message.peerId)
      } else if (notify && !peer.muted) {
        this.windows.notify(message.peerId, peer.name, preview, this.store.settings)
      }
    }
  }

  patchRemote(peerId, remoteId, patch) {
    const message = this.store.patchByRemote(peerId, remoteId, patch)
    if (message) {
      this.windows.broadcast('idaz:chat:patch', {
        peerId,
        messageId: message.id,
        patch,
      })
    }
  }

  patchLocal(peerId, messageId, patch) {
    const message = this.store.patchMessage(peerId, messageId, patch)
    if (message) {
      this.windows.broadcast('idaz:chat:patch', { peerId, messageId, patch })
    }
    return message
  }

  markOutgoingRead(peerId, maxRemoteId) {
    const limit = Number(maxRemoteId)
    if (!Number.isFinite(limit)) return
    const messages = this.store.messages(peerId)
    for (const message of messages) {
      if (!message.fromMe || message.status === 'read') continue
      const remote = Number(message.remoteId)
      if (Number.isFinite(remote) && remote <= limit) {
        message.status = 'read'
        this.windows.broadcast('idaz:chat:patch', {
          peerId,
          messageId: message.id,
          patch: { status: 'read' },
        })
      }
    }
    this.store.save()
  }

  getChat(peerId) {
    const peer = this.store.peer(peerId)
    if (!peer) return { peer: null, messages: [], hasMore: false }
    this.refreshHistory(peerId)
    return {
      peer: this.peerView(peer),
      messages: this.store.messages(peerId).map((message) => this.clientMessage(message)),
      hasMore: peer.service === 'telegram',
    }
  }

  refreshHistory(peerId) {
    const peer = this.store.peer(peerId)
    if (!peer) return
    const adapter = this.adapters[peer.service]
    if (!adapter?.connected) return
    const last = this.refreshTimes.get(peerId) || 0
    if (Date.now() - last < 5000) return
    this.refreshTimes.set(peerId, Date.now())
    adapter.loadHistory(peerId, { limit: 60 }).catch(() => {})
  }

  async loadOlder(peerId) {
    const peer = this.store.peer(peerId)
    if (!peer) return { ok: false, error: 'Unknown chat.' }
    const adapter = this.adapters[peer.service]
    if (!adapter?.connected) return { ok: false, error: `${SERVICE_NAMES[peer.service]} is not connected.` }
    if (peer.service === 'whatsapp') return { ok: false, error: 'WhatsApp history is synced automatically.' }
    const oldest = this.store
      .messages(peerId)
      .filter((message) => message.remoteId && Number.isFinite(Number(message.remoteId)))
      .sort((a, b) => Number(a.remoteId) - Number(b.remoteId))[0]
    if (!oldest) return { ok: false, error: 'No older messages.' }
    const loaded = await adapter.loadHistory(peerId, { limit: 40, olderThan: Number(oldest.remoteId) })
    return { ok: true, count: loaded.length }
  }

  async markRead(peerId, { sendReceipt = true } = {}) {
    const peer = this.store.peer(peerId)
    if (!peer) return { ok: false }
    if (peer.unread) {
      peer.unread = 0
      this.store.save()
      this.sendRoster()
      this.windows.broadcast('idaz:chat:peer', { peerId, peer: this.peerView(peer) })
    }
    const adapter = this.adapters[peer.service]
    if (sendReceipt && adapter?.connected) {
      adapter.markRead(peerId, this.store.messages(peerId)).catch(() => {})
    }
    return { ok: true }
  }

  async clearUnread(peerId) {
    return this.markRead(peerId, { sendReceipt: false })
  }

  /** Wipes stored conversations and tells every open window to empty itself. */
  clearHistory() {
    const counts = this.store.clearHistory()
    this.typing.clear()
    this.refreshTimes.clear()
    for (const peer of Object.values(this.store.peers)) {
      this.windows.broadcast('idaz:chat:cleared', { peerId: peer.id })
      this.windows.broadcast('idaz:chat:peer', { peerId: peer.id, peer: this.peerView(peer) })
    }
    this.sendRoster()
    return { ok: true, messages: counts.messages, peers: counts.peers }
  }

  setMuted(peerId, muted) {
    const peer = this.store.peer(peerId)
    if (!peer) return { ok: false, error: 'Unknown chat.' }
    this.store.patchPeer(peerId, { muted: !!muted })
    const view = this.peerView(this.store.peer(peerId))
    this.sendRoster()
    this.windows.broadcast('idaz:chat:peer', { peerId, peer: view })
    return { ok: true, peer: view }
  }

  /* ------------------------------------------------------------ sending */

  async sendText(peerId, text) {
    const clean = String(text || '').replace(/\u0000/g, '').trim()
    if (!clean) return { ok: false, error: 'Nothing to send.' }
    const peer = this.store.peer(peerId)
    if (!peer) return { ok: false, error: 'Unknown chat.' }
    const adapter = this.adapters[peer.service]
    if (!adapter?.connected) return { ok: false, error: `${SERVICE_NAMES[peer.service]} is not connected.` }

    const base = {
      id: `local:${randomUUID()}`,
      peerId,
      service: peer.service,
      fromMe: true,
      ts: Date.now(),
      kind: 'text',
      text: clean,
    }
    try {
      const sent = await adapter.sendText(peerId, clean)
      const message = {
        ...base,
        remoteId: sent.id || undefined,
        status: 'sent',
        ts: sent.ts || base.ts,
      }
      this.ingest(
        { id: peerId, service: peer.service, name: peer.name, isGroup: peer.isGroup, meta: peer.meta },
        message,
        { seed: true },
      )
      this.windows.sendToMain('idaz:sound:play', { name: 'send', settings: this.store.settings })
      return { ok: true, message: this.clientMessage(message) }
    } catch (error) {
      const message = { ...base, status: 'failed' }
      this.ingest(
        { id: peerId, service: peer.service, name: peer.name, isGroup: peer.isGroup, meta: peer.meta },
        message,
        { seed: true },
      )
      return { ok: false, error: error?.message || 'Send failed.' }
    }
  }

  async attach(peerId) {
    const peer = this.store.peer(peerId)
    if (!peer) return { ok: false, error: 'Unknown chat.' }
    const files = await this.windows.pickFiles()
    if (!files.length) return { ok: false, cancelled: true }
    const results = []
    for (const file of files) {
      results.push(await this.sendFile(peerId, file))
    }
    return { ok: results.every((result) => result.ok), results }
  }

  async sendFile(peerId, filePath) {
    const peer = this.store.peer(peerId)
    if (!peer) return { ok: false, error: 'Unknown chat.' }
    const adapter = this.adapters[peer.service]
    if (!adapter?.connected) return { ok: false, error: `${SERVICE_NAMES[peer.service]} is not connected.` }

    let stat
    try {
      stat = fs.statSync(filePath)
    } catch {
      return { ok: false, error: 'That file no longer exists.' }
    }
    if (stat.size > 250 * 1024 * 1024) return { ok: false, error: 'Files must be smaller than 250 MB.' }

    const originalName = safeBaseName(path.basename(filePath), 'attachment')
    const ext = extFromName(originalName) || 'bin'
    const kind = kindFromExt(ext)
    const mime = mimeFromExt(ext)
    const cacheName = this.media.filenameFor(`outgoing:${randomUUID()}`, ext)
    const cachePath = this.media.pathFor(cacheName)
    try {
      fs.copyFileSync(filePath, cachePath)
    } catch (error) {
      return { ok: false, error: `Could not read that file: ${error.message}` }
    }

    const media = {
      mime,
      name: originalName,
      size: stat.size,
      kind,
      localPath: cacheName,
      downloadState: 'ready',
    }
    const base = {
      id: `local:${randomUUID()}`,
      peerId,
      service: peer.service,
      fromMe: true,
      ts: Date.now(),
      kind,
      text: '',
      media,
    }
    try {
      const sent = await adapter.sendFile(peerId, cachePath, { kind, mime, name: originalName, caption: '' })
      const message = { ...base, remoteId: sent.id || undefined, status: 'sent', ts: sent.ts || base.ts }
      this.ingest(
        { id: peerId, service: peer.service, name: peer.name, isGroup: peer.isGroup, meta: peer.meta },
        message,
        { seed: true },
      )
      this.windows.sendToMain('idaz:sound:play', { name: 'send', settings: this.store.settings })
      return { ok: true, message: this.clientMessage(message) }
    } catch (error) {
      const message = { ...base, status: 'failed' }
      this.ingest(
        { id: peerId, service: peer.service, name: peer.name, isGroup: peer.isGroup, meta: peer.meta },
        message,
        { seed: true },
      )
      return { ok: false, error: error?.message || 'Attachment failed.' }
    }
  }

  setTyping(peerId, typing) {
    const previous = this.typing.get(peerId)
    if (previous?.timer) clearTimeout(previous.timer)
    if (!typing) {
      this.typing.delete(peerId)
      this.windows.broadcast('idaz:chat:typing', { peerId, typing: false })
      this.sendRoster()
      return
    }
    const timer = setTimeout(() => {
      this.typing.delete(peerId)
      this.windows.broadcast('idaz:chat:typing', { peerId, typing: false })
      this.sendRoster()
    }, 8000)
    if (typeof timer.unref === 'function') timer.unref()
    this.typing.set(peerId, { timer })
    this.windows.broadcast('idaz:chat:typing', { peerId, typing: true })
    this.sendRoster()
  }

  isTyping(peerId) {
    return this.typing.has(peerId)
  }

  async typingToPeer(peerId, typing) {
    const peer = this.store.peer(peerId)
    if (!peer) return { ok: false }
    const adapter = this.adapters[peer.service]
    if (adapter?.connected) await adapter.sendTyping(peerId, typing).catch(() => {})
    return { ok: true }
  }

  /* --------------------------------------------------------------- media */

  getMedia(peerId, messageId) {
    const message = this.store.findMessage(peerId, messageId)
    if (!message?.media) throw new Error('No media on this message.')
    const peer = this.store.peer(peerId)
    return {
      peer: this.peerView(peer),
      message: stripMessage(message),
      url: message.media.localPath ? this.media.urlFor(message.media.localPath) : null,
    }
  }

  patchMedia(peerId, messageId, patch) {
    const message = this.store.findMessage(peerId, messageId)
    if (!message?.media) return null
    message.media = { ...message.media, ...patch }
    if (patch.localPath) message.media.url = this.media.urlFor(patch.localPath)
    this.store.save()
    const clean = { ...message.media }
    delete clean.raw
    this.windows.broadcast('idaz:media:update', {
      peerId,
      messageId,
      media: clean,
      url: clean.localPath ? this.media.urlFor(clean.localPath) : null,
    })
    return message
  }

  async ensureMedia(peerId, messageId) {
    const message = this.store.findMessage(peerId, messageId)
    if (!message?.media) throw new Error('No media on this message.')
    if (message.media.localPath && this.media.exists(message.media.localPath)) {
      return this.getMedia(peerId, messageId)
    }
    const key = `${peerId}:${messageId}`
    if (!this.downloads.has(key)) {
      const task = (async () => {
        const peer = this.store.peer(peerId)
        const adapter = this.adapters[peer?.service]
        if (!adapter?.connected) throw new Error(`${SERVICE_NAMES[peer?.service] || 'Messenger'} is not connected.`)
        if ((message.media.size || 0) > 250 * 1024 * 1024) throw new Error('This file is too large to download.')
        const ext = extFromMime(message.media.mime) || extFromName(message.media.name) || 'bin'
        const cacheName = this.media.filenameFor(key, ext)
        const dest = this.media.pathFor(cacheName)
        this.patchMedia(peerId, messageId, { downloadState: 'downloading', error: null })
        try {
          await adapter.downloadMedia(peerId, message, dest)
          if (!fs.existsSync(dest)) throw new Error('The download produced no file.')
          this.patchMedia(peerId, messageId, { downloadState: 'ready', localPath: cacheName, error: null })
        } catch (error) {
          this.patchMedia(peerId, messageId, {
            downloadState: 'error',
            error: error?.message || 'Download failed.',
          })
          throw error
        }
      })()
      this.downloads.set(key, task)
      task.finally(() => this.downloads.delete(key)).catch(() => {})
    }
    await this.downloads.get(key)
    return this.getMedia(peerId, messageId)
  }

  async saveMedia(peerId, messageId) {
    const data = await this.ensureMedia(peerId, messageId)
    const message = this.store.findMessage(peerId, messageId)
    const suggested = safeBaseName(message.media.name || message.media.localPath || 'attachment')
    const target = await this.windows.saveFileDialog(suggested)
    if (!target) return { ok: false, cancelled: true }
    fs.copyFileSync(this.media.pathFor(message.media.localPath), target)
    return { ok: true, path: target }
  }

  revealMedia(peerId, messageId) {
    const message = this.store.findMessage(peerId, messageId)
    if (!message?.media?.localPath) return { ok: false, error: 'Download the file first.' }
    this.windows.revealFile(this.media.pathFor(message.media.localPath))
    return { ok: true }
  }

  /* ------------------------------------------------------------ settings */

  updateSettings(patch) {
    const settings = this.store.patchSettings(patch)
    this.windows.broadcast('idaz:settings:update', settings)
    return settings
  }

  /* --------------------------------------------------------------- misc */

  clearService(service) {
    const peers = Object.values(this.store.peers).filter((peer) => peer.service === service)
    for (const peer of peers) {
      delete this.store.data.peers[peer.id]
      delete this.store.data.messages[peer.id]
    }
    this.store.save()
  }
}
