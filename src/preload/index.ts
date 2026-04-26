import { contextBridge, ipcRenderer } from 'electron'
import type { XaideAPI, CreateWorkspaceInput } from './ipc-types'
import { IPC_CHANNELS } from './ipc-types'

const api: XaideAPI = {
  workspace: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    create: (input: CreateWorkspaceInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, input),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET, id),
    update: (id: string, input: Partial<CreateWorkspaceInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_DELETE, id),
  },
}

contextBridge.exposeInMainWorld('xaide', api)
