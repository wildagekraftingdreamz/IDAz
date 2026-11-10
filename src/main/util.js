// Small shared helpers used by the main process and both network adapters.

export function toMillis(ts) {
  if (ts === undefined || ts === null) return Date.now()
  const n = typeof ts === 'object' && typeof ts.toNumber === 'function' ? ts.toNumber() : Number(ts)
  if (!Number.isFinite(n) || n <= 0) return Date.now()
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
}

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
  zip: 'application/zip',
  txt: 'text/plain',
  json: 'application/json',
  apk: 'application/vnd.android.package-archive',
}

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
}

export function extFromName(name) {
  if (!name) return ''
  const clean = String(name).split('?')[0]
  const dot = clean.lastIndexOf('.')
  if (dot < 0 || dot === clean.length - 1) return ''
  return clean.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)
}

export function extFromMime(mime) {
  if (!mime) return ''
  return EXT_BY_MIME[String(mime).split(';')[0].trim().toLowerCase()] || ''
}

export function mimeFromExt(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || 'application/octet-stream'
}

export function kindFromExt(ext) {
  const e = String(ext || '').toLowerCase()
  if (e === 'gif') return 'gif'
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'avif'].includes(e)) return 'image'
  if (['mp4', 'm4v', 'webm', 'mov', 'mkv'].includes(e)) return 'video'
  if (['mp3', 'm4a', 'ogg', 'oga', 'opus', 'wav', 'aac', 'flac'].includes(e)) return 'audio'
  return 'file'
}

export function previewFor(kind, text, name) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  switch (kind) {
    case 'image':
      return clean ? `\u{1F4F7} ${clean}` : '\u{1F4F7} Photo'
    case 'video':
      return clean ? `\u{1F3AC} ${clean}` : '\u{1F3AC} Video'
    case 'gif':
      return clean ? `\u{1F39E} ${clean}` : '\u{1F39E} GIF'
    case 'sticker':
      return '\u{1F600} Sticker'
    case 'audio':
      return '\u{1F399} Voice message'
    case 'file':
      return `\u{1F4CE} ${name || 'File'}`
    default:
      return clean.slice(0, 160)
  }
}

export function initials(name) {
  const parts = String(name || '?')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function phoneFromJid(jid) {
  const user = String(jid || '').split('@')[0]
  const digits = user.split(':')[0].replace(/[^0-9]/g, '')
  if (!digits) return user
  if (digits.length > 10) return `+${digits.slice(0, digits.length - 10)} ${digits.slice(-10, -7)} ${digits.slice(-7, -4)} ${digits.slice(-4)}`
  return `+${digits}`
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function safeBaseName(name, fallback = 'file') {
  const base = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
  return base || fallback
}

export function makeSilentLogger() {
  const noop = () => {}
  const logger = {
    level: 'silent',
    child: () => logger,
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
  }
  return logger
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
