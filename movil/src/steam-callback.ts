import { registerPlugin } from '@capacitor/core'

export type SteamCallbackPlugin = {
  start(): Promise<{ port: number }>
  waitForCallback(): Promise<{ search: string }>
  stop(): Promise<void>
}

export const SteamCallback = registerPlugin<SteamCallbackPlugin>('SteamCallback')
