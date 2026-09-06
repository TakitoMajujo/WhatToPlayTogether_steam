import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { SteamUser } from '../shared/steam'

function sessionPath(): string {
  return join(app.getPath('userData'), 'steam-session.json')
}

export function loadSession(): SteamUser | null {
  try {
    if (!existsSync(sessionPath())) return null
    const data = JSON.parse(readFileSync(sessionPath(), 'utf8')) as SteamUser
    if (!data?.steamId) return null
    return data
  } catch {
    return null
  }
}

export function saveSession(user: SteamUser): void {
  writeFileSync(sessionPath(), JSON.stringify(user, null, 2), 'utf8')
}

export function clearSession(): void {
  if (existsSync(sessionPath())) unlinkSync(sessionPath())
}
