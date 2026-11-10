import { useState } from 'react'
import { api } from '../api'
import type { Accounts, FontSize, Settings, Skin } from '../types'
import { Avatar } from './Avatar'
import { TitleBar } from './TitleBar'

const SKINS: { id: Skin; name: string; colors: [string, string, string] }[] = [
  { id: 'teal', name: 'Deep Teal', colors: ['#071b18', '#0e3b33', '#39e2a3'] },
  { id: 'classic', name: 'ICQ Classic', colors: ['#c4ccd6', '#2f6fa3', '#1f6fb2'] },
  { id: 'plum', name: 'Midnight Plum', colors: ['#140e1e', '#3a2458', '#c49bfa'] },
  { id: 'amber', name: 'Amber CRT', colors: ['#160f07', '#3d2d17', '#ffb347'] },
]

const FONTS: { id: FontSize; label: string }[] = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
  { id: 'xl', label: 'XL' },
]

interface SettingsPanelProps {
  settings: Settings
  accounts: Accounts | null
  version: string
  demo: boolean
  onClose: () => void
}

export function SettingsPanel({ settings, accounts, version, demo, onClose }: SettingsPanelProps) {
  const [apiId, setApiId] = useState(settings.telegramApiId || '')
  const [apiHash, setApiHash] = useState(settings.telegramApiHash || '')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [historyNote, setHistoryNote] = useState('')

  const patch = (value: Partial<Settings>) => {
    api.updateSettings(value).catch(() => {})
  }

  const saveTelegram = async () => {
    setBusy('telegram')
    try {
      await api.updateSettings({ telegramApiId: apiId.trim(), telegramApiHash: apiHash.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } finally {
      setBusy(null)
    }
  }

  const logout = async (service: 'whatsapp' | 'telegram') => {
    const label = service === 'whatsapp' ? 'WhatsApp' : 'Telegram'
    if (!window.confirm(`Sign out of ${label} on this computer? You will need to link the account again.`)) return
    setBusy(service)
    try {
      await api.logout(service)
    } finally {
      setBusy(null)
    }
  }

  const clearHistory = async () => {
    const sure = window.confirm(
      'Clear every chat history on this computer?\n\nMessages, previews and unread badges are removed. Linked accounts, contacts, muted chats, skins and settings stay. This cannot be undone.',
    )
    if (!sure) return
    setBusy('history')
    try {
      const result = await api.clearHistory()
      setHistoryNote(
        result.messages
          ? `Cleared ${result.messages} messages across ${result.peers} conversations.`
          : 'There was no stored history to clear.',
      )
    } catch (error) {
      setHistoryNote(error instanceof Error ? error.message : 'Could not clear the history.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="settings-overlay">
      <TitleBar title="IDAz" subtitle="Settings" />
      <div className="settings-body">
        <section className="setting-group">
          <div className="setting-title">Theme skin</div>
          <div className="skin-grid">
            {SKINS.map((skin) => (
              <button
                key={skin.id}
                type="button"
                className="skin-card"
                data-active={settings.skin === skin.id}
                onClick={() => patch({ skin: skin.id })}
              >
                <span
                  className="skin-swatch"
                  style={{ background: `linear-gradient(135deg, ${skin.colors[0]} 0 45%, ${skin.colors[1]} 45% 78%, ${skin.colors[2]} 78% 100%)` }}
                />
                <span>{skin.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="setting-group">
          <div className="setting-title">Text size</div>
          <div className="segmented">
            {FONTS.map((font) => (
              <button
                key={font.id}
                type="button"
                className="seg-btn"
                data-active={settings.fontSize === font.id}
                onClick={() => patch({ fontSize: font.id })}
              >
                {font.label}
              </button>
            ))}
          </div>
        </section>

        <section className="setting-group">
          <div className="setting-title">Sound</div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(event) => patch({ sound: event.target.checked })}
            />
            <span>Play the classic message chime</span>
          </label>
          <div className="range-row">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              disabled={!settings.sound}
              onChange={(event) => patch({ volume: Number(event.target.value) })}
            />
            <span className="range-value">{Math.round(settings.volume * 100)}%</span>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.previews}
              onChange={(event) => patch({ previews: event.target.checked })}
            />
            <span>Show message previews in the contact list</span>
          </label>
        </section>

        <section className="setting-group">
          <div className="setting-title">Telegram app credentials</div>
          <p className="setting-hint">
            Telegram requires your own API ID and hash. Create an app once at my.telegram.org, then paste the two
            values here. They are stored only on this computer.
          </p>
          <div className="field-row">
            <label>
              API ID
              <input
                className="input"
                value={apiId}
                onChange={(event) => setApiId(event.target.value)}
                placeholder="12345678"
                inputMode="numeric"
              />
            </label>
            <label>
              API hash
              <input
                className="input"
                value={apiHash}
                onChange={(event) => setApiHash(event.target.value)}
                placeholder="32 character hash"
              />
            </label>
          </div>
          <div className="row">
            <button type="button" className="btn primary" onClick={saveTelegram} disabled={busy === 'telegram'}>
              {saved ? 'Saved' : 'Save credentials'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => api.openExternal('https://my.telegram.org/apps')}
            >
              Open my.telegram.org
            </button>
          </div>
        </section>

        <section className="setting-group">
          <div className="setting-title">Accounts</div>
          {(['whatsapp', 'telegram'] as const).map((service) => {
            const account = accounts?.[service]
            return (
              <div key={service} className="account-row">
                <Avatar
                  name={account?.name || (service === 'whatsapp' ? 'WhatsApp' : 'Telegram')}
                  service={service}
                  size={30}
                />
                <div className="account-main">
                  <div className="account-name">
                    {service === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                    <span className="account-state" data-state={account?.state || 'off'}>
                      {account?.linked ? account.name || 'linked' : 'not linked'}
                    </span>
                  </div>
                  <div className="account-detail">
                    {demo
                      ? 'Demo mode — no real account is connected.'
                      : account?.detail || 'Session stored locally on this computer.'}
                  </div>
                </div>
                <div className="account-actions">
                  <button type="button" className="btn tiny" onClick={() => api.openLogin()}>
                    {account?.linked ? 'Manage' : 'Link'}
                  </button>
                  {account?.linked ? (
                    <button
                      type="button"
                      className="btn tiny danger"
                      disabled={busy === service || demo}
                      onClick={() => logout(service)}
                    >
                      Sign out
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </section>

        <section className="setting-group">
          <div className="setting-title">Chat history</div>
          <p className="setting-hint">
            Clearing keeps what makes IDAz useful — linked accounts, your contact list, muted chats, skins and
            settings — and removes only what was said: messages, previews and unread badges. Downloaded media files
            stay on this computer.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn danger"
              data-clear-history
              disabled={busy === 'history'}
              onClick={clearHistory}
              title="Remove every stored message, keeping accounts, contacts and settings"
            >
              Clear chat history
            </button>
          </div>
          {historyNote ? <p className="setting-hint" data-history-note>{historyNote}</p> : null}
        </section>

        <section className="setting-group about">
          <div className="setting-title">About</div>
          <p className="setting-hint">
            IDAz {version} — a nostalgic messenger for WhatsApp and Telegram. Sessions and media live in this
            computer's application data folder. Type a message and press Enter to send; Esc closes the media viewer.
          </p>
        </section>
      </div>
      <div className="settings-footer">
        <button type="button" className="btn primary" onClick={onClose}>
          Back to contacts
        </button>
      </div>
    </div>
  )
}
