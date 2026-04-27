import { ipcMain } from 'electron'
import { TASK_CHANNELS } from '../../preload/ipc-types'
import type { TaskManager } from '../task/TaskManager'

export function registerTaskHandlers(manager: TaskManager): void {
  ipcMain.handle(TASK_CHANNELS.LIST, (_e, workspaceId: string) => manager.list(workspaceId))
  ipcMain.handle(TASK_CHANNELS.CREATE, (_e, input) => manager.create(input))
  ipcMain.handle(TASK_CHANNELS.UPDATE, (_e, id: string, input) => manager.update(id, input))
  ipcMain.handle(TASK_CHANNELS.DELETE, (_e, id: string) => manager.delete(id))
}
