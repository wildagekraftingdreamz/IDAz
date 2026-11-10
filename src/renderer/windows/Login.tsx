import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Accounts, AuthPrompt, Service, Settings } from '../types'
import { Avatar } from '../components/Avatar'
import { TitleBar } from '../components/TitleBar'

function stateText(account: Accounts[Service] | undefined): string {
  if (!account) return 'Starting…'
  if (account.state === 'connected') return 'Connected'
  if (account.state === 'qr') return 'Waiting for scan'
  if (account.state === 'connecting') return 'Connecting…'
  if (account.state === 'error') return 'Problem'
  return 'Not linked'
}

export function Login() {
  const [accounts, setAccounts] = useState<Accounts | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [service, setService] = useState<Service>('whatsapp')
  const [mode, setMode] = useState<'qr' | 'phone'>('qr')
  const [starting, setStarting] = useState<Service | null>(null)
  const [prompt, setPrompt] = useState<AuthPrompt | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .bootstrap()
      .then((data) => {
        if (!alive) return
        setAccounts(data.accounts)
        setSettings(data.settings)
        setApiId(data.settings.telegramApiId || '')
        setApiHash(data.settings.telegramApiHash || '')
        setDemo(data.demo)
      })
      .catch((error) => setNotice(error?.message || 'Could not load accounts.'))
    const offAccounts = api.onAccounts(setAccounts)
    const offSettings = api.onSettings((next) => {
      setSettings(next)
      setApiId((current) => current || next.telegramApiId || '')
      setApiHash((current) => current || next.telegramApiHash || '')
    })
    const offPrompt = api.onPrompt((next) => {
      setPrompt(next)
      setPromptValue('')
      setNotice(null)
    })
    return () => {
      alive = false
      offAccounts()
      offSettings()
      offPrompt()
    }
  }, [])

  const start = (serviceName: Service, loginMode: 'qr' | 'phone' = 'qr', phoneNumber?: string) => {
    setNotice(null)
    setStarting(serviceName)
    api
      .startLogin(serviceName, loginMode, phoneNumber)
      .then((result) => {
        if (!result.ok && !result.cancelled) setNotice(result.error || 'Sign-in failed.')
      })
      .catch((error) => setNotice(error?.message || 'Sign-in failed.'))
      .finally(() => setStarting(null))
  }

  const cancel = async (serviceName: Service) => {
    await api.cancelLogin(serviceName).catch(() => {})
    setPrompt(null)
    setStarting(null)
    setNotice(null)
  }

  const saveCredentials = async () => {
    try {
      await api.updateSettings({ telegramApiId: apiId.trim(), telegramApiHash: apiHash.trim() })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save the credentials.')
    }
  }

  const submitPrompt = async () => {
    if (!prompt) return
    const value = promptValue.trim()
    if (!value) return
    try {
      const result = await api.answerPrompt(prompt.id, value)
      if (!result.ok) setNotice(result.error || 'That input was not accepted.')
      else setPrompt(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That input was not accepted.')
    }
  }

  const signOut = async (serviceName: Service) => {
    if (!window.confirm(`Sign out of ${serviceName === 'whatsapp' ? 'WhatsApp' : 'Telegram'}? The saved session will be removed.`)) {
      return
    }
    setStarting(serviceName)
    await api.logout(serviceName).catch(() => {})
    setStarting(null)
  }

  const whatsapp = accounts?.whatsapp
  const telegram = accounts?.telegram
  const tgHasCreds = Number(settings?.telegramApiId) > 0 && (settings?.telegramApiHash || '').length >= 20

  return (
    <div className="login window">
      <TitleBar title="IDAz" subtitle="Link an account" />

      <div className="login-body">
        <div className="service-tabs" role="tablist">
          <button
            type="button"
            className="service-tab"
            data-active={service === 'whatsapp'}
            onClick={() => setService('whatsapp')}
          >
            <span className="service-dot" data-service="whatsapp" />
            WhatsApp
          </button>
          <button
            type="button"
            className="service-tab"
            data-active={service === 'telegram'}
            onClick={() => setService('telegram')}
          >
            <span className="service-dot" data-service="telegram" />
            Telegram
          </button>
        </div>

        {demo ? (
          <div className="banner">
            IDAz is running in demo mode. Launch normally to link a real WhatsApp or Telegram account.
          </div>
        ) : null}

        {notice ? <div className="banner error">{notice}</div> : null}

        {service === 'whatsapp' ? (
          <section className="login-card">
            <div className="card-head">
              <div>
                <div className="card-title">WhatsApp</div>
                <div className="card-sub">Linked-device sign-in, just like WhatsApp Web.</div>
              </div>
              <span className="state-pill" data-state={whatsapp?.state || 'off'}>
                {stateText(whatsapp)}
              </span>
            </div>

            {whatsapp?.linked && whatsapp.state === 'connected' ? (
              <div className="linked-row">
                <Avatar name={whatsapp.name || 'WhatsApp'} service="whatsapp" size={38} />
                <div className="linked-info">
                  <div className="linked-name">{whatsapp.name || 'WhatsApp account'}</div>
                  <div className="linked-sub">{whatsapp.phone || 'Session saved on this computer'}</div>
                </div>
                <button type="button" className="btn tiny danger" onClick={() => signOut('whatsapp')}>
                  Sign out
                </button>
              </div>
            ) : whatsapp?.qr ? (
              <div className="qr-block">
                <div className="qr-frame">
                  <img src={whatsapp.qr} alt="WhatsApp login QR code" />
                </div>
                <ol className="steps">
                  <li>Open WhatsApp on your phone.</li>
                  <li>Go to Settings → Linked devices → Link a device.</li>
                  <li>Point the camera at this code. The session is saved after the first scan.</li>
                </ol>
                <div className="row center">
                  <button type="button" className="btn" onClick={() => start('whatsapp')}>
                    New code
                  </button>
                  <button type="button" className="btn" onClick={() => cancel('whatsapp')}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : whatsapp?.state === 'connecting' ? (
              <div className="waiting">
                <div className="spinner" />
                <div>
                  <div className="waiting-title">Connecting to WhatsApp…</div>
                  <div className="waiting-sub">{whatsapp.detail || 'Preparing a login code.'}</div>
                </div>
              </div>
            ) : (
              <div className="intro-block">
                <p className="login-copy">
                  Scan a QR code once and IDAz keeps the session on this computer. The phone stays the primary
                  device; this is a linked device, exactly like WhatsApp Web.
                </p>
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => start('whatsapp')} disabled={starting === 'whatsapp'}>
                    Link with QR code
                  </button>
                  {starting === 'whatsapp' ? (
                    <button type="button" className="btn" onClick={() => cancel('whatsapp')}>
                      Cancel
                    </button>
                  ) : null}
                </div>
                {whatsapp?.detail ? <div className="login-detail">{whatsapp.detail}</div> : null}
              </div>
            )}
          </section>
        ) : (
          <section className="login-card">
            <div className="card-head">
              <div>
                <div className="card-title">Telegram</div>
                <div className="card-sub">QR code or phone number, with a saved MTProto session.</div>
              </div>
              <span className="state-pill" data-state={telegram?.state || 'off'}>
                {stateText(telegram)}
              </span>
            </div>

            {telegram?.linked && telegram.state === 'connected' ? (
              <div className="linked-row">
                <Avatar name={telegram.name || 'Telegram'} service="telegram" size={38} />
                <div className="linked-info">
                  <div className="linked-name">{telegram.name || 'Telegram account'}</div>
                  <div className="linked-sub">{telegram.phone || 'Session saved on this computer'}</div>
                </div>
                <button type="button" className="btn tiny danger" onClick={() => signOut('telegram')}>
                  Sign out
                </button>
              </div>
            ) : !tgHasCreds ? (
              <div className="credentials">
                <p className="login-copy">
                  Telegram needs an app API ID and hash, which you create once for free at my.telegram.org. They
                  are stored locally and never leave this computer.
                </p>
                <label className="field">
                  API ID
                  <input
                    className="input"
                    value={apiId}
                    onChange={(event) => setApiId(event.target.value)}
                    placeholder="12345678"
                    inputMode="numeric"
                  />
                </label>
                <label className="field">
                  API hash
                  <input
                    className="input"
                    value={apiHash}
                    onChange={(event) => setApiHash(event.target.value)}
                    placeholder="32 character hash"
                  />
                </label>
                <div className="row">
                  <button type="button" className="btn primary" onClick={saveCredentials}>
                    {savedFlash ? 'Saved' : 'Save credentials'}
                  </button>
                  <button type="button" className="btn" onClick={() => api.openExternal('https://my.telegram.org/apps')}>
                    Open my.telegram.org
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mini-tabs">
                  <button type="button" className="chip" data-active={mode === 'qr'} onClick={() => setMode('qr')}>
                    QR code
                  </button>
                  <button type="button" className="chip" data-active={mode === 'phone'} onClick={() => setMode('phone')}>
                    Phone number
                  </button>
                </div>

                {mode === 'qr' ? (
                  telegram?.qr ? (
                    <div className="qr-block">
                      <div className="qr-frame">
                        <img src={telegram.qr} alt="Telegram login QR code" />
                      </div>
                      <ol className="steps">
                        <li>Open Telegram on your phone.</li>
                        <li>Go to Settings → Devices → Link desktop device.</li>
                        <li>Scan the code. The session is saved automatically.</li>
                      </ol>
                      <div className="row center">
                        <button type="button" className="btn" onClick={() => cancel('telegram')}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="intro-block">
                      <p className="login-copy">
                        Scan a QR code with the Telegram app on your phone. If two-step verification is enabled,
                        IDAz will ask for that password too.
                      </p>
                      <div className="row">
                        <button type="button" className="btn primary" onClick={() => start('telegram', 'qr')}>
                          Show QR code
                        </button>
                        {starting === 'telegram' ? (
                          <button type="button" className="btn" onClick={() => cancel('telegram')}>
                            Cancel
                          </button>
                        ) : null}
                      </div>
                      {starting === 'telegram' ? <div className="login-detail">Waiting for Telegram…</div> : null}
                    </div>
                  )
                ) : (
                  <div className="intro-block">
                    <p className="login-copy">
                      Enter your phone number in international format. Telegram will send a login code inside the
                      Telegram app.
                    </p>
                    <label className="field">
                      Phone number
                      <input
                        className="input"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+1 415 555 0123"
                        inputMode="tel"
                      />
                    </label>
                    <div className="row">
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => start('telegram', 'phone', phone)}
                        disabled={!phone.trim() || starting === 'telegram'}
                      >
                        Send code
                      </button>
                      {starting === 'telegram' ? (
                        <button type="button" className="btn" onClick={() => cancel('telegram')}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}

                {telegram?.detail && telegram.state === 'error' ? (
                  <div className="banner error">{telegram.detail}</div>
                ) : null}
              </>
            )}
          </section>
        )}

        {prompt ? (
          <div className="prompt-card">
            <div className="prompt-title">
              {prompt.kind === 'code'
                ? 'Enter the login code'
                : prompt.kind === 'password'
                  ? 'Two-step verification password'
                  : 'Phone number'}
            </div>
            <div className="prompt-sub">
              {prompt.hint
                ? `Telegram hint: ${prompt.hint}`
                : prompt.kind === 'code'
                  ? 'Telegram just sent a code to your other device.'
                  : 'Finish the Telegram sign-in on this computer.'}
            </div>
            <input
              className="input"
              type={prompt.kind === 'password' ? 'password' : 'text'}
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitPrompt()
                }
              }}
              autoFocus
              aria-label="Sign-in input"
            />
            <div className="row">
              <button type="button" className="btn primary" onClick={submitPrompt} disabled={!promptValue.trim()}>
                Continue
              </button>
              <button type="button" className="btn" onClick={() => cancel(prompt.service)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="login-note">
          Sessions are kept in IDAz's local app-data folder. Signing out removes them. Nothing is uploaded to a
          SoulApps server — messages go straight to WhatsApp and Telegram.
        </div>
      </div>
    </div>
  )
}
