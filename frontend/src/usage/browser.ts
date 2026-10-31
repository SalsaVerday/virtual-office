import type { EntryKind } from './types'

export function browserLabel(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'edge'
  if (/Chrome\//.test(userAgent)) return 'chrome'
  if (/Firefox\//.test(userAgent)) return 'firefox'
  if (/Safari\//.test(userAgent)) return 'safari'
  return 'other'
}

export function entryFromSearch(search: string): EntryKind {
  const value = new URLSearchParams(search).get('entry')
  if (value === 'teams_tab' || value === 'teams_link') return value
  return 'direct'
}
