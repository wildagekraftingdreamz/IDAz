interface IconProps {
  size?: number
  className?: string
}

export function Logo({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="logo">
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#0d4a3f" stroke="#57e2b3" strokeWidth="1.2" />
      <path d="M5.5 8h13v7.2h-8.2L7 18.4v-3.2H5.5z" fill="#cdf7e6" />
      <circle cx="9.2" cy="11.6" r="1" fill="#0d4a3f" />
      <circle cx="12" cy="11.6" r="1" fill="#0d4a3f" />
      <circle cx="14.8" cy="11.6" r="1" fill="#0d4a3f" />
    </svg>
  )
}

export function Gear({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7" />
    </svg>
  )
}

export function Search({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="5.6" />
      <path d="M15 15l4.4 4.4" />
    </svg>
  )
}

export function ChevronUp({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M6 14.5l6-6 6 6" />
    </svg>
  )
}

export function ChevronDown({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  )
}

export function Attach({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M8.2 12.6l5.9-5.9a3.4 3.4 0 014.8 4.8l-7.5 7.5a5.2 5.2 0 01-7.4-7.4l6.7-6.7" />
    </svg>
  )
}

export function Send({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 4.6l18 7.4-18 7.4 2.9-7.4z" />
      <path d="M6.6 12.4H21V11H6.6z" opacity=".45" />
    </svg>
  )
}

export function Bell({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 3.8a5.2 5.2 0 00-5.2 5.2v3.4L5.2 15h13.6l-1.6-2.6V9A5.2 5.2 0 0012 3.8z" />
      <path d="M9.7 18a2.4 2.4 0 004.6 0" />
    </svg>
  )
}

export function BellOff({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M8.2 5.2A5.2 5.2 0 0117.2 9v3.4l1.6 2.6H8.6" />
      <path d="M6.8 9v3.4L5.2 15h10" />
      <path d="M4 4l16 16" />
      <path d="M9.7 18a2.4 2.4 0 004.6 0" />
    </svg>
  )
}

export function User({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.6-3.7 3.2-5.6 6.5-5.6s5.9 1.9 6.5 5.6" />
    </svg>
  )
}

export function Copy({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="8.5" y="8.5" width="10" height="12" rx="1.4" />
      <path d="M15.5 8.5V6.2a1.7 1.7 0 00-1.7-1.7H6.2a1.7 1.7 0 00-1.7 1.7v9.1a1.7 1.7 0 001.7 1.7h2.3" />
    </svg>
  )
}

export function Play({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.4l11 6.6-11 6.6z" />
    </svg>
  )
}

export function Download({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3.5v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15" />
    </svg>
  )
}

export function Folder({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3.5 6.5h6l2 2.2h9v9.3h-17z" />
      <path d="M3.5 8.7h17" opacity=".5" />
    </svg>
  )
}
