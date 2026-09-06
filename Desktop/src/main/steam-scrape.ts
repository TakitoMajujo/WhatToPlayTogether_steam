import { BrowserWindow } from 'electron'
import { BROWSER_UA, STEAM_PARTITION } from './steam-auth'

type ScrapeOptions = {
  extraWaitMs?: number
  show?: boolean
  warmup?: boolean
}

export async function scrapePage<T>(
  url: string,
  extractor: string,
  options: ScrapeOptions = {}
): Promise<T> {
  const extraWaitMs = options.extraWaitMs ?? 1200
  const win = new BrowserWindow({
    show: Boolean(options.show),
    width: 1280,
    height: 800,
    title: 'Leyendo Steam…',
    autoHideMenuBar: true,
    webPreferences: {
      partition: STEAM_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  try {
    win.webContents.session.setUserAgent(BROWSER_UA)
    win.webContents.setUserAgent(BROWSER_UA)

    if (options.warmup) {
      try {
        await win.loadURL('https://steamcommunity.com/')
        await new Promise((resolve) => setTimeout(resolve, 400))
      } catch {
        // /my/ provoca bucles de login; no hace falta calentar esa ruta
      }
    }

    await win.loadURL(url)

    const currentUrl = win.webContents.getURL()
    if (/steamcommunity\.com\/login|steampowered\.com\/login/i.test(currentUrl)) {
      throw new Error('Steam pide iniciar sesión otra vez. Cierra sesión y vuelve a entrar.')
    }

    if (extraWaitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, extraWaitMs))
    }

    return (await win.webContents.executeJavaScript(extractor, true)) as T
  } finally {
    if (!win.isDestroyed()) win.close()
  }
}

export const FRIENDS_EXTRACTOR = `(() => {
  const items = []
  const seen = new Set()
  const nodes = document.querySelectorAll('[data-steamid]')
  for (const el of nodes) {
    const steamId = el.getAttribute('data-steamid') || ''
    if (!/^\\d{17}$/.test(steamId) || seen.has(steamId)) continue
    seen.add(steamId)
    const content = el.querySelector('.friend_block_content')
    let name = ''
    if (content) {
      name = (content.childNodes[0]?.textContent || content.textContent || '').split('\\n')[0].trim()
    }
    if (!name) {
      name = (el.querySelector('.persona_name, .friend_block_name, a')?.textContent || '').trim()
    }
    const cls = String(el.className || '')
    items.push({
      steamId,
      name: name || ('Steam ' + steamId.slice(-4)),
      avatar: el.querySelector('img')?.src || '',
      profileUrl: 'https://steamcommunity.com/profiles/' + steamId,
      onlineState: /in-game/i.test(cls) ? 'in-game' : /online/i.test(cls) ? 'online' : 'offline'
    })
  }
  return items
})()`

export const GAMES_EXTRACTOR = `(async () => {
  const privateRe = /this profile is private|este perfil es privado|game details (are|is) (set to )?private|has chosen to hide their game details/i
  const started = Date.now()
  while (Date.now() - started < 5000) {
    try {
      if (typeof rgGames !== 'undefined' && Array.isArray(rgGames) && rgGames.length) break
    } catch (e) {}
    if (document.querySelectorAll('.gameListRow, [data-appid]').length > 3) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  let raw = []
  try {
    if (typeof rgGames !== 'undefined' && Array.isArray(rgGames)) raw = rgGames
  } catch (e) {}

  if (!raw.length) {
    const html = document.documentElement.innerHTML
    const match = html.match(/var rgGames\\s*=\\s*(\\[[\\s\\S]*?\\]);/)
    if (match) {
      try { raw = JSON.parse(match[1]) } catch (e) {}
    }
  }

  const fromJs = (raw || [])
    .filter((game) => game && (game.appid || game.appId) && game.name)
    .map((game) => ({ appId: Number(game.appid || game.appId), name: String(game.name) }))
  if (fromJs.length) return { privateProfile: false, games: fromJs }

  const fromDom = []
  const seen = new Set()
  for (const row of document.querySelectorAll('.gameListRow, [data-appid]')) {
    const appId = Number(
      String(row.id || '').replace('game_', '') || row.getAttribute('data-appid') || ''
    )
    const name = (
      row.querySelector('.gameListRowItemName, h4, .ellipsis, .title, a')?.textContent || ''
    ).trim()
    if (!appId || !name || seen.has(appId)) continue
    seen.add(appId)
    fromDom.push({ appId, name })
  }
  if (fromDom.length) return { privateProfile: false, games: fromDom }

  const fromXml = []
  for (const node of document.getElementsByTagName('game')) {
    const appId = Number((node.getElementsByTagName('appID')[0] || node.getElementsByTagName('appId')[0])?.textContent || '')
    const name = (node.getElementsByTagName('name')[0]?.textContent || '').trim()
    if (appId && name) fromXml.push({ appId, name })
  }
  if (fromXml.length) return { privateProfile: false, games: fromXml }

  const fromLinks = []
  const seenLinks = new Set()
  for (const link of document.querySelectorAll('a[href*="/app/"]')) {
    const match = String(link.getAttribute('href') || '').match(/\\/app\\/(\\d+)/)
    const name = (link.textContent || '').trim()
    const appId = Number(match?.[1] || '')
    if (!appId || !name || name.length < 2 || seenLinks.has(appId)) continue
    seenLinks.add(appId)
    fromLinks.push({ appId, name })
  }
  if (fromLinks.length) return { privateProfile: false, games: fromLinks }

  const pageText = document.body?.innerText || document.documentElement.textContent || ''
  return { privateProfile: privateRe.test(pageText), games: [] }
})()`
