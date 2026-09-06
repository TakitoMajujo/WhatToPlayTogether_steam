import type { LibraryResult, SteamFriend, SteamUser } from '../shared/steam'

export interface SteamAuthApi {
  getSession: () => Promise<SteamUser | null>
  login: () => Promise<SteamUser>
  logout: () => Promise<void>
  getFriends: () => Promise<SteamFriend[]>
  getMyGames: (force?: boolean) => Promise<LibraryResult>
  getFriendGames: (
    friendSteamId: string,
    force?: boolean,
    profileUrl?: string
  ) => Promise<LibraryResult>
}

declare global {
  interface Window {
    steamAuth: SteamAuthApi
  }
}
