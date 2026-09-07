export type SteamUser = {
  steamId: string
  name: string
  avatar: string
  profileUrl: string
  onlineState?: string
  loggedInAt: number
}

export type SteamFriend = {
  steamId: string
  name: string
  avatar: string
  profileUrl: string
  onlineState?: string
}

export type SteamGame = {
  appId: number
  name: string
  playtimeMinutes?: number
  imageUrl: string
  storeUrl: string
}

export type LibraryResult = {
  steamId: string
  games: SteamGame[]
  privateProfile: boolean
  hint?: string
}

export function intersectGames(libraries: SteamGame[][]): SteamGame[] {
  if (libraries.length === 0) return []

  const [first, ...rest] = libraries
  const otherSets = rest.map((library) => new Set(library.map((game) => game.appId)))

  return first
    .filter((game) => otherSets.every((owned) => owned.has(game.appId)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

export function gameImageUrl(appId: number): string {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
}

export function gameStoreUrl(appId: number): string {
  return `https://store.steampowered.com/app/${appId}`
}
