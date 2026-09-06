import type { LibraryResult, SteamFriend, SteamGame } from '../shared/steam'
import {
  fetchFriendIds,
  fetchOwnedGames,
  fetchPlayerSummaries,
  hasSteamApiKey
} from './steam-api'
import { closeSteamReader, readGameNames } from './steam-reader'
import { FRIENDS_EXTRACTOR, scrapePage } from './steam-scrape'

const gamesCache = new Map<string, LibraryResult>()

export async function fetchFriends(steamId: string): Promise<SteamFriend[]> {
  if (hasSteamApiKey()) {
    try {
      const ids = await fetchFriendIds(steamId)
      if (ids.length > 0) return fetchPlayerSummaries(ids)
    } catch {
      // Si la lista de amigos no es pública para la API, se intenta la página de Steam
    }
  }

  const urls = [
    `https://steamcommunity.com/profiles/${steamId}/friends/?l=english`,
    `https://steamcommunity.com/profiles/${steamId}/friends/?l=english&ajax=1`
  ]

  for (const url of urls) {
    const friends = await scrapePage<SteamFriend[]>(url, FRIENDS_EXTRACTOR, {
      extraWaitMs: 800
    })
    if (friends.length > 0) {
      return friends.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    }
  }

  throw new Error(
    'No se pudo leer la lista de amigos. Déjala pública en Steam o revisa tu clave de API.'
  )
}

export async function fetchLibrary(
  steamId: string,
  options: { force?: boolean; profileUrl?: string; own?: boolean } = {}
): Promise<LibraryResult> {
  if (!options.force) {
    const cached = gamesCache.get(steamId)
    if (cached) return cached
  } else {
    gamesCache.delete(steamId)
  }

  if (hasSteamApiKey()) {
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
        const result: LibraryResult = {
          steamId,
          games: [],
          privateProfile: true,
          hint: error instanceof Error ? error.message : 'No se pudo leer la biblioteca con la API de Steam.'
        }
        return result
      }
    }
  }

  const games: SteamGame[] = await readGameNames(steamId, options.profileUrl, options.own)
  const result: LibraryResult = {
    steamId,
    games,
    privateProfile: false,
    hint:
      games.length === 0
        ? 'La API no devolvió juegos. Si la biblioteca es pública, pulsa Reintentar.'
        : undefined
  }
  if (games.length > 0) gamesCache.set(steamId, result)
  return result
}

export function clearLibraryCache(): void {
  gamesCache.clear()
  closeSteamReader()
}
