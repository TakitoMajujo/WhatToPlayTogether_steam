import { BrowserWindow, session } from 'electron'
import { gameImageUrl, gameStoreUrl, type SteamGame } from '../shared/steam'
import { namesForAppIds } from './steam-apps'
import { BROWSER_UA, STEAM_PARTITION } from './steam-auth'
import { GAMES_EXTRACTOR } from './steam-scrape'

let reader: BrowserWindow | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getReader(show: boolean): BrowserWindow {
  if (reader && !reader.isDestroyed()) {
    if (show) reader.show()
    return reader
  }

  reader = new BrowserWindow({
    show,
    width: 1100,
    height: 780,
    title: 'Steam — inicia sesión si te lo pide',
    autoHideMenuBar: true,
    webPreferences: {
      partition: STEAM_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  reader.webContents.setBackgroundThrottling(false)
  reader.webContents.session.setUserAgent(BROWSER_UA)
  reader.webContents.setUserAgent(BROWSER_UA)
  return reader
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function xmlTag(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
  )
  return match?.[1]?.trim() ?? ''
}

function toGames(raw: Array<{ appId: number; name: string }>): SteamGame[] {
  return raw
    .filter((game) => game.appId && game.name)
    .map((game) => ({
      appId: game.appId,
      name: game.name,
      imageUrl: gameImageUrl(game.appId),
      storeUrl: gameStoreUrl(game.appId)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

function parseXmlGames(xml: string): SteamGame[] {
  const games: Array<{ appId: number; name: string }> = []
  for (const block of xml.split(/<game>/i).slice(1)) {
    const appId = Number(xmlTag(block, 'appID') || xmlTag(block, 'appId'))
    const name = decodeHtml(xmlTag(block, 'name'))
    if (appId && name) games.push({ appId, name })
  }
  return toGames(games)
}

function gamesPageUrl(steamId: string, profileUrl?: string): string {
  const custom = profileUrl?.match(/steamcommunity\.com\/(id\/[^/?#]+)/i)?.[1]
  if (custom) return `https://steamcommunity.com/${custom}/games/?tab=all`
  return `https://steamcommunity.com/profiles/${steamId}/games/?tab=all`
}

async function loadQuietly(win: BrowserWindow, url: string): Promise<boolean> {
  try {
    await win.loadURL(url)
    return !/\/login/i.test(win.webContents.getURL())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/TOO_MANY_REDIRECTS|ERR_ABORTED|ERR_FAILED/i.test(message)) return false
    throw error
  }
}

async function waitIfLogin(win: BrowserWindow, timeoutMs: number): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (win.isDestroyed()) return false
    if (!/\/login/i.test(win.webContents.getURL())) return true
    await sleep(1000)
  }
  return !/\/login/i.test(win.webContents.getURL())
}

function attachNetworkCapture(win: BrowserWindow): () => SteamGame[] {
  const found: SteamGame[] = []
  const pending = new Map<string, string>()
  const debug = win.webContents.debugger

  const onMessage = async (
    _event: unknown,
    method: string,
    params: { requestId?: string; response?: { url?: string } }
  ): Promise<void> => {
    if (method === 'Network.responseReceived' && params.requestId && params.response?.url) {
      if (/GetOwnedGames|dynamicstore\/userdata/i.test(params.response.url)) {
        pending.set(params.requestId, params.response.url)
      }
    }
    if (method !== 'Network.loadingFinished' || !params.requestId || !pending.has(params.requestId)) {
      return
    }
    try {
      const result = (await debug.sendCommand('Network.getResponseBody', {
        requestId: params.requestId
      })) as { body?: string }
      const json = JSON.parse(result.body ?? '{}') as {
        response?: { games?: Array<{ appid?: number; name?: string }> }
        rgOwnedApps?: number[]
      }
      if (json.response?.games?.length) {
        found.push(
          ...toGames(
            json.response.games
              .filter((game) => game.appid && game.name)
              .map((game) => ({ appId: game.appid as number, name: game.name as string }))
          )
        )
      }
    } catch {
      // Se intenta el resto de métodos
    }
  }

  try {
    if (!debug.isAttached()) debug.attach('1.3')
    void debug.sendCommand('Network.enable')
    debug.on('message', onMessage)
  } catch {
    // Sin debugger se usa el HTML / la API de la tienda
  }

  return () => {
    try {
      debug.off('message', onMessage)
    } catch {
      // ignore
    }
    return found
  }
}

async function gamesFromStoreSession(): Promise<SteamGame[]> {
  try {
    const response = await session.fromPartition(STEAM_PARTITION).fetch(
      'https://store.steampowered.com/dynamicstore/userdata/',
      { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }
    )
    const json = (await response.json()) as { rgOwnedApps?: number[] }
    const ids = json.rgOwnedApps ?? []
    if (ids.length === 0) return []
    return toGames(await namesForAppIds(ids))
  } catch {
    return []
  }
}

async function gamesFromPage(win: BrowserWindow): Promise<SteamGame[]> {
  const scraped = (await win.webContents.executeJavaScript(GAMES_EXTRACTOR, true)) as {
    games?: Array<{ appId: number; name: string }>
  }
  if (scraped.games?.length) return toGames(scraped.games)

  const html = (await win.webContents.executeJavaScript(
    'document.documentElement.outerHTML || ""'
  )) as string
  return parseXmlGames(html)
}

export async function readGameNames(
  steamId: string,
  profileUrl?: string,
  own = false
): Promise<SteamGame[]> {
  const win = getReader(true)
  const finishCapture = attachNetworkCapture(win)

  try {
    if (own) {
      await loadQuietly(win, 'https://store.steampowered.com/')
      await sleep(800)
    }

    const pageUrl = gamesPageUrl(steamId, profileUrl)
    const loaded = await loadQuietly(win, pageUrl)
    if (!loaded) {
      win.show()
      const loggedIn = await waitIfLogin(win, 3 * 60 * 1000)
      if (!loggedIn) {
        throw new Error('Steam pide iniciar sesión. Entra en la ventana de Steam y pulsa Reintentar.')
      }
      await loadQuietly(win, pageUrl)
    }

    await sleep(3500)
    const fromNetwork = finishCapture()
    if (fromNetwork.length > 0) return fromNetwork

    const fromPage = await gamesFromPage(win)
    if (fromPage.length > 0) return fromPage

    if (own) {
      const fromStore = await gamesFromStoreSession()
      if (fromStore.length > 0) return fromStore
    }

    return []
  } finally {
    if (reader && !reader.isDestroyed()) reader.hide()
  }
}

export function closeSteamReader(): void {
  if (reader && !reader.isDestroyed()) reader.close()
  reader = null
}
