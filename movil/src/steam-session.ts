import type { SteamUser } from './steam'

const KEY = 'wtp-steam-session'

export function loadSession(): SteamUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SteamUser
    return data?.steamId ? data : null
  } catch {
    return null
  }
}

export function saveSession(user: SteamUser): void {
  localStorage.setItem(KEY, JSON.stringify(user))
}

export function clearSession(): void {
  localStorage.removeItem(KEY)
}
