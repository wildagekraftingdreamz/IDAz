import type { ReactNode } from 'react'
import { api } from '../api'
import { Gear, Logo } from './Icons'

interface TitleBarProps {
  title: string
  subtitle?: string
  badge?: number
  onSettings?: () => void
  extra?: ReactNode
}

export function TitleBar({ title, subtitle, badge, onSettings, extra }: TitleBarProps) {
  return (
    <div
      className="titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        api.control('maximize')
      }}
    >
      <span className="titlebar-logo">
        <Logo size={15} />
      </span>
      <span className="titlebar-title">{title}</span>
      {subtitle ? <span className="titlebar-sub">{subtitle}</span> : null}
      {badge ? <span className="titlebar-badge">{badge > 99 ? '99+' : badge}</span> : null}
      <span className="titlebar-spacer" />
      {extra}
      {onSettings ? (
        <button type="button" className="tb-btn" onClick={onSettings} title="Settings" aria-label="Settings">
          <Gear size={13} />
        </button>
      ) : null}
      <button
        type="button"
        className="tb-btn"
        onClick={() => api.control('minimize')}
        title="Minimize"
        aria-label="Minimize"
      >
        _
      </button>
      <button
        type="button"
        className="tb-btn tb-close"
        onClick={() => api.control('close')}
        title="Close"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  )
}
