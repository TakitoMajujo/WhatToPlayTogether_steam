import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { BROWSER_UA } from './steam-auth'

type AppListFile = {
  savedAt: number
  names: Record<string, string>
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function cachePath(): string {
  return join(app.getPath('userData'), 'steam-applist.json')
}

function readCache(): Map<number, string> | null {
  try {
    if (!existsSync(cachePath())) return null
    const data = JSON.parse(readFileSync(cachePath(), 'utf8')) as AppListFile
    if (!data?.names || Date.now() - data.savedAt > WEEK_MS) return null
    return new Map(Object.entries(data.names).map(([id, name]) => [Number(id), name]))
  } catch {
    return null
  }
}

async function downloadAppList(): Promise<Map<number, string>> {
  const response = await fetch('https://api.steampowered.com/ISteamApps/GetAppList/v2/', {
    headers: { 'User-Agent': BROWSER_UA }
  })
  const json = (await response.json()) as {
    applist?: { apps?: Array<{ appid: number; name?: string }> }
  }
  const names = new Map<number, string>()
  for (const appInfo of json.applist?.apps ?? []) {
    if (appInfo.appid && appInfo.name) names.set(appInfo.appid, appInfo.name)
  }
  writeFileSync(
    cachePath(),
    JSON.stringify({
      savedAt: Date.now(),
      names: Object.fromEntries([...names].map(([id, name]) => [String(id), name]))
    }),
    'utf8'
  )
  return names
}

export async function namesForAppIds(appIds: number[]): Promise<Array<{ appId: number; name: string }>> {
  const list = readCache() ?? (await downloadAppList())
  return appIds
    .filter((appId) => list.has(appId))
    .map((appId) => ({ appId, name: list.get(appId) as string }))
}
