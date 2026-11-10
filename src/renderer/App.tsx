import { useEffect, useState } from 'react'
import { api, hasBridge } from './api'
import type { Settings } from './types'
import { Roster } from './windows/Roster'
import { Chat } from './windows/Chat'
import { Profile } from './windows/Profile'
import { Login } from './windows/Login'
import { Viewer } from './windows/Viewer'
import messageSound from './assets/sounds/message.wav?url'
import sendSound from './assets/sounds/send.wav?url'
import signonSound from './assets/sounds/signon.wav?url'
import errorSound from './assets/sounds/error.wav?url'

const SOUNDS: Record<string, string> = {
  message: messageSound,
  send: sendSound,
  signon: signonSound,
  error: errorSound,
}

function applyTheme(settings: Settings) {
  const root = document.documentElement
  root.dataset.skin = settings.skin || 'teal'
  root.dataset.font = settings.fontSize || 'md'
}

function safeDecode(value?: string) {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export function App() {
  const hash = useHashRoute()
  const [fatal, setFatal] = useState<string | null>(null)

  useEffect(() => {
    if (!hasBridge) {
      setFatal('The desktop bridge could not be loaded. Start IDAz through Electron (`npm run dev`).')
      return
    }
    api
      .bootstrap()
      .then((data) => applyTheme(data.settings))
      .catch((error) => setFatal(error?.message || 'Unable to load IDAz.'))

    const offSettings = api.onSettings((settings) => applyTheme(settings))
    const offSound = api.onSound(({ name, settings }) => {
      if (!settings.sound) return
      const audio = new Audio(SOUNDS[name] || SOUNDS.message)
      audio.volume = Math.min(1, Math.max(0, Number(settings.volume ?? 0.7)))
      audio.play().catch(() => {})
    })
    return () => {
      offSettings()
      offSound()
    }
  }, [])

  const [pathPart, queryPart = ''] = hash.replace(/^#\/?/, '').split('?')
  const parts = pathPart.split('/')
  const route = parts[0] || ''
  const focusMessageId = safeDecode(new URLSearchParams(queryPart).get('m') || '')

  let content
  if (fatal) {
    content = (
      <div className="fatal">
        <div className="fatal-box">
          <h1>IDAz</h1>
          <p>{fatal}</p>
        </div>
      </div>
    )
  } else if (route === 'chat') {
    content = <Chat peerId={safeDecode(parts[1])} focusMessageId={focusMessageId} />
  } else if (route === 'profile') {
    content = <Profile peerId={safeDecode(parts[1])} />
  } else if (route === 'login') {
    content = <Login />
  } else if (route === 'viewer') {
    content = <Viewer peerId={safeDecode(parts[1])} messageId={safeDecode(parts[2])} />
  } else {
    content = <Roster />
  }

  return <div className="app-root">{content}</div>
}
