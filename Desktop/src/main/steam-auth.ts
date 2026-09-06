import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { BrowserWindow, session } from 'electron'
import type { SteamUser } from '../shared/steam'

export const STEAM_PARTITION = 'persist:steam-auth'
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login'

const STEAM_ID_RE = /https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})/

export class SteamAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SteamAuthError'
  }
}

type CallbackServer = {
  port: number
  waitForCallback: () => Promise<URLSearchParams>
  close: () => void
}

function startCallbackServer(): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let settle: ((params: URLSearchParams) => void) | undefined
    let queued: URLSearchParams | null = null

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')

      if (url.pathname !== '/auth/steam/callback') {
        res.writeHead(404)
        res.end()
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>WhatToPlayTogether</title>
    <style>
      html, body { height: 100%; margin: 0; background: #07090f; color: #e8eef7;
        font-family: "Segoe UI", system-ui, sans-serif; }
      body { display: grid; place-items: center; }
      p { opacity: 0.8; }
    </style>
  </head>
  <body>
    <p>Inicio de sesión completado. Esta ventana se cerrará sola.</p>
  </body>
</html>`)

      if (settle) settle(url.searchParams)
      else queued = url.searchParams
    })

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        port,
        waitForCallback: () =>
          new Promise((done) => {
            if (queued) done(queued)
            else settle = done
          }),
        close: () => {
          server.close()
        }
      })
    })
  })
}

function buildOpenIdUrl(returnTo: string, realm: string): string {
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

async function verifyOpenIdAssertion(query: URLSearchParams): Promise<boolean> {
  const body = new URLSearchParams(query)
  body.set('openid.mode', 'check_authentication')

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': BROWSER_UA
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

async function fetchSteamProfile(steamId: string): Promise<SteamUser> {
  const fallback: SteamUser = {
    steamId,
    name: `Steam ${steamId.slice(-4)}`,
    avatar: '',
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
    loggedInAt: Date.now()
  }

  const apiKey = import.meta.env.MAIN_VITE_STEAM_WEB_API_KEY as string | undefined
  if (apiKey) {
    try {
      const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')
      url.searchParams.set('key', apiKey)
      url.searchParams.set('steamids', steamId)
      const response = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } })
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
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/xml,text/xml,*/*'
      }
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
      profileUrl: customUrl
        ? `https://steamcommunity.com/id/${customUrl}`
        : fallback.profileUrl,
      onlineState: onlineState || undefined,
      loggedInAt: Date.now()
    }
  } catch {
    return fallback
  }
}

export async function loginWithSteam(parent: BrowserWindow): Promise<SteamUser> {
  const server = await startCallbackServer()
  const realm = `http://127.0.0.1:${server.port}/`
  const returnTo = `http://127.0.0.1:${server.port}/auth/steam/callback`

  const authWindow = new BrowserWindow({
    parent,
    modal: true,
    width: 1040,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: 'Iniciar sesión con Steam',
    autoHideMenuBar: true,
    backgroundColor: '#171a21',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: STEAM_PARTITION
    }
  })

  authWindow.webContents.setUserAgent(BROWSER_UA)

  const closed = new Promise<never>((_, reject) => {
    authWindow.once('closed', () => {
      reject(new SteamAuthError('Inicio de sesión cancelado'))
    })
  })

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new SteamAuthError('El inicio de sesión tardó demasiado'))
    }, 5 * 60 * 1000)
  })

  try {
    await authWindow.loadURL(buildOpenIdUrl(returnTo, realm))

    const query = await Promise.race([server.waitForCallback(), closed, timeout])

    if (query.get('openid.mode') === 'cancel') {
      throw new SteamAuthError('Inicio de sesión cancelado en Steam')
    }

    const valid = await verifyOpenIdAssertion(query)
    if (!valid) {
      throw new SteamAuthError('Steam no pudo verificar esta sesión')
    }

    const steamId = extractSteamId(query.get('openid.claimed_id'))
    if (!steamId) {
      throw new SteamAuthError('No se pudo leer el SteamID')
    }

    try {
      await authWindow.loadURL(`https://steamcommunity.com/profiles/${steamId}/`)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await session.fromPartition(STEAM_PARTITION).cookies.flushStore()
    } catch {
      // El perfil ya se obtuvo por OpenID; esta visita solo intenta guardar la cookie de comunidad
    }

    if (!authWindow.isDestroyed()) authWindow.close()
    return fetchSteamProfile(steamId)
  } catch (error) {
    if (!authWindow.isDestroyed()) authWindow.close()
    throw error
  } finally {
    server.close()
  }
}
