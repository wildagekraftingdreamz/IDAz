// Persistent application state: settings, peer roster and per-chat message
// history. Kept as a single JSON document in Electron's userData folder so the
// whole messenger survives restarts without a database dependency.
import fs from 'node:fs'
import path from 'node:path'

const MAX_MESSAGES_PER_CHAT = 400

export const DEFAULT_SETTINGS = {
  skin: 'teal',
  fontSize: 'md',
  sound: true,
  volume: 0.7,
  previews: true,
  telegramApiId: '',
  telegramApiHash: '',
}

export const SKINS = ['teal', 'classic', 'plum', 'amber']
export const FONT_SIZES = ['sm', 'md', 'lg', 'xl']

function defaults() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    accounts: {
      whatsapp: { linked: false, name: null, id: null },
      telegram: { linked: false, name: null, id: null },
    },
    peers: {},
    messages: {},
  }
}

function revive(_key, value) {
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data)
  }
  return value
}

function withoutUndefined(patch) {
  const out = {}
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined) out[key] = value
  }
  return out
}

export class Store {
  constructor(dir) {
    this.dir = dir
    this.file = path.join(dir, 'idaz-state.json')
    this.data = defaults()
    this.timer = null
    this.load()
  }

  get settings() {
    return this.data.settings
  }

  get peers() {
    return this.data.peers
  }

  load() {
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'), revive)
      this.data = {
        ...defaults(),
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        accounts: { ...defaults().accounts, ...(parsed.accounts || {}) },
        peers: parsed.peers && typeof parsed.peers === 'object' ? parsed.peers : {},
        messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[store] could not read state, starting fresh:', error.message)
      }
    }
  }

  save() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, 350)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      const tmp = `${this.file}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8')
      fs.renameSync(tmp, this.file)
      try {
        fs.chmodSync(this.file, 0o600)
      } catch {
        // chmod is best-effort on Windows
      }
    } catch (error) {
      console.error('[store] failed to save state:', error.message)
    }
  }

  patchSettings(patch) {
    const next = { ...this.data.settings }
    for (const [key, value] of Object.entries(patch || {})) {
      if (!(key in DEFAULT_SETTINGS)) continue
      if (key === 'skin' && !SKINS.includes(value)) continue
      if (key === 'fontSize' && !FONT_SIZES.includes(value)) continue
      if (key === 'sound' && typeof value !== 'boolean') continue
      if (key === 'previews' && typeof value !== 'boolean') continue
      if (key === 'volume' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1)) continue
      next[key] = typeof value === 'string' ? value.trim() : value
    }
    this.data.settings = next
    this.save()
    return next
  }

  setAccount(service, patch) {
    if (!this.data.accounts[service]) return null
    this.data.accounts[service] = { ...this.data.accounts[service], ...withoutUndefined(patch) }
    this.save()
    return this.data.accounts[service]
  }

  peer(id) {
    return this.data.peers[id] || null
  }

  upsertPeer(patch) {
    const existing =
      this.data.peers[patch.id] ||
      {
        id: patch.id,
        service: patch.service,
        name: patch.name || 'Unknown contact',
        isGroup: false,
        unread: 0,
        lastTs: 0,
        lastPreview: '',
        lastFromMe: false,
        muted: false,
      }
    Object.assign(existing, withoutUndefined(patch))
    if (!existing.name) existing.name = patch.name || existing.name || 'Unknown contact'
    this.data.peers[existing.id] = existing
    this.save()
    return existing
  }

  messages(peerId) {
    return this.data.messages[peerId] || []
  }

  findMessage(peerId, messageId) {
    return this.messages(peerId).find((m) => m.id === messageId) || null
  }

  findByRemote(peerId, remoteId) {
    if (remoteId === undefined || remoteId === null) return null
    return this.messages(peerId).find((m) => String(m.remoteId) === String(remoteId)) || null
  }

  appendMessage(message) {
    const list = (this.data.messages[message.peerId] ||= [])
    const duplicate = list.find(
      (m) => m.id === message.id || (message.remoteId != null && String(m.remoteId) === String(message.remoteId)),
    )
    if (duplicate) return { added: false, message: duplicate }
    list.push(message)
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0))
    if (list.length > MAX_MESSAGES_PER_CHAT) list.splice(0, list.length - MAX_MESSAGES_PER_CHAT)
    this.save()
    return { added: true, message }
  }

  patchMessage(peerId, messageId, patch) {
    const list = this.messages(peerId)
    const message = list.find((m) => m.id === messageId)
    if (!message) return null
    Object.assign(message, withoutUndefined(patch))
    this.save()
    return message
  }

  patchByRemote(peerId, remoteId, patch) {
    const message = this.findByRemote(peerId, remoteId)
    if (!message) return null
    Object.assign(message, withoutUndefined(patch))
    this.save()
    return message
  }

  patchPeer(peerId, patch) {
    const peer = this.data.peers[peerId]
    if (!peer) return null
    Object.assign(peer, withoutUndefined(patch))
    this.save()
    return peer
  }

  lastMessage(peerId) {
    const list = this.messages(peerId)
    return list.length ? list[list.length - 1] : null
  }

  /**
   * Drops every message, preview and unread badge but keeps the things that
   * make the app usable: settings, linked accounts, the contact list, mute
   * state and its recency ordering.
   */
  clearHistory() {
    const peers = Object.values(this.data.peers)
    let removed = 0
    for (const list of Object.values(this.data.messages)) removed += list.length
    this.data.messages = {}
    for (const peer of peers) {
      peer.unread = 0
      peer.lastPreview = ''
      peer.lastFromMe = false
    }
    this.save()
    return { messages: removed, peers: peers.length }
  }
}
