import { gameImageUrl, gameStoreUrl, type SteamFriend, type SteamGame } from './steam'

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'

function apiKey(): string | undefined {
  return import.meta.env.VITE_STEAM_WEB_API_KEY?.trim() || undefined
}

export function hasSteamApiKey(): boolean {
  return Boolean(apiKey())
}

async function steamGet(url: URL): Promise<unknown> {
  const key = apiKey()
  if (!key) throw new Error('Falta VITE_STEAM_WEB_API_KEY en movil/.env')
  url.searchParams.set('key', key)
  const response = await fetch(url.toString(), { headers: { 'User-Agent': BROWSER_UA } })
  if (!response.ok) {
    throw new Error(`Steam API ${response.status} en ${url.pathname}`)
  }
  return response.json()
}

export async function fetchFriendIds(steamId: string): Promise<string[]> {
  const url = new URL('https://api.steampowered.com/ISteamUser/GetFriendList/v1/')
  url.searchParams.set('steamid', steamId)
  url.searchParams.set('relationship', 'friend')
  const json = (await steamGet(url)) as {
    friendslist?: { friends?: Array<{ steamid: string }> }
  }
  return json.friendslist?.friends?.map((friend) => friend.steamid) ?? []
}

export async function fetchPlayerSummaries(steamIds: string[]): Promise<SteamFriend[]> {
  const friends: SteamFriend[] = []

  for (let i = 0; i < steamIds.length; i += 100) {
    const batch = steamIds.slice(i, i + 100)
    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')
    url.searchParams.set('steamids', batch.join(','))
    const json = (await steamGet(url)) as {
      response?: {
        players?: Array<{
          steamid: string
          personaname?: string
          avatarfull?: string
          profileurl?: string
          personastate?: number
          gameextrainfo?: string
        }>
      }
    }

    for (const player of json.response?.players ?? []) {
      friends.push({
        steamId: player.steamid,
        name: player.personaname || `Steam ${player.steamid.slice(-4)}`,
        avatar: player.avatarfull || '',
        profileUrl: player.profileurl || `https://steamcommunity.com/profiles/${player.steamid}`,
        onlineState: player.gameextrainfo
          ? 'in-game'
          : player.personastate && player.personastate > 0
            ? 'online'
            : 'offline'
      })
    }
  }

  return friends.sort((a, b) => {
    const rank = (state?: string) => (state === 'in-game' ? 0 : state === 'online' ? 1 : 2)
    const byStatus = rank(a.onlineState) - rank(b.onlineState)
    return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  })
}

export async function fetchOwnedGames(steamId: string): Promise<SteamGame[] | 'private'> {
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/')
  url.searchParams.set('steamid', steamId)
  url.searchParams.set('include_appinfo', '1')
  url.searchParams.set('include_played_free_games', '1')

  const json = (await steamGet(url)) as {
    response?: {
      game_count?: number
      games?: Array<{ appid: number; name?: string; playtime_forever?: number }>
    }
  }

  if (!json.response || json.response.games === undefined) return 'private'

  return json.response.games
    .filter((game) => game.appid && game.name)
    .map((game) => ({
      appId: game.appid,
      name: game.name as string,
      playtimeMinutes: game.playtime_forever,
      imageUrl: gameImageUrl(game.appid),
      storeUrl: gameStoreUrl(game.appid)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}
