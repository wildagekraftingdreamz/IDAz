import type { MessageKind, Service } from '../types'

export function initials(name: string): string {
  const parts = String(name || '?')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function hueFor(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 360
  return hash
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function rosterTime(ts: number): string {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  if (ts >= startOfToday) return clockTime(ts)
  if (ts >= startOfYesterday) return 'Yest.'
  if (now.getTime() - ts < 6 * 86400000) {
    return date.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function dayLabel(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= startOfToday) return 'Today'
  if (ts >= startOfToday - 86400000) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatBytes(bytes?: number): string {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function serviceName(service: Service): string {
  return service === 'whatsapp' ? 'WhatsApp' : 'Telegram'
}

export function kindLabel(kind: MessageKind, mime?: string): string {
  if (kind === 'image') return 'Photo'
  if (kind === 'video') return 'Video'
  if (kind === 'gif') return 'Animation'
  if (kind === 'sticker') return 'Sticker'
  if (kind === 'audio') return 'Audio'
  if (mime?.includes('pdf')) return 'Document'
  return 'File'
}
