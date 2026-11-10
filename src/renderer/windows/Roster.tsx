import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { api } from '../api'
import type { Accounts, Peer, SearchHit, Service, Settings } from '../types'
import { Avatar } from '../components/Avatar'
import { TitleBar } from '../components/TitleBar'
import { SettingsPanel } from '../components/SettingsPanel'
import { Bell, BellOff, ChevronDown, ChevronUp, Copy, Gear, Search, Logo, User } from '../components/Icons'
import { rosterTime, serviceName } from '../lib/format'

function accountLine(accounts: Accounts | null, demo: boolean): string {
  if (demo) return 'Demo mode · nothing connected'
  if (!accounts) return 'Starting up…'
  const parts: string[] = []
  if (accounts.whatsapp?.state === 'connected') parts.push('WhatsApp online')
  else if (accounts.whatsapp?.state === 'connecting' || accounts.whatsapp?.state === 'qr') parts.push('WhatsApp linking…')
  if (accounts.telegram?.state === 'connected') parts.push('Telegram online')
  else if (accounts.telegram?.state === 'connecting' || accounts.telegram?.state === 'qr') parts.push('Telegram linking…')
  if (!parts.length) return 'No accounts linked yet'
  return parts.join(' · ')
}

function highlightMatch(text: string, query: string) {
  const needle = query.trim()
  if (!needle) return text
  const at = text.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  )
}

type RosterMenu =
  | { kind: 'contact'; peerId: string; x: number; y: number }
  | { kind: 'hit'; hit: SearchHit; x: number; y: number }

export function Roster() {
  const [peers, setPeers] = useState<Peer[]>([])
  const [accounts, setAccounts] = useState<Accounts | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [version, setVersion] = useState('1.0.0')
  const [demo, setDemo] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [activeHit, setActiveHit] = useState(0)
  const [filter, setFilter] = useState<'all' | Service>('all')
  const [hitPeer, setHitPeer] = useState<{ id: string; name: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [contextMenu, setContextMenu] = useState<RosterMenu | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => new Date())

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const shortcutsButtonRef = useRef<HTMLButtonElement | null>(null)
  const shortcutsCloseRef = useRef<HTMLButtonElement | null>(null)
  const activeHitRef = useRef<HTMLButtonElement | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const lastActiveRef = useRef(0)

  useEffect(() => {
    let alive = true
    api
      .bootstrap()
      .then((data) => {
        if (!alive) return
        setPeers(data.peers)
        setAccounts(data.accounts)
        setSettings(data.settings)
        setVersion(data.version)
        setDemo(data.demo)
      })
      .catch(() => {})
    const offRoster = api.onRoster((next) => setPeers(next))
    const offAccounts = api.onAccounts((next) => setAccounts(next))
    const offSettings = api.onSettings((next) => setSettings(next))
    const timer = window.setInterval(() => setClock(new Date()), 20000)
    return () => {
      alive = false
      offRoster()
      offAccounts()
      offSettings()
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const needle = query.trim()
    if (needle.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    let alive = true
    setHits([])
    setSearching(true)
    const timer = window.setTimeout(() => {
      api
        .search(needle, 40)
        .then((results) => {
          if (!alive) return
          setHits(results)
          setSearching(false)
        })
        .catch(() => {
          if (!alive) return
          setHits([])
          setSearching(false)
        })
    }, 180)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [query])

  const needle = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    return peers.filter((peer) => {
      if (hitPeer && peer.id !== hitPeer.id) return false
      if (filter !== 'all' && peer.service !== filter) return false
      if (!needle) return true
      return peer.name.toLowerCase().includes(needle)
    })
  }, [peers, needle, filter, hitPeer])

  const hitsForFilter = useMemo(() => {
    let results = filter === 'all' ? hits : hits.filter((hit) => hit.service === filter)
    if (hitPeer) results = results.filter((hit) => hit.peerId === hitPeer.id)
    return results
  }, [hits, filter, hitPeer])
  const hitCount = hitsForFilter.length
  const activeIndex = hitCount ? Math.min(activeHit, hitCount - 1) : 0
  const activeResult = hitsForFilter[activeIndex]

  const openHit = (hit: SearchHit) => {
    api.openChat(hit.peerId, hit.messageId).catch(() => {})
  }

  const openScopedChat = () => {
    if (!hitPeer) return
    setActionError(null)
    api.openChat(hitPeer.id).catch((err) => {
      setActionError(err instanceof Error ? err.message : 'Could not open this conversation.')
    })
  }

  const stepHit = (delta: number) => {
    if (!hitCount) return
    setActiveHit((current) => {
      const safe = current >= 0 && current < hitCount ? current : 0
      return (safe + delta + hitCount) % hitCount
    })
  }

  const openActiveHit = () => {
    if (activeResult) openHit(activeResult)
  }

  const closeShortcuts = () => {
    setShowShortcuts(false)
    window.requestAnimationFrame(() => shortcutsButtonRef.current?.focus())
  }

  useEffect(() => {
    setActiveHit(0)
  }, [query, filter, hitPeer])

  useEffect(() => {
    if (query.trim().length < 2) setHitPeer(null)
  }, [query])

  useEffect(() => {
    if (activeIndex !== lastActiveRef.current) {
      activeHitRef.current?.scrollIntoView({ block: 'nearest' })
      lastActiveRef.current = activeIndex
    }
  }, [activeIndex])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showShortcuts) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeShortcuts()
        }
        return
      }
      if (showSettings || contextMenu) return
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }
      if (event.key === 'F3' && hitCount > 0) {
        event.preventDefault()
        stepHit(event.shiftKey ? -1 : 1)
        return
      }
      if (hitPeer && event.altKey && event.key === 'Enter') {
        event.preventDefault()
        openScopedChat()
        return
      }
      if (hitPeer && event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        openProfile(hitPeer)
        return
      }
      if (hitPeer && event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setHitPeer(null)
        return
      }
      if (event.key === 'Escape' && query) {
        event.preventDefault()
        setQuery('')
        searchInputRef.current?.blur()
        return
      }
      if (!hitCount || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
      const target = event.target as HTMLElement | null
      const editing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || !!target?.isContentEditable
      if (!editing) {
        event.preventDefault()
        stepHit(event.key === 'ArrowDown' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSettings, contextMenu, query, hitCount, hitPeer, showShortcuts])

  useEffect(() => {
    if (!showShortcuts) return
    shortcutsCloseRef.current?.focus()
  }, [showShortcuts])

  useEffect(() => {
    if (!actionError) return
    const timer = window.setTimeout(() => setActionError(null), 4500)
    return () => window.clearTimeout(timer)
  }, [actionError])

  useEffect(() => {
    setContextMenu(null)
  }, [query, filter, hitPeer, showSettings])

  const focusContactRow = (peerId: string) => {
    window.requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-contact-row]')).find(
        (node) => node.dataset.contactRow === peerId,
      )
      row?.focus()
    })
  }

  const focusHitButton = (messageId: string) => {
    window.requestAnimationFrame(() => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-search-result]')).find(
        (node) => node.dataset.searchResult === messageId,
      )
      button?.focus()
    })
  }

  const closeContextMenu = (restoreFocus = false) => {
    const target = contextMenu
    setContextMenu(null)
    if (!restoreFocus || !target) return
    if (target.kind === 'contact') focusContactRow(target.peerId)
    else focusHitButton(target.hit.messageId)
  }

  useEffect(() => {
    if (!contextMenu) return
    contextMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        const target = contextMenu
        setContextMenu(null)
        if (target.kind === 'contact') focusContactRow(target.peerId)
        else focusHitButton(target.hit.messageId)
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
      const items = Array.from(
        contextMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || [],
      )
      if (!items.length) return
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      let next = current
      if (event.key === 'ArrowDown') next = (current + 1) % items.length
      if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length
      if (event.key === 'Home') next = 0
      if (event.key === 'End') next = items.length - 1
      event.preventDefault()
      items[Math.max(0, next)]?.focus()
    }
    const close = () => setContextMenu(null)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    document.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  const totalUnread = peers.reduce((sum, peer) => sum + (peer.unread || 0), 0)
  const selfService: Service = accounts?.whatsapp?.linked ? 'whatsapp' : 'telegram'
  const selfName = accounts?.[selfService]?.name || (demo ? 'IDAz Demo' : 'Not signed in')
  const connected = ['whatsapp', 'telegram'].filter((service) => accounts?.[service as Service]?.state === 'connected')
  const showSearch = query.trim().length > 0
  const menuPeerId = contextMenu
    ? contextMenu.kind === 'contact'
      ? contextMenu.peerId
      : contextMenu.hit.peerId
    : null
  const contextPeer = menuPeerId ? peers.find((peer) => peer.id === menuPeerId) || null : null

  const openLogin = () => {
    api.openLogin().catch(() => {})
  }

  const toggleMute = async (peer: Peer) => {
    setActionError(null)
    try {
      const result = await api.setMuted(peer.id, !peer.muted)
      const updated = result.peer
      if (result.ok && updated) {
        setPeers((prev) => prev.map((item) => (item.id === peer.id ? updated : item)))
      } else {
        setActionError(result.error || 'Could not change notifications.')
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not change notifications.')
    }
  }

  const markPeerRead = async (peer: Peer) => {
    setActionError(null)
    try {
      const result = await api.markRead(peer.id)
      if (!result.ok) {
        setActionError('Could not mark this chat as read.')
        return
      }
      setPeers((prev) => prev.map((item) => (item.id === peer.id ? { ...item, unread: 0 } : item)))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not mark this chat as read.')
    }
  }

  const clearPeerUnread = async (peer: Peer) => {
    setActionError(null)
    try {
      const result = await api.clearUnread(peer.id)
      if (!result.ok) {
        setActionError('Could not clear unread messages.')
        return
      }
      setPeers((prev) => prev.map((item) => (item.id === peer.id ? { ...item, unread: 0 } : item)))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not clear unread messages.')
    }
  }

  const copyHit = async (hit: SearchHit) => {
    setActionError(null)
    closeContextMenu(true)
    try {
      const result = await api.copyMessage(hit.peerId, hit.messageId)
      if (!result.ok) setActionError(result.error || 'Could not copy the message text.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not copy the message text.')
    }
  }

  const openProfile = (peer: { id: string }) => {
    setActionError(null)
    api.openProfile(peer.id).catch((err) => {
      setActionError(err instanceof Error ? err.message : 'Could not open this profile.')
    })
  }

  const openMenuAt = (peerId: string, x: number, y: number) => {
    const width = 210
    const height = 190
    setContextMenu({
      kind: 'contact',
      peerId,
      x: Math.max(6, Math.min(x, window.innerWidth - width - 6)),
      y: Math.max(6, Math.min(y, window.innerHeight - height - 6)),
    })
  }

  const openHitMenuAt = (hit: SearchHit, x: number, y: number) => {
    const width = 220
    const height = 260
    setContextMenu({
      kind: 'hit',
      hit,
      x: Math.max(6, Math.min(x, window.innerWidth - width - 6)),
      y: Math.max(6, Math.min(y, window.innerHeight - height - 6)),
    })
  }

  const openContextMenu = (event: ReactMouseEvent, peer: Peer) => {
    event.preventDefault()
    event.stopPropagation()
    openMenuAt(peer.id, event.clientX, event.clientY)
  }

  const openHitContextMenu = (event: ReactMouseEvent, hit: SearchHit) => {
    event.preventDefault()
    event.stopPropagation()
    openHitMenuAt(hit, event.clientX, event.clientY)
  }

  const previewFor = (peer: Peer) => {
    if (peer.typing) return 'typing…'
    if (!settings?.previews && peer.lastPreview) return peer.lastFromMe ? 'You sent a message' : 'New message'
    if (!peer.lastPreview) return 'No messages yet'
    return `${peer.lastFromMe ? 'You: ' : ''}${peer.lastPreview}`
  }

  const renderContact = (peer: Peer) => (
    <li
      key={peer.id}
      className="contact-item"
      onContextMenu={(event) => openContextMenu(event, peer)}
    >
      <button
        type="button"
        className="contact-row"
        data-contact-row={peer.id}
        data-muted={peer.muted ? 'true' : undefined}
        onClick={() => api.openChat(peer.id).catch(() => {})}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            openMenuAt(peer.id, rect.left + 28, rect.top + rect.height / 2)
          }
        }}
      >
        <Avatar name={peer.name} service={peer.service} size={34} group={peer.isGroup} />
        <span className="contact-main">
          <span className="contact-top">
            <span className="contact-name">{peer.name}</span>
            <span className="contact-time">{rosterTime(peer.lastTs)}</span>
          </span>
          <span className="contact-bottom">
            <span className={`contact-preview${peer.typing ? ' typing' : ''}`}>{previewFor(peer)}</span>
            {peer.unread > 0 ? (
              <span className="unread-badge">{peer.unread > 99 ? '99+' : peer.unread}</span>
            ) : null}
          </span>
        </span>
        <span className="service-rail" data-service={peer.service} title={serviceName(peer.service)} />
      </button>
      <button
        type="button"
        className="contact-mute"
        data-contact-mute={peer.id}
        data-muted={peer.muted ? 'true' : undefined}
        aria-label={peer.muted ? `Unmute ${peer.name}` : `Mute ${peer.name}`}
        aria-pressed={peer.muted}
        title={peer.muted ? 'Unmute notifications' : 'Mute notifications'}
        onClick={() => toggleMute(peer)}
      >
        {peer.muted ? <BellOff size={11} /> : <Bell size={11} />}
      </button>
    </li>
  )

  const renderHit = (hit: SearchHit, index: number) => {
    const active = index === activeIndex
    return (
    <li key={`${hit.peerId}:${hit.messageId}`}>
      <button
        ref={active ? activeHitRef : undefined}
        type="button"
        className="search-hit"
        data-search-result={hit.messageId}
        data-search-result-peer={hit.peerId}
        data-search-result-index={index}
        data-active={active ? 'true' : undefined}
        aria-current={active ? 'true' : undefined}
        data-service={hit.service}
        onClick={() => {
          setActiveHit(index)
          openHit(hit)
        }}
        onContextMenu={(event) => openHitContextMenu(event, hit)}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            openHitMenuAt(hit, rect.left + 30, rect.top + rect.height / 2)
          }
        }}
      >
        <Avatar name={hit.peerName} service={hit.service} size={26} />
        <span className="hit-main">
          <span className="hit-top">
            <span className="hit-peer">{hit.peerName}</span>
            <span className="hit-time">{rosterTime(hit.ts)}</span>
          </span>
          <span className="hit-text">
            {hit.fromMe ? <span className="hit-from">You: </span> : null}
            {highlightMatch(hit.text, query)}
          </span>
        </span>
        <span className="service-rail" data-service={hit.service} title={serviceName(hit.service)} />
      </button>
    </li>
    )
  }

  return (
    <div className="roster window">
      <TitleBar
        title="IDAz"
        subtitle={demo ? 'demo' : connected.length ? `${connected.length} online` : undefined}
        badge={totalUnread}
        onSettings={() => setShowSettings(true)}
      />

      <div className="profile">
        <Avatar name={selfName} service={selfService} size={40} />
        <div className="profile-info">
          <div className="profile-name">{selfName}</div>
          <div className="profile-status">{accountLine(accounts, demo)}</div>
        </div>
        <div className="profile-actions">
          <button type="button" className="icon-btn" onClick={openLogin} title="Link an account" aria-label="Link an account">
            +
          </button>
          <button
            ref={shortcutsButtonRef}
            type="button"
            className="icon-btn roster-help"
            data-roster-help
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            aria-expanded={showShortcuts}
            aria-controls="roster-shortcuts"
          >
            ?
          </button>
          <button type="button" className="icon-btn" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
            <Gear size={13} />
          </button>
        </div>
      </div>

      <div className="searchbar">
        <div className="search-wrap">
          <Search size={13} />
          <input
            ref={searchInputRef}
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (!hitCount) return
                event.preventDefault()
                stepHit(event.key === 'ArrowDown' ? 1 : -1)
              } else if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && hitCount > 0) {
                event.preventDefault()
                openActiveHit()
              }
            }}
            placeholder="Search messages or contacts…"
            aria-label="Search messages and contacts"
            title="Search messages and contacts (Ctrl/Cmd+F)"
          />
        </div>
      </div>

      <div className="filters" role="tablist" aria-label="Filter contacts">
        <button type="button" className="chip" data-active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </button>
        <button type="button" className="chip" data-active={filter === 'whatsapp'} onClick={() => setFilter('whatsapp')}>
          WhatsApp
        </button>
        <button type="button" className="chip" data-active={filter === 'telegram'} onClick={() => setFilter('telegram')}>
          Telegram
        </button>
      </div>

      {hitPeer ? (
        <div className="search-scope">
          <span className="search-scope-label">
            In <strong>{hitPeer.name}</strong>
          </span>
          <button
            type="button"
            className="search-scope-jump"
            data-scope-jump={hitPeer.id}
            onClick={openScopedChat}
            title={`Open chat with ${hitPeer.name} (Alt+Enter)`}
            aria-label={`Open chat with ${hitPeer.name}`}
            aria-keyshortcuts="Alt+Enter"
          >
            <span aria-hidden="true">↗</span> Open chat
          </button>
          <button
            type="button"
            className="search-scope-profile"
            data-scope-profile={hitPeer.id}
            onClick={() => openProfile(hitPeer)}
            title={`Open profile for ${hitPeer.name} (Alt+P)`}
            aria-label={`Open profile for ${hitPeer.name}`}
            aria-keyshortcuts="Alt+P"
          >
            <User size={10} /> Profile
          </button>
          <button
            type="button"
            className="search-scope-clear"
            data-scope-clear
            onClick={() => setHitPeer(null)}
            title="Search all conversations (Alt+A)"
            aria-label="Search all conversations"
            aria-keyshortcuts="Alt+A"
          >
            All chats
          </button>
        </div>
      ) : null}

      {peers.length === 0 ? (
        <div className="empty-state">
          <Logo size={44} />
          <div className="empty-title">Your contact list is empty</div>
          <p className="empty-copy">
            Link WhatsApp with a QR scan, or sign in to Telegram with a QR code or your phone number. Your
            session is remembered on this computer.
          </p>
          <div className="row center">
            <button type="button" className="btn primary" onClick={openLogin}>
              Link an account
            </button>
          </div>
        </div>
      ) : showSearch && filtered.length === 0 && hitsForFilter.length === 0 && !searching ? (
        <div className="empty-state">
          <Logo size={44} />
          <div className="empty-title">Nothing matches “{query.trim()}”</div>
          <p className="empty-copy">
            {query.trim().length < 2
              ? 'Type at least two characters to search message history.'
              : 'Try another word, or switch back to All.'}
          </p>
        </div>
      ) : showSearch ? (
        <ul className="contact-list">
          {filtered.length > 0 ? (
            <>
              <li className="search-section">
                <span>Contacts</span>
                <span>{filtered.length}</span>
              </li>
              {filtered.map(renderContact)}
            </>
          ) : null}
          <li className="search-section">
            <span>Messages</span>
            <span className="search-nav">
              <span className="search-position" aria-live="polite">
                {searching ? '…' : `${hitCount ? activeIndex + 1 : 0} / ${hitCount}`}
              </span>
              <button
                type="button"
                className="search-step"
                data-direction="prev"
                onClick={() => stepHit(-1)}
                disabled={hitCount < 2}
                title="Previous result (Shift+F3)"
                aria-label="Previous message result"
              >
                <ChevronUp size={10} />
              </button>
              <button
                type="button"
                className="search-step"
                data-direction="next"
                onClick={() => stepHit(1)}
                disabled={hitCount < 2}
                title="Next result (F3)"
                aria-label="Next message result"
              >
                <ChevronDown size={10} />
              </button>
            </span>
          </li>
          {query.trim().length < 2 ? (
            <li className="search-status">Type at least two characters to search message history.</li>
          ) : searching && hitCount === 0 ? (
            <li className="search-status">Searching messages…</li>
          ) : hitCount === 0 ? (
            <li className="search-status">No messages match “{query.trim()}”.</li>
          ) : (
            <>
              {hitsForFilter.map(renderHit)}
              <li className="search-hints" aria-hidden="true">
                <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
                <span><kbd>Enter</kbd> open</span>
                {hitPeer ? (
                  <>
                    <span>
                      <kbd>Alt</kbd>+<kbd>Enter</kbd> open chat
                    </span>
                    <span>
                      <kbd>Alt</kbd>+<kbd>P</kbd> profile
                    </span>
                    <span>
                      <kbd>Alt</kbd>+<kbd>A</kbd> all chats
                    </span>
                  </>
                ) : null}
                <span><kbd>F3</kbd> next</span>
                <span><kbd>Esc</kbd> clear</span>
              </li>
            </>
          )}
        </ul>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Logo size={44} />
          <div className="empty-title">No {filter === 'whatsapp' ? 'WhatsApp' : 'Telegram'} contacts</div>
          <p className="empty-copy">Switch back to All to see every conversation.</p>
        </div>
      ) : (
        <ul className="contact-list">{filtered.map(renderContact)}</ul>
      )}

      {actionError ? (
        <div className="roster-notice" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      <div className="footer">
        <span className="dot" data-on={accounts?.whatsapp?.state === 'connected'} />
        <span>WA</span>
        <span className="dot" data-on={accounts?.telegram?.state === 'connected'} />
        <span>TG</span>
        <span className="footer-spacer" />
        <span className="footer-text">IDAz {version}</span>
        <span className="footer-text mono">
          {clock.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {showSettings && settings ? (
        <SettingsPanel
          settings={settings}
          accounts={accounts}
          version={version}
          demo={demo}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      {contextMenu && contextPeer ? (
        <div
          ref={contextMenuRef}
          className="context-menu"
          role="menu"
          aria-label={
            contextMenu.kind === 'hit'
              ? `Actions for message from ${contextPeer.name}`
              : `Actions for ${contextPeer.name}`
          }
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="context-menu-head">
            <span className="context-menu-name">{contextPeer.name}</span>
            <span className="context-menu-service">{serviceName(contextPeer.service)}</span>
          </div>
          {contextMenu.kind === 'hit' ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="open-hit"
                onClick={() => {
                  const hit = contextMenu.hit
                  closeContextMenu()
                  api.openChat(hit.peerId, hit.messageId).catch(() => {})
                }}
              >
                <span className="context-menu-glyph" aria-hidden="true">↗</span>
                Open chat
              </button>
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="open-profile"
                onClick={() => {
                  closeContextMenu()
                  openProfile(contextPeer)
                }}
              >
                <User size={12} />
                Open profile
              </button>
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="copy-hit"
                disabled={!contextMenu.hit.hasText}
                title={contextMenu.hit.hasText ? 'Copy the full message text' : 'This message has no text to copy'}
                onClick={() => copyHit(contextMenu.hit)}
              >
                <Copy size={12} />
                Copy message text
              </button>
              <div className="context-menu-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="search-conversation"
                disabled={hitPeer?.id === contextMenu.hit.peerId}
                title={
                  hitPeer?.id === contextMenu.hit.peerId
                    ? 'Already searching this conversation'
                    : `Search only ${contextPeer.name}`
                }
                onClick={() => {
                  const hit = contextMenu.hit
                  closeContextMenu()
                  setFilter('all')
                  setHitPeer({ id: hit.peerId, name: hit.peerName })
                }}
              >
                <Search size={12} />
                Search this conversation
              </button>
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="search-all"
                disabled={!hitPeer}
                title={hitPeer ? 'Search every conversation' : 'Already searching all chats'}
                onClick={() => {
                  closeContextMenu()
                  setHitPeer(null)
                }}
              >
                <span className="context-menu-glyph" aria-hidden="true">↺</span>
                Search all chats
              </button>
              <div className="context-menu-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="mute"
                onClick={() => {
                  closeContextMenu()
                  toggleMute(contextPeer)
                }}
              >
                {contextPeer.muted ? <BellOff size={12} /> : <Bell size={12} />}
                {contextPeer.muted ? 'Unmute notifications' : 'Mute notifications'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                onClick={() => {
                  closeContextMenu()
                  api.openChat(contextPeer.id).catch(() => {})
                }}
              >
                <span className="context-menu-glyph" aria-hidden="true">↗</span>
                Open chat
              </button>
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="mark-read"
                disabled={contextPeer.unread === 0}
                title={
                  contextPeer.unread
                    ? 'Clear the unread badge and send read receipts'
                    : 'No unread messages'
                }
                onClick={() => {
                  closeContextMenu()
                  markPeerRead(contextPeer)
                }}
              >
                <span className="context-menu-glyph" aria-hidden="true">✓</span>
                Mark as read
              </button>
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="clear-unread"
                disabled={contextPeer.unread === 0}
                title={
                  contextPeer.unread
                    ? 'Clear the unread badge without sending read receipts'
                    : 'No unread messages'
                }
                onClick={() => {
                  closeContextMenu()
                  clearPeerUnread(contextPeer)
                }}
              >
                <span className="context-menu-glyph" aria-hidden="true">–</span>
                Clear unread
              </button>
              <div className="context-menu-sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-action="mute"
                onClick={() => {
                  closeContextMenu()
                  toggleMute(contextPeer)
                }}
              >
                {contextPeer.muted ? <BellOff size={12} /> : <Bell size={12} />}
                {contextPeer.muted ? 'Unmute notifications' : 'Mute notifications'}
              </button>
            </>
          )}
        </div>
      ) : null}

      {showShortcuts ? (
        <div
          id="roster-shortcuts"
          className="roster-shortcuts-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roster-shortcuts-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeShortcuts()
          }}
        >
          <div className="roster-shortcuts-panel">
            <div className="roster-shortcuts-head">
              <div>
                <div className="roster-shortcuts-title" id="roster-shortcuts-title">
                  Roster shortcuts
                </div>
                <div className="roster-shortcuts-sub">Search, results, and scoped chats</div>
              </div>
              <button
                ref={shortcutsCloseRef}
                type="button"
                className="roster-shortcuts-close"
                data-roster-shortcuts-close
                onClick={closeShortcuts}
                aria-label="Close keyboard shortcuts"
              >
                ×
              </button>
            </div>
            <div className="roster-shortcuts-body">
              <section className="roster-shortcuts-group">
                <div className="roster-shortcuts-group-title">Search</div>
                <dl className="roster-shortcuts-list">
                  <div>
                    <dt>
                      <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>F</kbd>
                    </dt>
                    <dd>Focus search</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Esc</kbd>
                    </dt>
                    <dd>Clear search</dd>
                  </div>
                </dl>
              </section>
              <section className="roster-shortcuts-group">
                <div className="roster-shortcuts-group-title">Results</div>
                <dl className="roster-shortcuts-list">
                  <div>
                    <dt>
                      <kbd>↑</kbd> / <kbd>↓</kbd>
                    </dt>
                    <dd>Move through results</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Enter</kbd>
                    </dt>
                    <dd>Open active result</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>F3</kbd> / <kbd>Shift</kbd>+<kbd>F3</kbd>
                    </dt>
                    <dd>Next / previous result</dd>
                  </div>
                </dl>
              </section>
              <section className="roster-shortcuts-group">
                <div className="roster-shortcuts-group-title">Scoped search</div>
                <dl className="roster-shortcuts-list">
                  <div>
                    <dt>
                      <kbd>Alt</kbd>+<kbd>Enter</kbd>
                    </dt>
                    <dd>Open scoped chat</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Alt</kbd>+<kbd>P</kbd>
                    </dt>
                    <dd>Open profile</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Alt</kbd>+<kbd>A</kbd>
                    </dt>
                    <dd>All chats</dd>
                  </div>
                </dl>
              </section>
              <p className="roster-shortcuts-note">Scoped keys apply after “Search this conversation”.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
