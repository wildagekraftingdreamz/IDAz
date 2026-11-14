import type {
  Accounts,
  AuthPrompt,
  Bootstrap,
  ChatPayload,
  MediaPayload,
  Message,
  Peer,
  SearchHit,
  SendResult,
  Service,
  Settings,
} from './types'

interface Bridge {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>
  on: (channel: string, callback: (data: unknown) => void) => () => void
  control: (action: 'minimize' | 'maximize' | 'close') => void
  closeWindow: () => void
  platform: string
}

declare global {
  interface Window {
    idaz?: Bridge
  }
}

const bridge = typeof window !== 'undefined' ? window.idaz : undefined

export const hasBridge = !!bridge
export const platform = bridge?.platform || 'browser'

function call<T>(channel: string, payload?: unknown): Promise<T> {
  if (!bridge) return Promise.reject(new Error('The IDAz desktop bridge is unavailable.'))
  return bridge.invoke(channel, payload) as Promise<T>
}

function subscribe<T>(channel: string, callback: (data: T) => void): () => void {
  if (!bridge) return () => {}
  return bridge.on(channel, (data) => callback(data as T))
}

export const api = {
  bootstrap: () => call<Bootstrap>('idaz:bootstrap'),
  search: (query: string, limit = 40) => call<SearchHit[]>('idaz:search', { query, limit }),
  getChat: (peerId: string) => call<ChatPayload>('idaz:chat:get', { peerId }),
  loadOlder: (peerId: string) => call<{ ok: boolean; count?: number; error?: string }>('idaz:chat:older', { peerId }),
  markRead: (peerId: string) => call<{ ok: boolean }>('idaz:chat:read', { peerId }),
  clearUnread: (peerId: string) => call<{ ok: boolean }>('idaz:chat:clearUnread', { peerId }),
  clearHistory: () => call<{ ok: boolean; messages: number; peers: number }>('idaz:chat:clearHistory'),
  setMuted: (peerId: string, muted: boolean) =>
    call<{ ok: boolean; peer?: Peer; error?: string }>('idaz:chat:mute', { peerId, muted }),
  send: (peerId: string, text: string) => call<SendResult>('idaz:chat:send', { peerId, text }),
  attach: (peerId: string) => call<SendResult>('idaz:chat:attach', { peerId }),
  typing: (peerId: string, typing: boolean) =>
    call<{ ok: boolean }>('idaz:chat:typing', { peerId, typing }),
  openChat: (peerId: string, messageId?: string) =>
    call<{ ok: boolean }>('idaz:window:chat', { peerId, messageId }),
  openProfile: (peerId: string) => call<{ ok: boolean }>('idaz:window:profile', { peerId }),
  copyMessage: (peerId: string, messageId: string) =>
    call<{ ok: boolean; error?: string }>('idaz:clipboard:copyMessage', { peerId, messageId }),
  openLogin: () => call<{ ok: boolean }>('idaz:window:login'),
  openMedia: (peerId: string, messageId: string) =>
    call<{ ok: boolean }>('idaz:window:media', { peerId, messageId }),
  getMedia: (peerId: string, messageId: string) =>
    call<MediaPayload>('idaz:media:get', { peerId, messageId }),
  downloadMedia: (peerId: string, messageId: string) =>
    call<MediaPayload>('idaz:media:download', { peerId, messageId }),
  saveMedia: (peerId: string, messageId: string) =>
    call<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>('idaz:media:save', {
      peerId,
      messageId,
    }),
  revealMedia: (peerId: string, messageId: string) =>
    call<{ ok: boolean; error?: string }>('idaz:media:reveal', { peerId, messageId }),
  openMediaExternally: (peerId: string, messageId: string) =>
    call<{ ok: boolean; error?: string }>('idaz:media:openPath', { peerId, messageId }),
  updateSettings: (patch: Partial<Settings>) =>
    call<Settings>('idaz:settings:update', { patch }),
  startLogin: (service: Service, mode: 'qr' | 'phone' = 'qr', phone?: string) =>
    call<{ ok: boolean; error?: string; cancelled?: boolean }>('idaz:auth:start', { service, mode, phone }),
  answerPrompt: (id: string, value: string) =>
    call<{ ok: boolean; error?: string }>('idaz:auth:answer', { id, value }),
  cancelLogin: (service: Service) => call<{ ok: boolean }>('idaz:auth:cancel', { service }),
  logout: (service: Service) => call<{ ok: boolean }>('idaz:auth:logout', { service }),
  openExternal: (url: string) => call<{ ok: boolean }>('idaz:app:openExternal', { url }),
  onRoster: (callback: (peers: Peer[]) => void) => subscribe<Peer[]>('idaz:roster:update', callback),
  onAccounts: (callback: (accounts: Accounts) => void) =>
    subscribe<Accounts>('idaz:accounts:update', callback),
  onAppend: (callback: (data: { peerId: string; messages: Message[] }) => void) =>
    subscribe<{ peerId: string; messages: Message[] }>('idaz:chat:append', callback),
  onPatch: (callback: (data: { peerId: string; messageId: string; patch: Partial<Message> }) => void) =>
    subscribe<{ peerId: string; messageId: string; patch: Partial<Message> }>('idaz:chat:patch', callback),
  onPeer: (callback: (data: { peerId: string; peer: Peer }) => void) =>
    subscribe<{ peerId: string; peer: Peer }>('idaz:chat:peer', callback),
  onCleared: (callback: (data: { peerId: string }) => void) =>
    subscribe<{ peerId: string }>('idaz:chat:cleared', callback),
  onTyping: (callback: (data: { peerId: string; typing: boolean }) => void) =>
    subscribe<{ peerId: string; typing: boolean }>('idaz:chat:typing', callback),
  onFocusMessage: (callback: (data: { messageId: string }) => void) =>
    subscribe<{ messageId: string }>('idaz:chat:focusMessage', callback),
  onMedia: (
    callback: (data: { peerId: string; messageId: string; media: Message['media']; url: string | null }) => void,
  ) =>
    subscribe<{ peerId: string; messageId: string; media: Message['media']; url: string | null }>(
      'idaz:media:update',
      callback,
    ),
  onPrompt: (callback: (prompt: AuthPrompt) => void) => subscribe<AuthPrompt>('idaz:auth:prompt', callback),
  onSettings: (callback: (settings: Settings) => void) =>
    subscribe<Settings>('idaz:settings:update', callback),
  onSound: (callback: (data: { name: string; settings: Settings }) => void) =>
    subscribe<{ name: string; settings: Settings }>('idaz:sound:play', callback),
  control: (action: 'minimize' | 'maximize' | 'close') => bridge?.control(action),
  closeWindow: () => bridge?.closeWindow(),
}
