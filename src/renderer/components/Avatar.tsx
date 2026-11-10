import type { CSSProperties } from 'react'
import { hueFor, initials } from '../lib/format'
import type { Service } from '../types'

interface AvatarProps {
  name: string
  service?: Service
  size?: number
  group?: boolean
  muted?: boolean
}

export function Avatar({ name, service, size, group, muted }: AvatarProps) {
  const style: CSSProperties = { '--hue': hueFor(name || '?') } as CSSProperties
  if (size) {
    style.width = size
    style.height = size
    style.fontSize = Math.max(9, size * 0.36)
  }
  return (
    <span className={`avatar${muted ? ' muted' : ''}`} style={style} aria-hidden="true">
      <span className="avatar-initials">{group ? '#' : initials(name)}</span>
      {service ? <span className="avatar-dot" data-service={service} /> : null}
    </span>
  )
}
