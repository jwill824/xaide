import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { PtyManager } from '../pty/PtyManager'
import { PTY_CHANNELS } from '../../preload/ipc-types'
import type { PtyCreateOptions } from '../../preload/ipc-types'

export function registerPtyHandlers(manager: PtyManager, webContents: WebContents): void {
  ipcMain.handle(PTY_CHANNELS.CREATE, (_, options: PtyCreateOptions): string => {
    const { id, process } = manager.create(options)
    process.onData((data: string) => {
      if (!webContents.isDestroyed()) {
        webContents.send(PTY_CHANNELS.DATA, id, data)
      }
    })
    process.onExit(() => {
      if (!webContents.isDestroyed()) {
        webContents.send(PTY_CHANNELS.EXIT, id)
      }
    })
    return id
  })

  ipcMain.handle(PTY_CHANNELS.WRITE, (_, sessionId: string, data: string): void => {
    if (!manager.has(sessionId)) return
    manager.write(sessionId, data)
  })

  ipcMain.handle(
    PTY_CHANNELS.RESIZE,
    (_, sessionId: string, cols: number, rows: number): void => {
      if (!manager.has(sessionId)) return
      manager.resize(sessionId, cols, rows)
    },
  )

  ipcMain.handle(PTY_CHANNELS.KILL, (_, sessionId: string): void => {
    manager.kill(sessionId)
  })
}
