import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { MediaPayload } from '../types'
import { Download, Folder } from '../components/Icons'
import { formatBytes, kindLabel } from '../lib/format'

export function Viewer({ peerId, messageId }: { peerId: string; messageId: string }) {
  const [data, setData] = useState<MediaPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!peerId || !messageId) {
      setError('No media was selected.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const info = await api.getMedia(peerId, messageId)
      setData(info)
      if (!info.url) {
        const downloaded = await api.downloadMedia(peerId, messageId)
        setData(downloaded)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this media.')
    } finally {
      setBusy(false)
    }
  }, [peerId, messageId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return api.onMedia(({ peerId: id, messageId: msgId, media, url }) => {
      if (id !== peerId || msgId !== messageId) return
      setData((previous) =>
        previous
          ? { ...previous, message: { ...previous.message, media: { ...previous.message.media, ...media } }, url: url || previous.url }
          : previous,
      )
    })
  }, [peerId, messageId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') api.closeWindow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const save = async () => {
    try {
      const result = await api.saveMedia(peerId, messageId)
      if (result.ok && result.path) {
        setSavedPath(result.path)
        setTimeout(() => setSavedPath(null), 4000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the file.')
    }
  }

  const openFile = async () => {
    try {
      await api.openMediaExternally(peerId, messageId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the file.')
    }
  }

  const media = data?.message.media
  const url = data?.url
  const kind = data?.message.kind || 'file'
  const name = media?.name || kindLabel(kind, media?.mime)

  return (
    <div className="viewer">
      <div className="viewer-bar">
        <div className="viewer-heading">
          <div className="viewer-title">{name}</div>
          <div className="viewer-sub">
            {kindLabel(kind, media?.mime)}
            {media?.size ? ` · ${formatBytes(media.size)}` : ''}
            {data?.peer ? ` · ${data.peer.name}` : ''}
          </div>
        </div>
        <div className="viewer-actions">
          <button type="button" className="btn" onClick={save} title="Save a copy">
            <Download size={13} />
            Save
          </button>
          {kind === 'file' ? (
            <button type="button" className="btn" onClick={openFile} title="Open with the default app">
              <Folder size={13} />
              Open
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => api.closeWindow()} title="Close viewer">
            Close
          </button>
        </div>
      </div>

      <div className="viewer-stage">
        {error ? (
          <div className="viewer-message">
            <div className="viewer-message-title">Could not load this media</div>
            <div className="viewer-message-body">{error}</div>
            <button type="button" className="btn primary" onClick={load}>
              Try again
            </button>
          </div>
        ) : busy && !url ? (
          <div className="viewer-message">
            <div className="spinner" />
            <div className="viewer-message-body">Downloading from {data?.peer?.service === 'telegram' ? 'Telegram' : 'WhatsApp'}…</div>
          </div>
        ) : !url ? (
          <div className="viewer-message">
            <div className="viewer-message-body">This media is not available.</div>
          </div>
        ) : kind === 'image' || kind === 'sticker' ? (
          <img className="viewer-image" src={url} alt={name} />
        ) : kind === 'gif' && media?.mime?.startsWith('image/') ? (
          <img className="viewer-image" src={url} alt={name} />
        ) : kind === 'gif' ? (
          <video className="viewer-video" src={url} autoPlay loop muted playsInline controls />
        ) : kind === 'video' ? (
          <video className="viewer-video" src={url} autoPlay controls playsInline />
        ) : kind === 'audio' ? (
          <div className="viewer-file">
            <div className="viewer-file-icon">AUD</div>
            <div className="viewer-file-name">{name}</div>
            <audio src={url} controls autoPlay />
          </div>
        ) : (
          <div className="viewer-file">
            <div className="viewer-file-icon">{name.includes('.') ? name.split('.').pop()?.slice(0, 4).toUpperCase() : 'FILE'}</div>
            <div className="viewer-file-name">{name}</div>
            <div className="viewer-file-sub">{formatBytes(media?.size)}</div>
            <div className="row center">
              <button type="button" className="btn primary" onClick={save}>
                Save as…
              </button>
              <button type="button" className="btn" onClick={openFile}>
                Open file
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="viewer-foot">
        {savedPath ? <span className="saved-path">Saved to {savedPath}</span> : <span>Press Esc to close</span>}
      </div>
    </div>
  )
}
