export type Service = 'whatsapp' | 'telegram'
export type MessageKind = 'text' | 'image' | 'video' | 'gif' | 'sticker' | 'file' | 'audio'
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
export type DownloadState = 'none' | 'downloading' | 'ready' | 'error'
export type Skin = 'teal' | 'classic' | 'plum' | 'amber'
export type FontSize = 'sm' | 'md' | 'lg' | 'xl'

export interface MediaInfo {
  kind?: MessageKind
  mime?: string
  name?: string
  size?: number
  width?: number
  height?: number
  duration?: number
  localPath?: string
  thumbDataUrl?: string
  downloadState?: DownloadState
  error?: string
  url?: string
}

export interface Message {
  id: string
  peerId: string
  service: Service
  fromMe: boolean
  ts: number
  kind: MessageKind
  text?: string
  author?: string
  status?: MessageStatus
  remoteId?: string
  media?: MediaInfo
}

export interface Peer {
  id: string
  service: Service
  name: string
  isGroup: boolean
  unread: number
  lastTs: number
  lastPreview: string
  lastFromMe: boolean
  muted: boolean
  typing: boolean
  username?: string | null
}

export interface SearchHit {
  peerId: string
  peerName: string
  service: Service
  messageId: string
  ts: number
  fromMe: boolean
  kind: MessageKind
  text: string
  hasText: boolean
  author?: string | null
}

export interface AccountInfo {
  state: 'off' | 'connecting' | 'qr' | 'connected' | 'error' | 'logged_out'
  detail: string
  qr: string | null
  linked: boolean
  name: string | null
  phone: string | null
  label: string
}

export type Accounts = Record<Service, AccountInfo>

export interface Settings {
  skin: Skin
  fontSize: FontSize
  sound: boolean
  volume: number
  previews: boolean
  telegramApiId: string
  telegramApiHash: string
}

export interface Bootstrap {
  settings: Settings
  accounts: Accounts
  peers: Peer[]
  platform: string
  version: string
  demo: boolean
}

export interface AuthPrompt {
  id: string
  service: Service
  kind: 'phone' | 'code' | 'password'
  hint?: string
  at: number
}

export interface ChatPayload {
  peer: Peer | null
  messages: Message[]
  hasMore: boolean
}

export interface MediaPayload {
  peer: Peer | null
  message: Message
  url: string | null
}

export interface SendResult {
  ok: boolean
  error?: string
  message?: Message
  cancelled?: boolean
  results?: SendResult[]
}
