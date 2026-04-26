import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from './db/client'
import type { RawDb } from './db/client'
import * as schema from './db/schema'
import { ConfigLoader } from './config/ConfigLoader'
import { WorkspaceManager } from './workspace/WorkspaceManager'
import { PtyManager } from './pty/PtyManager'
import { registerWorkspaceHandlers, registerPtyHandlers } from './ipc'

let sqlite: RawDb | null = null
let ptyManager: PtyManager | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  sqlite = createDb(join(app.getPath('userData'), 'xaide.db'))
  const db = drizzle(sqlite, { schema })
  const configLoader = new ConfigLoader()
  const workspaceManager = new WorkspaceManager(db, configLoader)
  ptyManager = new PtyManager()

  registerWorkspaceHandlers(workspaceManager)
  const win = createWindow()
  registerPtyHandlers(ptyManager, win.webContents)

  win.on('close', () => ptyManager?.killAll())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow()
      if (ptyManager) registerPtyHandlers(ptyManager, w.webContents)
    }
  })
})

app.on('before-quit', () => {
  sqlite?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
