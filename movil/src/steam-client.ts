import type { LibraryResult, SteamFriend, SteamGame, SteamUser } from './steam'
import { fetchFriendIds, fetchOwnedGames, fetchPlayerSummaries, hasSteamApiKey } from './steam-api'
import { consumeOpenIdReturn, loginWithSystemBrowser } from './steam-auth'
import { clearSession, loadSession } from './steam-session'

const gamesCache = new Map<string, LibraryResult>()

export async function getSession(): Promise<SteamUser | null> {
  try {
    const fromOpenId = await consumeOpenIdReturn()
    if (fromOpenId) return fromOpenId
  } catch (error) {
    throw error
  }
  return loadSession()
}

export async function login(): Promise<SteamUser> {
  const pending = await consumeOpenIdReturn()
  if (pending) return pending
  return loginWithSystemBrowser()
}

export async function logout(): Promise<void> {
  gamesCache.clear()
  clearSession()
}

export async function getFriends(steamId: string): Promise<SteamFriend[]> {
  if (!hasSteamApiKey()) {
    throw new Error('Falta la clave de API de Steam en movil/.env')
  }

  const ids = await fetchFriendIds(steamId)
  if (ids.length === 0) {
    throw new Error(
      'No se pudo leer la lista de amigos. Déjala pública en Steam o revisa tu clave de API.'
    )
  }
  return fetchPlayerSummaries(ids)
}

async function fetchLibrary(
  steamId: string,
  options: { force?: boolean; own?: boolean } = {}
): Promise<LibraryResult> {
  if (!options.force) {
    const cached = gamesCache.get(steamId)
    if (cached) return cached
  } else {
    gamesCache.delete(steamId)
  }

  if (!hasSteamApiKey()) {
    throw new Error('Falta la clave de API de Steam en movil/.env')
  }

  try {
    const fromApi = await fetchOwnedGames(steamId)
    if (fromApi === 'private') {
      const result: LibraryResult = {
        steamId,
        games: [],
        privateProfile: true,
        hint: options.own
          ? 'La API no devolvió tu biblioteca. Revisa que la clave sea tuya y pulsa Reintentar.'
          : 'La API no puede leer esta biblioteca: en Steam debe estar en Público (Detalles del juego).'
      }
      gamesCache.set(steamId, result)
      return result
    }

    const result: LibraryResult = { steamId, games: fromApi, privateProfile: false }
    if (fromApi.length > 0) gamesCache.set(steamId, result)
    return result
  } catch (error) {
    if (!options.own) {
      return {
        steamId,
        games: [],
        privateProfile: true,
        hint: error instanceof Error ? error.message : 'No se pudo leer la biblioteca con la API de Steam.'
      }
    }
    throw error
  }
}

export function getMyGames(steamId: string, force = false): Promise<LibraryResult> {
  return fetchLibrary(steamId, { force, own: true })
}

export function getFriendGames(steamId: string, force = false): Promise<LibraryResult> {
  return fetchLibrary(steamId, { force, own: false })
}

export type { LibraryResult, SteamFriend, SteamGame, SteamUser }
