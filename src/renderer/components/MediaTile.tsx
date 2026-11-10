import type { Message } from '../types'
import { formatBytes, kindLabel } from '../lib/format'
import { Play } from './Icons'

interface MediaTileProps {
  message: Message
  onOpen: () => void
}

export function MediaTile({ message, onOpen }: MediaTileProps) {
  const media = message.media
  if (!media) return null
  const src = media.url || media.thumbDataUrl

  if (message.kind === 'file' || message.kind === 'audio') {
    const label = media.name || (message.kind === 'audio' ? 'Voice message' : 'Attachment')
    const ext = label.includes('.') ? label.split('.').pop()?.slice(0, 4).toUpperCase() : message.kind === 'audio' ? 'AUD' : 'FILE'
    return (
      <button type="button" className="file-card" onClick={onOpen} title={`Open ${label}`}>
        <span className="file-icon">{ext}</span>
        <span className="file-meta">
          <span className="file-name">{label}</span>
          <span className="file-sub">
            {formatBytes(media.size)}
            {media.size ? ' · ' : ''}
            {kindLabel(message.kind, media.mime)}
            {media.downloadState === 'downloading' ? ' · loading…' : ''}
          </span>
        </span>
      </button>
    )
  }

  const showPlay = message.kind === 'video' || message.kind === 'gif'
  const animatedVideo = message.kind === 'gif' && !!media.url && !!media.mime?.startsWith('video')

  return (
    <button
      type="button"
      className={`media-tile${message.kind === 'sticker' ? ' sticker' : ''}${showPlay ? ' video' : ''}`}
      onClick={onOpen}
      title="Open fullscreen"
    >
      {animatedVideo ? (
        <video className="media-inline-video" src={media.url} autoPlay loop muted playsInline />
      ) : src ? (
        <img src={src} alt={media.name || message.kind} loading="lazy" draggable={false} />
      ) : (
        <span className="media-placeholder">
          {message.kind === 'sticker' ? 'Sticker' : media.name || kindLabel(message.kind, media.mime)}
        </span>
      )}
      {message.kind === 'gif' ? <span className="media-tag">GIF</span> : null}
      {message.kind === 'video' ? <span className="media-tag">Video</span> : null}
      {src && showPlay ? (
        <span className="media-play">
          <span>
            <Play size={16} />
          </span>
        </span>
      ) : null}
      {media.downloadState === 'downloading' ? <span className="media-loading">Loading…</span> : null}
      {!src && media.downloadState !== 'downloading' ? (
        <span className="media-loading">Click to load</span>
      ) : null}
    </button>
  )
}
