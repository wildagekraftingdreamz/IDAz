import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api'
import type { Message, MessageStatus, Peer } from '../types'
import { Avatar } from '../components/Avatar'
import { TitleBar } from '../components/TitleBar'
import { MediaTile } from '../components/MediaTile'
import { Attach, Bell, BellOff, Send } from '../components/Icons'
import { clockTime, dayLabel, serviceName } from '../lib/format'

function StatusMark({ status }: { status?: MessageStatus }) {
  if (!status || status === 'sending') return null
  if (status === 'failed') return <span className="status failed" title="Not sent">!</span>
  if (status === 'read') return <span className="status read" title="Read">✓✓</span>
  if (status === 'delivered') return <span className="status" title="Delivered">✓✓</span>
  return <span className="status" title="Sent">✓</span>
}

function MessageBubble({
  message,
  showAuthor,
  highlighted,
  onOpenMedia,
}: {
  message: Message
  showAuthor: boolean
  highlighted: boolean
  onOpenMedia: (message: Message) => void
}) {
  const media = message.media
  return (
    <div
      className={`msg ${message.fromMe ? 'out' : 'in'}${highlighted ? ' focus-target' : ''}`}
      data-message-bubble={message.id}
    >
      {showAuthor && message.author ? <div className="msg-author">{message.author}</div> : null}
      <div className={`bubble kind-${message.kind}`}>
        {media ? <MediaTile message={message} onOpen={() => onOpenMedia(message)} /> : null}
        {message.text ? <div className="msg-text">{message.text}</div> : null}
        {media?.downloadState === 'error' ? <div className="msg-media-error">{media.error || 'Media unavailable'}</div> : null}
        <div className="msg-meta">
          <span>{clockTime(message.ts)}</span>
          {message.fromMe ? <StatusMark status={message.status} /> : null}
        </div>
      </div>
    </div>
  )
}

export function Chat({ peerId, focusMessageId }: { peerId: string; focusMessageId?: string }) {
  const [peer, setPeer] = useState<Peer | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [olderBusy, setOlderBusy] = useState(false)
  const [peerTyping, setPeerTyping] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState(focusMessageId || '')
  const [focusSeq, setFocusSeq] = useState(0)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const stickRef = useRef(true)
  const typingAtRef = useRef(0)
  const typingTimerRef = useRef<number | null>(null)
  const requestedMedia = useRef<Set<string>>(new Set())
  const focusedRef = useRef('')

  useEffect(() => {
    let alive = true
    if (!peerId) {
      setError('No chat was selected.')
      setLoading(false)
      return
    }
    requestedMedia.current = new Set()
    setLoading(true)
    setError(null)
    stickRef.current = true
    api
      .getChat(peerId)
      .then((data) => {
        if (!alive) return
        setPeer(data.peer)
        setMessages(data.messages)
        setHasMore(data.hasMore)
        setPeerTyping(!!data.peer?.typing)
        setLoading(false)
        api.markRead(peerId).catch(() => {})
      })
      .catch((err) => {
        if (!alive) return
        setError(err?.message || 'Could not open this chat.')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [peerId])

  useEffect(() => {
    if (!peerId) return
    const offs = [
      api.onAppend(({ peerId: id, messages: incoming }) => {
        if (id !== peerId) return
        setMessages((prev) => {
          const map = new Map(prev.map((message) => [message.id, message]))
          for (const message of incoming) map.set(message.id, message)
          return Array.from(map.values()).sort((a, b) => a.ts - b.ts)
        })
      }),
      api.onPatch(({ peerId: id, messageId, patch }) => {
        if (id !== peerId) return
        setMessages((prev) => prev.map((message) => (message.id === messageId ? { ...message, ...patch } : message)))
      }),
      api.onPeer(({ peerId: id, peer: next }) => {
        if (id !== peerId) return
        setPeer(next)
      }),
      api.onTyping(({ peerId: id, typing }) => {
        if (id !== peerId) return
        setPeerTyping(typing)
      }),
      api.onFocusMessage(({ messageId }) => {
        focusedRef.current = ''
        setFocusTarget(messageId)
        setFocusSeq((value) => value + 1)
      }),
      api.onMedia(({ peerId: id, messageId, media, url }) => {
        if (id !== peerId) return
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? { ...message, media: { ...message.media, ...media, url: url || message.media?.url } }
              : message,
          ),
        )
      }),
    ]
    const onFocus = () => {
      if (document.hasFocus()) api.markRead(peerId).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('focus', onFocus)
    }
  }, [peerId])

  useEffect(() => {
    const el = logRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages, peerTyping])

  useEffect(() => {
    if (!focusTarget || loading || focusedRef.current === focusTarget) return
    const log = logRef.current
    if (!log) return
    const target = Array.from(log.querySelectorAll('[data-message-bubble]')).find(
      (node) => node.getAttribute('data-message-bubble') === focusTarget,
    )
    if (!target) return
    focusedRef.current = focusTarget
    stickRef.current = false
    target.scrollIntoView({ block: 'center' })
    setHighlightId(focusTarget)
  }, [focusTarget, focusSeq, loading, messages])

  useEffect(() => {
    if (!highlightId) return
    const timer = window.setTimeout(() => setHighlightId(null), 2800)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  useEffect(() => {
    const wanted = messages.filter(
      (message) =>
        message.media &&
        (message.kind === 'image' || message.kind === 'sticker' || message.kind === 'gif') &&
        !message.media.url &&
        !message.media.localPath &&
        message.media.downloadState !== 'error' &&
        message.media.downloadState !== 'downloading' &&
        !requestedMedia.current.has(message.id),
    )
    for (const message of wanted.slice(0, 5)) {
      requestedMedia.current.add(message.id)
      api.downloadMedia(peerId, message.id).catch(() => {})
    }
  }, [messages, peerId])

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      api.typing(peerId, false).catch(() => {})
    }
  }, [peerId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (showShortcuts) {
        setShowShortcuts(false)
        return
      }
      api.closeWindow()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showShortcuts])

  const stopTyping = () => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
    if (typingAtRef.current) {
      typingAtRef.current = 0
      api.typing(peerId, false).catch(() => {})
    }
  }

  const onDraftChange = (value: string) => {
    setDraft(value)
    const now = Date.now()
    if (value.trim() && now - typingAtRef.current > 3000) {
      typingAtRef.current = now
      api.typing(peerId, true).catch(() => {})
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => {
      typingTimerRef.current = null
      if (typingAtRef.current) {
        typingAtRef.current = 0
        api.typing(peerId, false).catch(() => {})
      }
    }, 2500)
    const el = inputRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(120, el.scrollHeight)}px`
    }
  }

  const insertText = (text: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? draft.length
    const end = input?.selectionEnd ?? start
    onDraftChange(`${draft.slice(0, start)}${text}${draft.slice(end)}`)
    window.requestAnimationFrame(() => {
      const node = inputRef.current
      if (!node) return
      node.focus()
      const caret = start + text.length
      node.setSelectionRange(caret, caret)
    })
  }

  const quoteLastMessage = (fromMe: boolean) => {
    const message = messages
      .slice()
      .reverse()
      .find((item) => item.fromMe === fromMe && item.text?.trim())
    if (!message?.text) {
      setFlash(fromMe ? 'There is no sent message to quote.' : 'There is no received message to quote.')
      return
    }
    setFlash(null)
    const input = inputRef.current
    const start = input?.selectionStart ?? draft.length
    const lead = start > 0 && draft[start - 1] !== '\n' ? '\n' : ''
    const author = peer?.isGroup && message.author ? `${message.author}: ` : ''
    const quoted = `${author}${message.text.trim()}`
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    insertText(`${lead}${quoted}\n`)
  }

  const wrapSelection = (marker: string, placeholder: string) => {
    const input = inputRef.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    const chosen = draft.slice(start, end) || placeholder
    const next = `${draft.slice(0, start)}${marker}${chosen}${marker}${draft.slice(end)}`
    onDraftChange(next)
    window.requestAnimationFrame(() => {
      const node = inputRef.current
      if (!node) return
      node.focus()
      node.setSelectionRange(start + marker.length, start + marker.length + chosen.length)
    })
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setFlash(null)
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    stopTyping()
    try {
      const result = await api.send(peerId, text)
      if (!result.ok) {
        setDraft(text)
        setFlash(result.error || 'The message could not be sent.')
      }
    } catch (err) {
      setDraft(text)
      setFlash(err instanceof Error ? err.message : 'The message could not be sent.')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const attach = async () => {
    setFlash(null)
    try {
      const result = await api.attach(peerId)
      if (!result.ok && !result.cancelled) {
        setFlash(result.error || result.results?.find((item) => item.error)?.error || 'The attachment failed.')
      }
    } catch (err) {
      setFlash(err instanceof Error ? err.message : 'The attachment failed.')
    }
  }

  const openMedia = (message: Message) => {
    api.openMedia(peerId, message.id).catch(() => {})
  }

  const toggleMute = async () => {
    if (!peer) return
    setFlash(null)
    try {
      const result = await api.setMuted(peerId, !peer.muted)
      if (result.ok && result.peer) setPeer(result.peer)
      else setFlash(result.error || 'Could not change notifications.')
    } catch (err) {
      setFlash(err instanceof Error ? err.message : 'Could not change notifications.')
    }
  }

  const loadOlder = async () => {
    setOlderBusy(true)
    setFlash(null)
    try {
      const result = await api.loadOlder(peerId)
      if (!result.ok && result.error) setFlash(result.error)
    } finally {
      setOlderBusy(false)
    }
  }

  const rendered: ReactNode[] = []
  let lastDay = ''
  let previous: Message | null = null
  for (const message of messages) {
    const day = new Date(message.ts).toDateString()
    if (day !== lastDay) {
      rendered.push(
        <div className="day-sep" key={`day-${message.id}`}>
          {dayLabel(message.ts)}
        </div>,
      )
      lastDay = day
      previous = null
    }
    const showAuthor = !message.fromMe && !!peer?.isGroup && previous?.author !== message.author
    rendered.push(
      <MessageBubble
        key={message.id}
        message={message}
        showAuthor={showAuthor}
        highlighted={message.id === highlightId}
        onOpenMedia={openMedia}
      />,
    )
    previous = message
  }

  return (
    <div className="chat window">
      <TitleBar
        title={peer?.name || 'IDAz chat'}
        subtitle={peer ? serviceName(peer.service) : undefined}
        badge={peer?.unread}
      />

      <div className="chat-header">
        <Avatar name={peer?.name || 'Chat'} service={peer?.service} size={34} group={peer?.isGroup} />
        <div className="chat-peer">
          <div className="chat-peer-name">{peer?.name || (loading ? 'Loading…' : 'Unknown chat')}</div>
          <div className={`chat-peer-status${peerTyping ? ' typing' : ''}`}>
            {peerTyping ? (
              <>
                typing<span className="typing-dots">…</span>
              </>
            ) : peer ? (
              `${serviceName(peer.service)}${peer.isGroup ? ' · group' : ''}${peer.username ? ` · @${peer.username}` : ''}${peer.muted ? ' · muted' : ''}`
            ) : (
              ''
            )}
          </div>
        </div>
        <div className="chat-header-spacer" />
        <button
          type="button"
          className="icon-btn chat-help"
          data-shortcuts-toggle
          onClick={() => setShowShortcuts(true)}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
        >
          ?
        </button>
        <button
          type="button"
          className="icon-btn chat-mute"
          data-mute-toggle
          data-muted={!!peer?.muted}
          onClick={toggleMute}
          disabled={!peer}
          title={peer?.muted ? 'Unmute notifications' : 'Mute notifications'}
          aria-label={peer?.muted ? 'Unmute notifications' : 'Mute notifications'}
        >
          {peer?.muted ? <BellOff size={13} /> : <Bell size={13} />}
        </button>
        <span className="chat-service" data-service={peer?.service}>
          {peer?.service === 'whatsapp' ? 'WA' : peer?.service === 'telegram' ? 'TG' : ''}
        </span>
      </div>

      <div
        className="chat-log"
        ref={logRef}
        onScroll={() => {
          const el = logRef.current
          if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
        }}
      >
        {hasMore ? (
          <button type="button" className="load-older" onClick={loadOlder} disabled={olderBusy}>
            {olderBusy ? 'Loading older messages…' : 'Load older messages'}
          </button>
        ) : null}

        {loading ? <div className="chat-placeholder">Opening the conversation…</div> : null}
        {!loading && !error && messages.length === 0 ? (
          <div className="chat-placeholder">
            <div className="placeholder-title">No messages yet</div>
            <div>Say hello — this window is yours now.</div>
          </div>
        ) : null}
        {error ? (
          <div className="chat-placeholder error">
            <div className="placeholder-title">Could not open this chat</div>
            <div>{error}</div>
          </div>
        ) : null}

        {rendered}

        {peerTyping ? (
          <div className="typing-row">
            <span>{peer?.name || 'They'} is typing</span>
            <span className="typing-dots">…</span>
          </div>
        ) : null}
      </div>

      {flash ? (
        <div className="composer-error">
          <span>{flash}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}

      <div className="composer">
        <button type="button" className="icon-btn attach" onClick={attach} title="Send a file" aria-label="Send a file">
          <Attach size={16} />
        </button>
        <textarea
          ref={inputRef}
          className="input composer-input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            const key = event.key.toLowerCase()
            const simpleMod = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
            if (simpleMod && (key === 'b' || key === 'i' || key === 'u')) {
              event.preventDefault()
              if (key === 'b') wrapSelection('*', 'bold text')
              else if (key === 'i') wrapSelection('_', 'italic text')
              else wrapSelection('__', 'underlined text')
              return
            }
            if (simpleMod && (key === 'r' || key === 'e')) {
              event.preventDefault()
              quoteLastMessage(key === 'e')
              return
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Type a message…"
          rows={1}
          aria-label="Message"
          title="Enter or Ctrl+Enter to send; Shift+Enter for a new line"
        />
        <button type="button" className="btn primary send" onClick={send} disabled={!draft.trim() || sending}>
          <Send size={12} />
          Send
        </button>
      </div>

      {showShortcuts ? (
        <div
          className="shortcuts-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowShortcuts(false)
          }}
        >
          <div className="shortcuts-panel">
            <div className="shortcuts-head">
              <div>
                <div className="shortcuts-title" id="shortcuts-title">
                  Keyboard shortcuts
                </div>
                <div className="shortcuts-sub">Chat and composer</div>
              </div>
              <button
                type="button"
                className="shortcuts-close"
                data-shortcuts-close
                onClick={() => setShowShortcuts(false)}
                aria-label="Close keyboard shortcuts"
              >
                ×
              </button>
            </div>
            <div className="shortcuts-body">
              <section className="shortcuts-group">
                <div className="shortcuts-group-title">Message control</div>
                <dl className="shortcuts-list">
                  <div>
                    <dt>
                      <kbd>Enter</kbd> / <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
                    </dt>
                    <dd>Send message</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Shift</kbd>+<kbd>Enter</kbd>
                    </dt>
                    <dd>New line</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Esc</kbd>
                    </dt>
                    <dd>Close chat</dd>
                  </div>
                </dl>
              </section>
              <section className="shortcuts-group">
                <div className="shortcuts-group-title">Quote</div>
                <dl className="shortcuts-list">
                  <div>
                    <dt>
                      <kbd>Ctrl</kbd>+<kbd>R</kbd>
                    </dt>
                    <dd>Quote last received message</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Ctrl</kbd>+<kbd>E</kbd>
                    </dt>
                    <dd>Quote last sent message</dd>
                  </div>
                </dl>
              </section>
              <section className="shortcuts-group">
                <div className="shortcuts-group-title">Formatting</div>
                <dl className="shortcuts-list">
                  <div>
                    <dt>
                      <kbd>Ctrl</kbd>+<kbd>B</kbd>
                    </dt>
                    <dd>Bold</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Ctrl</kbd>+<kbd>I</kbd>
                    </dt>
                    <dd>Italic</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Ctrl</kbd>+<kbd>U</kbd>
                    </dt>
                    <dd>Underline</dd>
                  </div>
                </dl>
              </section>
              <p className="shortcuts-note">Formatting wraps the selected text in message markup.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
