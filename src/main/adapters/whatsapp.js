// WhatsApp adapter built on Baileys: a pure WebSocket WhatsApp Web client, so
// no embedded browser is needed. Sessions are persisted to a single JSON file
// in the app's userData folder and survive restarts.
import fs from 'node:fs'
import path from 'node:path'
import { makeSilentLogger, phoneFromJid, toMillis } from '../util.js'

let libPromise = null

async function loadLib() {
  if (!libPromise) libPromise = import('@whiskeysockets/baileys')
  return libPromise
}

function reviveBuffers(_key, value) {
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data)
  return value
}

function unwrapContent(content) {
  let current = content
  const wrappers = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'deviceSentMessage',
    'editedMessage',
  ]
  for (let i = 0; i < 8; i += 1) {
    const wrapper = wrappers.find((key) => current && current[key] && current[key].message)
    if (!wrapper) break
    current = current[wrapper].message
  }
  return current
}

function detectType(content, lib) {
  try {
    const type = lib.getContentType?.(content)
    if (type) return type
  } catch {
    // fall through to key sniffing
  }
  return Object.keys(content || {}).find((key) => key.endsWith('Message')) || null
}

function describeError(error) {
  const message = error?.message || error?.toString?.() || 'Unknown WhatsApp error'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return 'Cannot reach WhatsApp. Check your internet connection.'
  }
  if (/401|logged out/i.test(message)) return 'WhatsApp unlinked this device.'
  return message
}

export class WhatsAppAdapter {
  constructor({ sessionFile, ctx }) {
    this.service = 'whatsapp'
    this.sessionFile = sessionFile
    this.ctx = ctx
    this.status = 'off'
    this.sock = null
    this.connecting = false
    this.reconnectAttempts = 0
    this.reconnectTimer = null
    this.contacts = new Map()
    this.chats = new Map()
    this.lib = null
    this.disposed = false
  }

  async init() {
    if (this.hasSession) await this.connect()
  }

  get hasSession() {
    try {
      const raw = fs.readFileSync(this.sessionFile, 'utf8')
      return raw.length > 20
    } catch {
      return false
    }
  }

  get connected() {
    return this.status === 'connected' && !!this.sock
  }

  async startLogin() {
    this.disposed = false
    await this.connect()
    return { ok: true }
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  scheduleReconnect(delay = 2500) {
    if (this.disposed) return
    this.clearReconnect()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  async connect() {
    if (this.disposed) return
    if (this.connecting) return
    if (this.sock) {
      try {
        this.sock.end(undefined)
      } catch {
        // ignore
      }
      this.sock = null
    }
    this.connecting = true
    this.clearReconnect()
    this.ctx.status('connecting')
    try {
      const lib = await loadLib()
      this.lib = lib
      const auth = this.createAuthState(lib)
      const options = {
        auth: auth.state,
        logger: makeSilentLogger(),
        browser: lib.Browsers?.ubuntu ? lib.Browsers.ubuntu('IDAz') : ['IDAz', 'Desktop', '1.0.0'],
        syncFullHistory: true,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        retryRequestDelayMs: 1500,
        getMessage: async () => undefined,
      }
      try {
        const latest = await lib.fetchLatestBaileysVersion()
        if (latest?.version) options.version = latest.version
      } catch {
        // bundled protocol version is fine when offline
      }
      const sock = lib.makeWASocket(options)
      this.sock = sock
      sock.ev.on('creds.update', auth.saveCreds)
      this.bind(sock)
      this.connecting = false
    } catch (error) {
      this.connecting = false
      this.sock = null
      this.ctx.status('error', describeError(error))
      this.scheduleReconnect(4000)
    }
  }

  createAuthState(lib) {
    let data = { creds: lib.initAuthCreds(), keys: {} }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'), reviveBuffers)
      if (parsed?.creds) data = { creds: parsed.creds, keys: parsed.keys || {} }
    } catch {
      // no saved session yet
    }

    const persist = () => {
      try {
        fs.mkdirSync(path.dirname(this.sessionFile), { recursive: true })
        const tmp = `${this.sessionFile}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(data), 'utf8')
        fs.renameSync(tmp, this.sessionFile)
        try {
          fs.chmodSync(this.sessionFile, 0o600)
        } catch {
          // best effort on Windows
        }
      } catch (error) {
        console.error('[whatsapp] could not save session:', error.message)
      }
    }

    return {
      state: {
        creds: data.creds,
        keys: {
          get: async (type, ids) => {
            const out = {}
            for (const id of ids) {
              let value = data.keys?.[type]?.[id]
              if (value && type === 'app-state-sync-key') {
                value = lib.proto.Message.AppStateSyncKeyData.fromObject(value)
              }
              if (value) out[id] = value
            }
            return out
          },
          set: async (patch) => {
            for (const [type, entries] of Object.entries(patch || {})) {
              data.keys[type] = data.keys[type] || {}
              for (const [id, value] of Object.entries(entries || {})) {
                if (value) data.keys[type][id] = value
                else delete data.keys[type][id]
              }
            }
            persist()
          },
        },
      },
      saveCreds: async () => persist(),
    }
  }

  bind(sock) {
    const safe = (label, handler) => async (payload) => {
      try {
        await handler(payload)
      } catch (error) {
        console.error(`[whatsapp] ${label}:`, error?.message || error)
      }
    }

    sock.ev.on('connection.update', safe('connection', (update) => this.onConnectionUpdate(update)))
    sock.ev.on('creds.update', safe('creds', () => {}))
    sock.ev.on('messages.upsert', safe('messages', (payload) => this.onMessages(payload)))
    sock.ev.on('messaging-history.set', safe('history', (payload) => this.onHistory(payload)))
    sock.ev.on('contacts.upsert', safe('contacts', (contacts) => this.onContacts(contacts)))
    sock.ev.on('contacts.update', safe('contacts', (contacts) => this.onContacts(contacts)))
    sock.ev.on('chats.upsert', safe('chats', (chats) => this.onChats(chats)))
    sock.ev.on('chats.update', safe('chats', (chats) => this.onChats(chats)))
    sock.ev.on('presence.update', safe('presence', (payload) => this.onPresence(payload)))
    sock.ev.on('messages.update', safe('updates', (updates) => this.onMessageUpdates(updates)))
  }

  onConnectionUpdate(update) {
    if (this.disposed) return
    const { connection, lastDisconnect, qr } = update || {}
    if (qr) {
      this.ctx.qr(qr)
      this.ctx.status('qr')
    }
    if (connection === 'open') {
      this.reconnectAttempts = 0
      const me = this.sock?.user
      this.ctx.status('connected')
      if (me) {
        this.ctx.self({
          id: me.id,
          name: me.name || me.verifiedName || phoneFromJid(me.id),
          phone: phoneFromJid(me.id),
        })
      }
      return
    }
    if (connection !== 'close') return

    const code = lastDisconnect?.error?.output?.statusCode
    this.sock = null
    if (code === 401) {
      this.wipeSession()
      this.ctx.status('logged_out', 'WhatsApp was unlinked on your phone.')
      return
    }
    if (code === 440) {
      this.ctx.status('error', 'This WhatsApp session is open somewhere else.')
      return
    }
    if (code === 515) {
      this.ctx.status('connecting')
      this.scheduleReconnect(500)
      return
    }
    const delay = Math.min(30000, 1500 * 2 ** Math.min(this.reconnectAttempts++, 5))
    this.ctx.status('connecting', 'Reconnecting to WhatsApp…')
    this.scheduleReconnect(delay)
  }

  onContacts(contacts) {
    for (const contact of contacts || []) {
      if (!contact?.id) continue
      this.contacts.set(contact.id, contact)
      const name = contact.name || contact.verifiedName || contact.notify
      if (name) this.ctx.name(contact.id, name)
    }
  }

  onChats(chats) {
    for (const chat of chats || []) {
      if (!chat?.id) continue
      this.chats.set(chat.id, { ...(this.chats.get(chat.id) || {}), ...chat })
      const name = chat.name
      if (name) this.ctx.name(chat.id, name)
      if (typeof chat.unreadCount === 'number' && chat.unreadCount > 0) {
        this.ctx.peer({
          id: chat.id,
          service: 'whatsapp',
          name: name || this.nameFor(chat.id),
          isGroup: chat.id.endsWith('@g.us'),
          unread: chat.unreadCount,
        })
      }
    }
  }

  onHistory({ messages = [], chats = [], contacts = [] } = {}) {
    this.onContacts(contacts)
    this.onChats(chats)
    const unreadByChat = new Map()
    for (const chat of chats || []) {
      if (typeof chat.unreadCount === 'number') unreadByChat.set(chat.id, chat.unreadCount)
    }
    const byChat = new Map()
    for (const raw of messages) {
      const jid = raw?.key?.remoteJid
      if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue
      if (!byChat.has(jid)) byChat.set(jid, [])
      byChat.get(jid).push(raw)
    }
    for (const [jid, list] of byChat) {
      list.sort((a, b) => toMillis(a.messageTimestamp) - toMillis(b.messageTimestamp))
      const recent = list.slice(-60)
      for (const raw of recent) {
        const message = this.normalize(raw)
        if (!message) continue
        this.ctx.message(
          {
            id: jid,
            service: 'whatsapp',
            name: this.nameFor(jid),
            isGroup: jid.endsWith('@g.us'),
            meta: { jid },
          },
          message,
          { notify: false, seed: true, unread: unreadByChat.get(jid) || 0 },
        )
      }
    }
  }

  onMessages({ messages = [], type } = {}) {
    for (const raw of messages) {
      if (!raw?.message) continue
      const jid = raw.key?.remoteJid
      if (!jid || jid === 'status@broadcast' || jid.endsWith('@newsletter') || jid === '0@s.whatsapp.net') continue
      const message = this.normalize(raw)
      if (!message) continue
      const live = type === 'notify'
      this.ctx.message(
        {
          id: jid,
          service: 'whatsapp',
          name: this.nameFor(jid, raw.pushName),
          isGroup: jid.endsWith('@g.us'),
          meta: { jid },
        },
        message,
        { notify: live && !message.fromMe, seed: !live },
      )
    }
  }

  onPresence({ id, presences } = {}) {
    if (!id || !presences) return
    const entries = Object.entries(presences)
    if (!entries.length) return
    const composing = entries.some(
      ([jid, presence]) =>
        jid !== this.sock?.user?.id &&
        (presence?.lastKnownPresence === 'composing' || presence?.lastKnownPresence === 'recording'),
    )
    this.ctx.typing(id, composing)
  }

  onMessageUpdates(updates = []) {
    for (const entry of updates) {
      const key = entry?.key
      const update = entry?.update || {}
      if (!key?.remoteJid || !key.id) continue
      if (update.status === undefined || update.status === null) continue
      const statusMap = { 1: 'sent', 2: 'sent', 3: 'delivered', 4: 'read', 5: 'read' }
      const status = statusMap[update.status]
      if (status) this.ctx.patch(key.remoteJid, key.id, { status })
    }
  }

  nameFor(jid, pushName) {
    if (String(jid).endsWith('@g.us')) {
      return this.chats.get(jid)?.name || this.contacts.get(jid)?.name || 'Group chat'
    }
    const contact = this.contacts.get(jid)
    return (
      contact?.name ||
      contact?.verifiedName ||
      contact?.notify ||
      pushName ||
      phoneFromJid(jid) ||
      'WhatsApp contact'
    )
  }

  normalize(raw) {
    const lib = this.lib
    if (!lib) return null
    const content = unwrapContent(raw.message)
    if (!content) return null

    const type = detectType(content, lib)
    if (!type) return null
    if (['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage', 'pollUpdateMessage'].includes(type)) {
      return null
    }

    let kind = 'text'
    let text = ''
    let media = null

    const mediaBase = (node, overrides = {}) => ({
      mime: node?.mimetype || overrides.mime,
      size: Number(node?.fileLength || 0) || undefined,
      width: node?.width || undefined,
      height: node?.height || undefined,
      duration: node?.seconds || undefined,
      name: node?.fileName || undefined,
      downloadState: 'none',
      thumbDataUrl: node?.jpegThumbnail
        ? `data:image/jpeg;base64,${Buffer.from(node.jpegThumbnail).toString('base64')}`
        : undefined,
      ...overrides,
    })

    switch (type) {
      case 'conversation':
        text = content.conversation || ''
        break
      case 'extendedTextMessage':
        text = content.extendedTextMessage?.text || ''
        break
      case 'imageMessage':
        kind = 'image'
        text = content.imageMessage?.caption || ''
        media = mediaBase(content.imageMessage, { mime: content.imageMessage?.mimetype || 'image/jpeg' })
        break
      case 'videoMessage': {
        const node = content.videoMessage
        kind = node?.gifPlayback ? 'gif' : 'video'
        text = node?.caption || ''
        media = mediaBase(node, { mime: node?.mimetype || 'video/mp4' })
        break
      }
      case 'ptvMessage':
        kind = 'video'
        media = mediaBase(content.ptvMessage, { mime: 'video/mp4' })
        break
      case 'stickerMessage':
        kind = 'sticker'
        media = mediaBase(content.stickerMessage, { mime: content.stickerMessage?.mimetype || 'image/webp' })
        break
      case 'audioMessage':
        kind = 'audio'
        media = mediaBase(content.audioMessage, { mime: content.audioMessage?.mimetype || 'audio/ogg' })
        break
      case 'documentMessage':
        kind = 'file'
        text = content.documentMessage?.caption || ''
        media = mediaBase(content.documentMessage, {
          mime: content.documentMessage?.mimetype || 'application/octet-stream',
          name: content.documentMessage?.fileName || 'document',
        })
        break
      case 'locationMessage':
        kind = 'text'
        text = '\u{1F4CD} Location'
        break
      case 'liveLocationMessage':
        kind = 'text'
        text = '\u{1F4CD} Live location'
        break
      case 'contactMessage':
      case 'contactsArrayMessage':
        kind = 'text'
        text = '\u{1F464} Contact card'
        break
      case 'pollCreationMessage':
      case 'pollCreationMessageV2':
      case 'pollCreationMessageV3':
        kind = 'text'
        text = '\u{1F4CA} Poll'
        break
      default:
        return null
    }

    if (kind === 'text' && !text.trim()) return null

    const peerId = raw.key.remoteJid
    const fromMe = !!raw.key.fromMe
    const ts = toMillis(raw.messageTimestamp)

    return {
      id: `whatsapp:${raw.key.id}`,
      remoteId: raw.key.id,
      peerId,
      service: 'whatsapp',
      fromMe,
      ts,
      kind,
      text: text || '',
      author: fromMe ? undefined : raw.pushName || undefined,
      status: fromMe ? 'sent' : undefined,
      media: media || undefined,
      // Kept only in the main-process store: needed for later media download
      // and read receipts. Stripped before anything reaches a renderer.
      key: {
        remoteJid: peerId,
        id: raw.key.id,
        fromMe,
        participant: raw.key.participant || undefined,
      },
      raw: { key: raw.key, message: raw.message },
    }
  }

  async sendText(peerId, text) {
    if (!this.sock) throw new Error('WhatsApp is not connected.')
    const sent = await this.sock.sendMessage(peerId, { text })
    if (!sent?.key?.id) throw new Error('WhatsApp rejected the message.')
    return { id: sent.key.id, ts: toMillis(sent.messageTimestamp) }
  }

  async sendFile(peerId, filePath, meta) {
    if (!this.sock) throw new Error('WhatsApp is not connected.')
    const buffer = fs.readFileSync(filePath)
    if (buffer.length > 100 * 1024 * 1024) throw new Error('WhatsApp attachments must be under 100 MB.')
    const caption = meta.caption || ''
    let payload
    if (meta.kind === 'image') {
      payload = { image: buffer, mimetype: meta.mime || 'image/jpeg', caption }
    } else if (meta.kind === 'gif') {
      payload = { video: buffer, mimetype: 'video/mp4', gifPlayback: true, caption }
    } else if (meta.kind === 'video') {
      payload = { video: buffer, mimetype: meta.mime || 'video/mp4', caption }
    } else if (meta.kind === 'audio') {
      payload = { audio: buffer, mimetype: meta.mime || 'audio/mpeg', ptt: false }
    } else {
      payload = {
        document: buffer,
        mimetype: meta.mime || 'application/octet-stream',
        fileName: meta.name || path.basename(filePath),
      }
    }
    const sent = await this.sock.sendMessage(peerId, payload)
    return { id: sent?.key?.id || '', ts: toMillis(sent?.messageTimestamp) }
  }

  async sendTyping(peerId, typing) {
    if (!this.sock) return
    try {
      await this.sock.sendPresenceUpdate(typing ? 'composing' : 'paused', peerId)
    } catch {
      // presence is best-effort
    }
  }

  async markRead(peerId, messages = []) {
    if (!this.sock) return
    const keys = messages
      .filter((m) => !m.fromMe && m.key?.id)
      .slice(-20)
      .map((m) => ({
        remoteJid: m.key.remoteJid || peerId,
        id: m.key.id,
        fromMe: false,
        participant: m.key.participant,
      }))
    if (!keys.length) return
    try {
      await this.sock.readMessages(keys)
    } catch {
      // ignore receipt errors
    }
  }

  async loadHistory() {
    // Baileys delivers multi-device history through messaging-history.set.
    return []
  }

  async downloadMedia(peerId, message, destPath) {
    const raw = message?.raw
    if (!raw) throw new Error('This media is no longer available to download.')
    const lib = this.lib || (await loadLib())
    const buffer = await lib.downloadMediaMessage(raw, 'buffer', {}, {
      logger: makeSilentLogger(),
      reuploadRequest: this.sock?.updateMediaMessage?.bind(this.sock),
    })
    if (!buffer || !buffer.length) throw new Error('WhatsApp returned an empty file.')
    fs.writeFileSync(destPath, buffer)
    return destPath
  }

  wipeSession() {
    this.contacts.clear()
    this.chats.clear()
    try {
      fs.rmSync(this.sessionFile, { force: true })
    } catch {
      // ignore
    }
  }

  async cancelLogin() {
    this.disposed = true
    this.clearReconnect()
    try {
      this.sock?.end(undefined)
    } catch {
      // ignore
    }
    this.sock = null
    this.status = 'off'
    this.ctx.status('off', 'Sign-in cancelled.')
  }

  async logout() {
    this.disposed = true
    this.clearReconnect()
    try {
      await this.sock?.logout()
    } catch {
      // ignore: we clear locally regardless
    }
    this.sock = null
    this.wipeSession()
    this.status = 'logged_out'
    this.ctx.status('logged_out', 'WhatsApp unlinked.')
  }

  disconnect() {
    this.disposed = true
    this.clearReconnect()
    try {
      this.sock?.end(undefined)
    } catch {
      // ignore
    }
    this.sock = null
  }
}
