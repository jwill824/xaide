import { contextBridge, ipcRenderer } from 'electron'
import type { XaideAPI, CreateWorkspaceInput } from './ipc-types'

const api: XaideAPI = {
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    create: (input: CreateWorkspaceInput) =>
      ipcRenderer.invoke('workspace:create', input),
    get: (id: string) => ipcRenderer.invoke('workspace:get', id),
    update: (id: string, input: Partial<CreateWorkspaceInput>) =>
      ipcRenderer.invoke('workspace:update', id, input),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
  },
}

contextBridge.exposeInMainWorld('xaide', api)
