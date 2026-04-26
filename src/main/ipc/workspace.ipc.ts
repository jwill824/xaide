import { ipcMain } from 'electron'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import { IPC_CHANNELS, PTY_CHANNELS } from '../../preload/ipc-types'
import type { CreateWorkspaceInput } from '../../preload/ipc-types'

export function registerWorkspaceHandlers(manager: WorkspaceManager): void {
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, () => manager.list())
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_CREATE, (_, input: CreateWorkspaceInput) =>
    manager.create(input),
  )
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET, (_, id: string) => manager.get(id))
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_UPDATE,
    (_, id: string, input: Partial<CreateWorkspaceInput>) =>
      manager.update(id, input),
  )
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_DELETE, (_, id: string) => manager.delete(id))
  ipcMain.handle(
    PTY_CHANNELS.WORKSPACE_SAVE_LAYOUT,
    (_, id: string, layoutJson: string) => manager.saveLayout(id, layoutJson),
  )
}
