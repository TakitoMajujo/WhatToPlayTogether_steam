import { contextBridge, ipcRenderer } from 'electron'
import type { LibraryResult, SteamFriend, SteamUser } from '../shared/steam'

contextBridge.exposeInMainWorld('steamAuth', {
  getSession: (): Promise<SteamUser | null> => ipcRenderer.invoke('steam:session'),
  login: (): Promise<SteamUser> => ipcRenderer.invoke('steam:login'),
  logout: (): Promise<void> => ipcRenderer.invoke('steam:logout'),
  getFriends: (): Promise<SteamFriend[]> => ipcRenderer.invoke('steam:friends'),
  getMyGames: (force?: boolean): Promise<LibraryResult> => ipcRenderer.invoke('steam:myGames', force),
  getFriendGames: (friendSteamId: string, force?: boolean, profileUrl?: string): Promise<LibraryResult> =>
    ipcRenderer.invoke('steam:friendGames', { steamId: friendSteamId, force, profileUrl })
})
