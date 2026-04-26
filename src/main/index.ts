import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from './db/client'
import type { RawDb } from './db/client'
import * as schema from './db/schema'
import { ConfigLoader } from './config/ConfigLoader'
import { WorkspaceManager } from './workspace/WorkspaceManager'
import { registerWorkspaceHandlers } from './ipc'

let sqlite: RawDb | null = null

function createWindow(): void {
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
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  sqlite = createDb(join(app.getPath('userData'), 'xaide.db'))
  const db = drizzle(sqlite, { schema })
  const configLoader = new ConfigLoader()
  const workspaceManager = new WorkspaceManager(db, configLoader)

  registerWorkspaceHandlers(workspaceManager)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  sqlite?.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
