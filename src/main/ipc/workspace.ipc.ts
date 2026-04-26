import { ipcMain } from 'electron'
import type { WorkspaceManager } from '../workspace/WorkspaceManager'
import type { CreateWorkspaceInput } from '../../preload/ipc-types'

export function registerWorkspaceHandlers(manager: WorkspaceManager): void {
  ipcMain.handle('workspace:list', () => manager.list())
  ipcMain.handle('workspace:create', (_, input: CreateWorkspaceInput) =>
    manager.create(input),
  )
  ipcMain.handle('workspace:get', (_, id: string) => manager.get(id))
  ipcMain.handle(
    'workspace:update',
    (_, id: string, input: Partial<CreateWorkspaceInput>) =>
      manager.update(id, input),
  )
  ipcMain.handle('workspace:delete', (_, id: string) => manager.delete(id))
}
