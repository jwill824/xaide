import { contextBridge, ipcRenderer } from 'electron'
import type { XaideAPI, CreateWorkspaceInput, PtyCreateOptions } from './ipc-types'
import { IPC_CHANNELS, PTY_CHANNELS } from './ipc-types'

const api: XaideAPI = {
  workspace: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    create: (input: CreateWorkspaceInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, input),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET, id),
    update: (id: string, input: Partial<CreateWorkspaceInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_DELETE, id),
    saveLayout: (id: string, layoutJson: string) =>
      ipcRenderer.invoke(PTY_CHANNELS.WORKSPACE_SAVE_LAYOUT, id, layoutJson),
  },
  pty: {
    create: (options: PtyCreateOptions) => ipcRenderer.invoke(PTY_CHANNELS.CREATE, options),
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke(PTY_CHANNELS.WRITE, sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(PTY_CHANNELS.RESIZE, sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.invoke(PTY_CHANNELS.KILL, sessionId),
    onData: (callback: (sessionId: string, data: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, sessionId: string, data: string) =>
        callback(sessionId, data)
      ipcRenderer.on(PTY_CHANNELS.DATA, handler)
      return () => ipcRenderer.removeListener(PTY_CHANNELS.DATA, handler)
    },
  },
}

contextBridge.exposeInMainWorld('xaide', api)
