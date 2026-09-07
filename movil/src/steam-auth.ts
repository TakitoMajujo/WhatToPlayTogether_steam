import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import type { SteamUser } from './steam'
import { SteamCallback } from './steam-callback'
import { loadSession, saveSession } from './steam-session'

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login'

const STEAM_ID_RE = /https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})/
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'

export class SteamAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SteamAuthError'
  }
}

export function buildOpenIdUrl(
  returnTo = STEAM_CALLBACK_URL,
  realm = STEAM_CALLBACK_REALM
): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
  })
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`
}

export function readOpenIdParamsFromUrl(raw: string): URLSearchParams | null {
  try {
    const url = new URL(raw)
    if (url.searchParams.get('openid.mode')) return url.searchParams
  } catch {
    // Algunos deep links llegan malformados; se intenta extraer el query a mano
  }

  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw
  const params = new URLSearchParams(query)
  return params.get('openid.mode') ? params : null
}

export function readOpenIdParams(source = window.location.search): URLSearchParams | null {
  const params = new URLSearchParams(source.startsWith('?') ? source : `?${source}`)
  return params.get('openid.mode') ? params : null
}

async function verifyOpenIdAssertion(query: URLSearchParams): Promise<boolean> {
  const body = new URLSearchParams(query)
  body.set('openid.mode', 'check_authentication')

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': CHROME_UA
    },
    body
  })

  const text = await response.text()
  return /is_valid\s*:\s*true/i.test(text)
}

function extractSteamId(claimedId: string | null): string | null {
  if (!claimedId) return null
  return claimedId.match(STEAM_ID_RE)?.[1] ?? null
}

function xmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
  return match?.[1]?.trim() ?? ''
}

export async function fetchSteamProfile(steamId: string): Promise<SteamUser> {
  const fallback: SteamUser = {
    steamId,
    name: `Steam ${steamId.slice(-4)}`,
    avatar: '',
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
    loggedInAt: Date.now()
  }

  const apiKey = import.meta.env.VITE_STEAM_WEB_API_KEY?.trim()
  if (apiKey) {
    try {
      const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')
      url.searchParams.set('key', apiKey)
      url.searchParams.set('steamids', steamId)
      const response = await fetch(url.toString(), { headers: { 'User-Agent': CHROME_UA } })
      const json = (await response.json()) as {
        response?: {
          players?: Array<{
            personaname?: string
            avatarfull?: string
            profileurl?: string
            personastate?: number
          }>
        }
      }
      const player = json.response?.players?.[0]
      if (player) {
        return {
          steamId,
          name: player.personaname || fallback.name,
          avatar: player.avatarfull || '',
          profileUrl: player.profileurl || fallback.profileUrl,
          onlineState: player.personastate && player.personastate > 0 ? 'online' : 'offline',
          loggedInAt: Date.now()
        }
      }
    } catch {
      // Fallback al perfil público XML
    }
  }

  try {
    const response = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, {
      headers: { 'User-Agent': CHROME_UA }
    })
    const xml = await response.text()
    const name = xmlTag(xml, 'steamID')
    const avatar = xmlTag(xml, 'avatarFull')
    const onlineState = xmlTag(xml, 'onlineState')
    const customUrl = xmlTag(xml, 'customURL')

    return {
      steamId,
      name: name || fallback.name,
      avatar,
      profileUrl: customUrl ? `https://steamcommunity.com/id/${customUrl}` : fallback.profileUrl,
      onlineState: onlineState || undefined,
      loggedInAt: Date.now()
    }
  } catch {
    return fallback
  }
}

function cleanOpenIdUrl(): void {
  const url = new URL(window.location.href)
  if (![...url.searchParams.keys()].some((key) => key.startsWith('openid.'))) return
  url.search = ''
  window.history.replaceState({}, document.title, url.pathname + url.hash)
}

export async function completeOpenIdFromParams(query: URLSearchParams): Promise<SteamUser> {
  if (query.get('openid.mode') === 'cancel') {
    throw new SteamAuthError('Inicio de sesión cancelado en Steam')
  }

  const valid = await verifyOpenIdAssertion(query)
  if (!valid) throw new SteamAuthError('Steam no pudo verificar esta sesión')

  const steamId = extractSteamId(query.get('openid.claimed_id'))
  if (!steamId) throw new SteamAuthError('No se pudo leer el SteamID')

  const user = await fetchSteamProfile(steamId)
  saveSession(user)
  return user
}

export async function consumeOpenIdReturn(): Promise<SteamUser | null> {
  const existing = loadSession()
  const query = readOpenIdParams()
  if (!query) return null

  try {
    return await completeOpenIdFromParams(query)
  } catch (error) {
    if (existing) return existing
    throw error
  } finally {
    cleanOpenIdUrl()
  }
}

export async function loginWithSystemBrowser(): Promise<SteamUser> {
  if (!Capacitor.isNativePlatform()) {
    const origin = window.location.origin
    window.location.assign(buildOpenIdUrl(`${origin}/index.html`, `${origin}/`))
    return new Promise(() => undefined)
  }

  const { port } = await SteamCallback.start()
  const realm = `http://127.0.0.1:${port}/`
  const returnTo = `http://127.0.0.1:${port}/auth/steam/callback`
  let settled = false
  let closedHandle: { remove: () => Promise<void> } | undefined

  try {
    let rejectCancel: ((error: Error) => void) | undefined
    const cancelled = new Promise<never>((_, reject) => {
      rejectCancel = reject
    })

    closedHandle = await Browser.addListener('browserFinished', () => {
      window.setTimeout(() => {
        if (!settled) rejectCancel?.(new SteamAuthError('Inicio de sesión cancelado'))
      }, 2000)
    })

    const wait = SteamCallback.waitForCallback()
    await Browser.open({ url: buildOpenIdUrl(returnTo, realm) })
    const { search } = await Promise.race([wait, cancelled])
    settled = true
    await Browser.close().catch(() => undefined)
    return await completeOpenIdFromParams(new URLSearchParams(search))
  } finally {
    settled = true
    await closedHandle?.remove().catch(() => undefined)
    await SteamCallback.stop().catch(() => undefined)
  }
}
