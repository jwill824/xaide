import { ipcMain } from 'electron'
import { SANDBOX_CHANNELS } from '../../preload/ipc-types'
import type { SandboxManager } from '../sandbox/SandboxManager'
import type { SandboxCreateOptions } from '../../preload/ipc-types'

export function registerSandboxHandlers(sandbox: SandboxManager): void {
  ipcMain.handle(SANDBOX_CHANNELS.AVAILABLE, () => sandbox.isSbxAvailable())

  ipcMain.handle(SANDBOX_CHANNELS.CREATE, (_event, options: SandboxCreateOptions) =>
    sandbox.create(options),
  )

  ipcMain.handle(SANDBOX_CHANNELS.STOP, (_event, sandboxName: string) =>
    sandbox.stop(sandboxName),
  )

  ipcMain.handle(SANDBOX_CHANNELS.REMOVE, (_event, sandboxName: string) =>
    sandbox.remove(sandboxName),
  )
}
