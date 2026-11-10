// Telegram adapter built on GramJS (the `telegram` npm package). Supports
// both QR-code and phone-number sign-in, persists the MTProto string session,
// and normalizes dialogs/messages into the same model as the WhatsApp adapter.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { toMillis } from '../util.js'

const require = createRequire(import.meta.url)

let gram = null
function loadGram() {
  if (gram) return gram
  const telegram = require('telegram')
  const sessions = require('telegram/sessions')
  const events = require('telegram/events')
  gram = {
    TelegramClient: telegram.TelegramClient,
    Api: telegram.Api,
    StringSession: sessions.StringSession,
    NewMessage: events.NewMessage,
    Raw: events.Raw,
  }
  return gram
}

function describeError(error) {
  const message = String(error?.errorMessage || error?.message || error || 'Unknown Telegram error')
  if (/API_ID|API_HASH|API_ID_INVALID/i.test(message)) {
    return 'Telegram rejected the API ID/hash. Double-check the values from my.telegram.org.'
  }
  if (/PHONE_NUMBER_INVALID/i.test(message)) return 'That phone number looks invalid. Use international format, e.g. +14155550123.'
  if (/PHONE_CODE_INVALID/i.test(message)) return 'The login code is incorrect.'
  if (/PHONE_CODE_EXPIRED/i.test(message)) return 'That login code expired. Start again to get a new one.'
  if (/SESSION_PASSWORD_NEEDED|PASSWORD_HASH_INVALID/i.test(message)) return 'Your Telegram two-step password is required (or was wrong).'
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED/i.test(message)) return 'This Telegram session was revoked. Please sign in again.'
  if (/FLOOD|FLOOD_WAIT/i.test(message)) return 'Telegram is rate limiting sign-in. Wait a minute and try again.'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message)) return 'Cannot reach Telegram. Check your internet connection.'
  return message
}

function displayName(entity) {
  if (!entity) return 'Telegram'
  if (entity.title) return entity.title
  const parts = [entity.firstName, entity.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (entity.username) return `@${entity.username}`
  return 'Telegram chat'
}

export class TelegramAdapter {
  constructor({ sessionFile, ctx, getSettings }) {
    this.service = 'telegram'
    this.sessionFile = sessionFile
    this.ctx = ctx
    this.getSettings = getSettings
    this.status = 'off'
    this.client = null
    this.entities = new Map()
    this.boundClient = null
    this.cancelRequested = false
    this.loginAttempts = 0
    this.started = false
  }

  get sessionString() {
    try {
      return fs.readFileSync(this.sessionFile, 'utf8').trim()
    } catch {
      return ''
    }
  }

  get hasSession() {
    return this.sessionString.length > 20
  }

  get connected() {
    return this.status === 'connected' && !!this.client
  }

  credentials() {
    const settings = this.getSettings() || {}
    const apiId = Number(settings.telegramApiId)
    const apiHash = String(settings.telegramApiHash || '').trim()
    if (!Number.isFinite(apiId) || apiId <= 0 || apiHash.length < 20) {
      throw new Error(
        'Telegram needs an API ID and API hash. Create an app at my.telegram.org, then paste both into Settings → Telegram.',
      )
    }
    return { apiId, apiHash }
  }

  async init() {
    if (!this.hasSession) return
    try {
      this.ctx.status('connecting')
      const client = await this.ensureClient()
      const authorized = await client.isUserAuthorized()
      if (!authorized) {
        this.ctx.status('off', 'Sign in to Telegram.')
        return
      }
      await this.afterLogin(await client.getMe())
    } catch (error) {
      this.ctx.status('error', describeError(error))
    }
  }

  async ensureClient() {
    if (this.client && this.client.connected) return this.client
    const { apiId, apiHash } = this.credentials()
    const { TelegramClient, StringSession } = loadGram()
    const client = new TelegramClient(new StringSession(this.sessionString), apiId, apiHash, {
      connectionRetries: 6,
      autoReconnect: true,
      retryDelay: 1200,
      deviceModel: 'IDAz Desktop',
      systemVersion: 'Windows / macOS / Linux',
      appVersion: '1.0.0',
      langCode: 'en',
    })
    client.setParseMode(undefined)
    await client.connect()
    this.client = client
    return client
  }

  async startLogin(mode = 'qr', payload = {}) {
    this.cancelRequested = false
    this.loginAttempts = 0
    this.ctx.status('connecting')
    try {
      const client = await this.ensureClient()
      if (await client.isUserAuthorized()) {
        await this.afterLogin(await client.getMe())
        return { ok: true, alreadySignedIn: true }
      }
      const { apiId, apiHash } = this.credentials()

      if (mode === 'qr') {
        this.ctx.status('qr')
        const user = await client.signInUserWithQrCode(
          { apiId, apiHash },
          {
            qrCode: async ({ token }) => {
              const url = `tg://login?token=${token.toString('base64url')}`
              this.ctx.qr(url)
              this.ctx.status('qr')
            },
            password: async (hint) =>
              this.ctx.ask({ service: 'telegram', kind: 'password', hint: hint || undefined }),
            onError: async (error) => {
              if (this.cancelRequested) return true
              const message = String(error?.errorMessage || error?.message || error)
              if (/AUTH_TOKEN|QR_CODE|TIMEOUT|RESTART_AUTH/i.test(message)) return false
              this.loginAttempts += 1
              this.ctx.status('error', describeError(error))
              return this.loginAttempts >= 3
            },
          },
        )
        if (this.cancelRequested) return { ok: false, cancelled: true }
        await this.afterLogin(user)
        return { ok: true }
      }

      const phone = String(payload.phone || '').trim() || (await this.ctx.ask({ service: 'telegram', kind: 'phone' }))
      this.ctx.status('connecting', 'Sending login code…')
      const user = await client.start({
        phoneNumber: async () => phone,
        phoneCode: async () => this.ctx.ask({ service: 'telegram', kind: 'code' }),
        password: async (hint) =>
          this.ctx.ask({ service: 'telegram', kind: 'password', hint: hint || undefined }),
        onError: async (error) => {
          if (this.cancelRequested) return true
          this.ctx.status('error', describeError(error))
          return false
        },
      })
      if (this.cancelRequested) return { ok: false, cancelled: true }
      await this.afterLogin(user || (await client.getMe()))
      return { ok: true }
    } catch (error) {
      if (this.cancelRequested) return { ok: false, cancelled: true }
      const message = describeError(error)
      this.ctx.status('error', message)
      return { ok: false, error: message }
    }
  }

  async afterLogin(user) {
    const name =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Telegram account'
    try {
      fs.mkdirSync(path.dirname(this.sessionFile), { recursive: true })
      fs.writeFileSync(this.sessionFile, this.client.session.save(), 'utf8')
      try {
        fs.chmodSync(this.sessionFile, 0o600)
      } catch {
        // best effort
      }
    } catch (error) {
      console.error('[telegram] could not persist session:', error.message)
    }
    this.ctx.self({ id: user?.id ? String(user.id) : '', name, phone: user?.phone ? `+${user.phone}` : '' })
    this.ctx.status('connected')
    this.bindUpdates()
    await this.loadDialogs()
  }

  bindUpdates() {
    if (!this.client || this.boundClient === this.client) return
    this.boundClient = this.client
    const { NewMessage, Raw, Api } = loadGram()

    this.client.addEventHandler(async (event) => {
      try {
        const message = event?.message
        if (!message) return
        const peerId = this.peerIdFromMessage(message)
        if (!peerId) return
        const normalized = this.normalize(message)
        if (!normalized) return
        const peer = this.ctx.peerMeta(peerId)
        this.ctx.message(
          {
            id: peerId,
            service: 'telegram',
            name: peer?.name || this.nameForPeer(peerId, message),
            isGroup: !!peer?.isGroup || !!message.isGroup || !!message.isChannel,
            meta: peer?.meta,
          },
          normalized,
          { notify: !message.out },
        )
        if (!message.out && this.ctx.chatFocused?.(peerId)) this.ctx.markRead?.(peerId)
      } catch (error) {
        console.error('[telegram] new message:', error?.message || error)
      }
    }, new NewMessage({}))

    this.client.addEventHandler((update) => {
      try {
        this.onRawUpdate(update, Api)
      } catch (error) {
        console.error('[telegram] update:', error?.message || error)
      }
    }, new Raw({}))
  }

  onRawUpdate(update, Api) {
    if (!update) return
    const cls = update.className

    if (cls === 'UpdateUserTyping') {
      const typing = update.action?.className === 'SendMessageTypingAction'
      this.ctx.typing(`telegram:user:${update.userId}`, typing)
      return
    }
    if (cls === 'UpdateChatUserTyping') {
      const typing = update.action?.className === 'SendMessageTypingAction'
      this.ctx.typing(`telegram:chat:${update.chatId}`, typing)
      return
    }
    if (cls === 'UpdateChannelUserTyping') {
      const typing = update.action?.className === 'SendMessageTypingAction'
      this.ctx.typing(`telegram:channel:${update.channelId}`, typing)
      return
    }
    if (cls === 'UpdateReadHistoryOutbox') {
      const peerId = this.peerIdFromPeer(update.peer)
      if (peerId) this.ctx.readOut(peerId, Number(update.maxId))
      return
    }
    if (cls === 'UpdateReadChannelOutbox') {
      const peerId = `telegram:channel:${update.channelId}`
      this.ctx.readOut(peerId, Number(update.maxId))
      return
    }
    if (cls === 'UpdateDeleteMessages' || cls === 'UpdateDeleteChannelMessages') {
      // Deletions are intentionally left in the log; the history reload will
      // not resurrect them, and silently dropping rows confuses the timeline.
      return
    }
  }

  async loadDialogs() {
    if (!this.client) return
    let dialogs
    try {
      dialogs = await this.client.getDialogs({ limit: 150 })
    } catch (error) {
      console.error('[telegram] getDialogs:', describeError(error))
      return
    }
    for (const dialog of dialogs) {
      try {
        const entity = dialog.entity
        if (!entity) continue
        const peerId = this.peerIdFromEntity(entity)
        if (!peerId) continue
        this.entities.set(peerId, entity)
        const meta = {
          kind: this.entityKind(entity),
          id: String(entity.id),
          accessHash: entity.accessHash ? String(entity.accessHash) : undefined,
          username: entity.username || undefined,
        }
        const name = displayName(entity)
        const isGroup = !dialog.isUser
        const unread = Number(dialog.unreadCount || 0)
        this.ctx.peer({ id: peerId, service: 'telegram', name, isGroup, unread, meta })

        const last = dialog.message
        if (!last) continue
        const normalized = this.normalize(last)
        if (!normalized) continue
        this.ctx.message(
          { id: peerId, service: 'telegram', name, isGroup, meta },
          { ...normalized, peerId },
          { notify: false, seed: true, unread },
        )
      } catch (error) {
        console.error('[telegram] dialog:', error?.message || error)
      }
    }
  }

  entityKind(entity) {
    const cls = entity?.className || entity?.constructor?.name || ''
    if (cls.startsWith('User')) return 'user'
    if (cls.startsWith('Chat')) return 'chat'
    if (cls.startsWith('Channel')) return 'channel'
    return 'user'
  }

  peerIdFromEntity(entity) {
    const kind = this.entityKind(entity)
    if (!entity?.id) return null
    return `telegram:${kind === 'user' ? 'user' : kind}:${entity.id}`
  }

  peerIdFromMessage(message) {
    if (message.isChannel) return `telegram:channel:${message.chatId}`
    if (message.isGroup) return `telegram:chat:${message.chatId}`
    const id = message.chatId ?? message.senderId
    return id ? `telegram:user:${id}` : null
  }

  peerIdFromPeer(peer) {
    if (!peer) return null
    const cls = peer.className
    if (cls === 'PeerUser') return `telegram:user:${peer.userId}`
    if (cls === 'PeerChat') return `telegram:chat:${peer.chatId}`
    if (cls === 'PeerChannel') return `telegram:channel:${peer.channelId}`
    return null
  }

  nameForPeer(peerId, message) {
    const cached = this.entities.get(peerId)
    if (cached) return displayName(cached)
    if (message?.sender) return displayName(message.sender)
    return 'Telegram chat'
  }

  async entityFor(peerId) {
    if (this.entities.has(peerId)) return this.entities.get(peerId)
    await this.loadDialogs()
    return this.entities.get(peerId) || null
  }

  normalize(message) {
    if (!message) return null
    const peerId = this.peerIdFromMessage(message)
    if (!peerId) return null
    const media = this.mediaOf(message)
    const text = message.text || ''
    if (!media && !text) return null

    return {
      id: `telegram:${peerId}:${message.id}`,
      remoteId: String(message.id),
      peerId,
      service: 'telegram',
      fromMe: !!message.out,
      ts: toMillis(message.date),
      kind: media?.kind || 'text',
      text,
      author: message.out ? undefined : displayName(message.sender) || undefined,
      status: message.out ? 'sent' : undefined,
      media: media || undefined,
    }
  }

  mediaOf(message) {
    const file = message.file || {}
    const size = Number(file.size) || undefined
    if (message.photo) {
      return {
        mime: 'image/jpeg',
        kind: 'image',
        size: Number(message.photo.sizes?.slice(-1)?.[0]?.size) || size,
        width: message.photo.w,
        height: message.photo.h,
        downloadState: 'none',
      }
    }
    if (message.gif) {
      return {
        mime: 'video/mp4',
        kind: 'gif',
        name: 'animation.mp4',
        size,
        downloadState: 'none',
      }
    }
    if (message.video) {
      return {
        mime: message.video.mimeType || file.mimeType || 'video/mp4',
        kind: 'video',
        name: file.name,
        size,
        width: message.video.w,
        height: message.video.h,
        duration: message.video.duration,
        downloadState: 'none',
      }
    }
    if (message.sticker) {
      return {
        mime: message.sticker.mimeType || 'image/webp',
        kind: 'sticker',
        size,
        width: message.sticker.w,
        height: message.sticker.h,
        downloadState: 'none',
      }
    }
    if (message.voice) {
      return {
        mime: message.voice.mimeType || 'audio/ogg',
        kind: 'audio',
        name: 'voice-note.ogg',
        size,
        duration: message.voice.duration,
        downloadState: 'none',
      }
    }
    if (message.audio) {
      return {
        mime: message.audio.mimeType || 'audio/mpeg',
        kind: 'audio',
        name: file.name || 'audio.mp3',
        size,
        duration: message.audio.duration,
        downloadState: 'none',
      }
    }
    if (message.document) {
      return {
        mime: file.mimeType || 'application/octet-stream',
        kind: 'file',
        name: file.name || 'document',
        size,
        downloadState: 'none',
      }
    }
    return null
  }

  async sendText(peerId, text) {
    const entity = await this.entityFor(peerId)
    if (!entity) throw new Error('This Telegram chat is unavailable. Refresh and try again.')
    const sent = await this.client.sendMessage(entity, { message: text })
    return { id: String(sent?.id || ''), ts: toMillis(sent?.date) }
  }

  async sendFile(peerId, filePath, meta) {
    const entity = await this.entityFor(peerId)
    if (!entity) throw new Error('This Telegram chat is unavailable. Refresh and try again.')
    const sent = await this.client.sendFile(entity, {
      file: filePath,
      caption: meta.caption || '',
      forceDocument: meta.kind === 'file',
      supportsStreaming: meta.kind === 'video' || meta.kind === 'gif',
      voiceNote: false,
    })
    return { id: String(sent?.id || ''), ts: toMillis(sent?.date) }
  }

  async sendTyping(peerId, typing) {
    if (!this.client) return
    const { Api } = loadGram()
    try {
      const entity = await this.entityFor(peerId)
      if (!entity) return
      const peer = await this.client.getInputEntity(entity)
      await this.client.invoke(
        new Api.messages.SetTyping({
          peer,
          action: typing ? new Api.SendMessageTypingAction() : new Api.SendMessageCancelAction(),
        }),
      )
    } catch {
      // typing is best-effort
    }
  }

  async markRead(peerId) {
    if (!this.client) return
    try {
      const entity = await this.entityFor(peerId)
      if (entity) await this.client.markAsRead(entity)
    } catch {
      // ignore
    }
  }

  async loadHistory(peerId, { limit = 50, olderThan } = {}) {
    if (!this.client) return []
    try {
      const entity = await this.entityFor(peerId)
      if (!entity) return []
      const params = { limit }
      if (olderThan && Number.isFinite(Number(olderThan))) params.offsetId = Number(olderThan)
      const messages = await this.client.getMessages(entity, params)
      const peer = this.ctx.peerMeta(peerId)
      const normalized = messages
        .map((m) => this.normalize(m))
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts)
      for (const message of normalized) {
        this.ctx.message(
          {
            id: peerId,
            service: 'telegram',
            name: peer?.name || this.nameForPeer(peerId, null),
            isGroup: !!peer?.isGroup,
            meta: peer?.meta,
          },
          message,
          { notify: false, seed: true },
        )
      }
      return normalized
    } catch (error) {
      console.error('[telegram] loadHistory:', describeError(error))
      return []
    }
  }

  async downloadMedia(peerId, message, destPath) {
    if (!this.client) throw new Error('Telegram is not connected.')
    const entity = await this.entityFor(peerId)
    if (!entity) throw new Error('This Telegram chat is unavailable.')
    const list = await this.client.getMessages(entity, { ids: Number(message.remoteId) })
    const fetched = list?.[0]
    if (!fetched) throw new Error('Telegram no longer has this message.')
    await this.client.downloadMedia(fetched, { outputFile: destPath })
    if (!fs.existsSync(destPath)) throw new Error('Telegram returned no file for this message.')
    return destPath
  }

  async logout() {
    this.cancelRequested = true
    try {
      await this.client?.logout()
    } catch {
      // session might already be invalid
    }
    try {
      await this.client?.disconnect()
    } catch {
      // ignore
    }
    this.client = null
    this.boundClient = null
    this.entities.clear()
    try {
      fs.rmSync(this.sessionFile, { force: true })
    } catch {
      // ignore
    }
    this.status = 'logged_out'
    this.ctx.status('logged_out', 'Telegram signed out.')
  }

  async cancelLogin() {
    this.cancelRequested = true
    try {
      await this.client?.disconnect()
    } catch {
      // ignore
    }
    this.client = null
    this.ctx.status('off', 'Sign-in cancelled.')
  }

  disconnect() {
    try {
      this.client?.disconnect()
    } catch {
      // ignore
    }
  }
}
