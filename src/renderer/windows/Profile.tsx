import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Peer } from '../types'
import { Avatar } from '../components/Avatar'
import { TitleBar } from '../components/TitleBar'
import { Bell, BellOff } from '../components/Icons'
import { serviceName } from '../lib/format'

function activityLabel(ts: number): string {
  if (!ts) return 'No messages yet'
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function Profile({ peerId }: { peerId: string }) {
  const [peer, setPeer] = useState<Peer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPeer(null)
    setError(null)
    setNotice(null)
    setLoading(true)
    if (!peerId) {
      setError('No contact was selected.')
      setLoading(false)
      return
    }

    const applyRoster = (next: Peer[]) => {
      if (!alive) return
      const found = next.find((item) => item.id === peerId)
      if (found) setPeer(found)
    }

    api
      .bootstrap()
      .then((data) => {
        if (!alive) return
        const found = data.peers.find((item) => item.id === peerId)
        if (found) setPeer(found)
        else setError('This profile is no longer available.')
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'Could not load this profile.')
        setLoading(false)
      })

    const offRoster = api.onRoster(applyRoster)
    const offPeer = api.onPeer(({ peerId: id, peer: next }) => {
      if (alive && id === peerId) setPeer(next)
    })
    return () => {
      alive = false
      offRoster()
      offPeer()
    }
  }, [peerId])

  const openChat = () => {
    if (!peer) return
    setNotice(null)
    api.openChat(peer.id).catch((err) => {
      setNotice(err instanceof Error ? err.message : 'Could not open this chat.')
    })
  }

  const toggleMute = async () => {
    if (!peer) return
    setNotice(null)
    try {
      const result = await api.setMuted(peer.id, !peer.muted)
      if (result.ok && result.peer) setPeer(result.peer)
      else setNotice(result.error || 'Could not change notifications.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not change notifications.')
    }
  }

  return (
    <div className="contact-profile window" data-peer-profile={peer?.id || peerId}>
      <TitleBar title="Profile" subtitle={peer ? serviceName(peer.service) : 'Contact'} />

      {loading ? (
        <div className="contact-profile-loading">Loading profile…</div>
      ) : error ? (
        <div className="contact-profile-loading error">
          <div className="contact-profile-placeholder-title">Could not open this profile</div>
          <div>{error}</div>
        </div>
      ) : peer ? (
        <>
          <div className="contact-profile-body">
            <div className="contact-profile-hero">
              <Avatar name={peer.name} service={peer.service} size={72} group={peer.isGroup} muted={peer.muted} />
              <div className="contact-profile-name" data-profile-name>
                {peer.name}
              </div>
              <div className="contact-profile-sub">
                {serviceName(peer.service)}
                {peer.isGroup ? ' · Group' : ''}
              </div>
              <div className="contact-profile-flags">
                <span className="contact-profile-unread" data-profile-unread={peer.unread}>
                  {peer.unread > 0 ? `${peer.unread} unread` : 'No unread'}
                </span>
                <span className="contact-profile-muted" data-profile-muted={peer.muted}>
                  {peer.muted ? 'Muted' : 'Notifications on'}
                </span>
              </div>
            </div>

            <dl className="contact-profile-details">
              <div data-profile-field="service">
                <dt>Service</dt>
                <dd>{serviceName(peer.service)}</dd>
              </div>
              <div data-profile-field="username">
                <dt>Username</dt>
                <dd>{peer.username ? `@${peer.username}` : 'Not available'}</dd>
              </div>
              <div data-profile-field="conversation">
                <dt>Conversation</dt>
                <dd>{peer.isGroup ? 'Group chat' : 'Direct message'}</dd>
              </div>
              <div data-profile-field="activity">
                <dt>Last activity</dt>
                <dd>
                  {peer.lastTs ? <time dateTime={new Date(peer.lastTs).toISOString()}>{activityLabel(peer.lastTs)}</time> : activityLabel(0)}
                </dd>
              </div>
              <div data-profile-field="notifications">
                <dt>Notifications</dt>
                <dd>{peer.muted ? 'Muted' : 'On'}</dd>
              </div>
            </dl>
          </div>

          {notice ? (
            <div className="contact-profile-notice" role="alert">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
                ×
              </button>
            </div>
          ) : null}

          <div className="contact-profile-actions">
            <button type="button" className="btn primary" data-profile-action="open-chat" onClick={openChat}>
              Open chat
            </button>
            <button
              type="button"
              className="btn"
              data-profile-action="mute"
              data-muted={peer.muted}
              aria-pressed={peer.muted}
              title={peer.muted ? 'Unmute notifications' : 'Mute notifications'}
              onClick={toggleMute}
            >
              {peer.muted ? <BellOff size={12} /> : <Bell size={12} />}
              {peer.muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </>
      ) : (
        <div className="contact-profile-loading error">This profile is no longer available.</div>
      )}
    </div>
  )
}
