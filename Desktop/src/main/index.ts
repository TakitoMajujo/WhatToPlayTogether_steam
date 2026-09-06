import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { clearSession, loadSession, saveSession } from './session'
import { loginWithSteam, SteamAuthError } from './steam-auth'
import { clearLibraryCache, fetchFriends, fetchLibrary } from './steam-data'
import type { LibraryResult, SteamFriend, SteamUser } from '../shared/steam'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: 'WhatToPlayTogether',
    backgroundColor: '#07090f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.whattoplaytogether.desktop')
  }

  ipcMain.handle('steam:session', () => loadSession())

  ipcMain.handle('steam:login', async (): Promise<SteamUser> => {
    if (!mainWindow) {
      throw new SteamAuthError('La ventana principal no está lista')
    }
    const user = await loginWithSteam(mainWindow)
    clearLibraryCache()
    saveSession(user)
    return user
  })

  ipcMain.handle('steam:logout', () => {
    clearSession()
    clearLibraryCache()
  })

  ipcMain.handle('steam:friends', async (): Promise<SteamFriend[]> => {
    const user = loadSession()
    if (!user) throw new SteamAuthError('No hay una sesión de Steam')
    return fetchFriends(user.steamId)
  })

  ipcMain.handle('steam:myGames', async (_event, force?: boolean): Promise<LibraryResult> => {
    const user = loadSession()
    if (!user) throw new SteamAuthError('No hay una sesión de Steam')
    return fetchLibrary(user.steamId, { force: Boolean(force), profileUrl: user.profileUrl, own: true })
  })

  ipcMain.handle(
    'steam:friendGames',
    async (
      _event,
      payload: string | { steamId: string; profileUrl?: string; force?: boolean },
      forceArg?: boolean
    ): Promise<LibraryResult> => {
      const friendSteamId = typeof payload === 'string' ? payload : payload.steamId
      const force = typeof payload === 'string' ? Boolean(forceArg) : Boolean(payload.force)
      const profileUrl = typeof payload === 'string' ? undefined : payload.profileUrl
      if (!friendSteamId) throw new SteamAuthError('Elige un amigo')
      return fetchLibrary(friendSteamId, { force, profileUrl })
    }
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
