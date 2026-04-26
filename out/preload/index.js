"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  WORKSPACE_LIST: "workspace:list",
  WORKSPACE_CREATE: "workspace:create",
  WORKSPACE_GET: "workspace:get",
  WORKSPACE_UPDATE: "workspace:update",
  WORKSPACE_DELETE: "workspace:delete"
};
const PTY_CHANNELS = {
  CREATE: "pty:create",
  WRITE: "pty:write",
  RESIZE: "pty:resize",
  KILL: "pty:kill",
  DATA: "pty:data",
  WORKSPACE_SAVE_LAYOUT: "workspace:save-layout"
};
const WORKTREE_CHANNELS = {
  LIST: "worktree:list",
  CREATE: "worktree:create",
  DELETE: "worktree:delete"
};
const api = {
  workspace: {
    list: () => electron.ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    create: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, input),
    get: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET, id),
    update: (id, input) => electron.ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPDATE, id, input),
    delete: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_DELETE, id),
    saveLayout: (id, layoutJson) => electron.ipcRenderer.invoke(PTY_CHANNELS.WORKSPACE_SAVE_LAYOUT, id, layoutJson)
  },
  pty: {
    create: (options) => electron.ipcRenderer.invoke(PTY_CHANNELS.CREATE, options),
    write: (sessionId, data) => electron.ipcRenderer.invoke(PTY_CHANNELS.WRITE, sessionId, data),
    resize: (sessionId, cols, rows) => electron.ipcRenderer.invoke(PTY_CHANNELS.RESIZE, sessionId, cols, rows),
    kill: (sessionId) => electron.ipcRenderer.invoke(PTY_CHANNELS.KILL, sessionId),
    onData: (callback) => {
      const handler = (_, sessionId, data) => callback(sessionId, data);
      electron.ipcRenderer.on(PTY_CHANNELS.DATA, handler);
      return () => electron.ipcRenderer.removeListener(PTY_CHANNELS.DATA, handler);
    }
  },
  worktree: {
    list: (workspaceId) => electron.ipcRenderer.invoke(WORKTREE_CHANNELS.LIST, workspaceId),
    create: (options) => electron.ipcRenderer.invoke(WORKTREE_CHANNELS.CREATE, options),
    delete: (worktreeId, deleteBranch = false) => electron.ipcRenderer.invoke(WORKTREE_CHANNELS.DELETE, worktreeId, deleteBranch)
  }
};
electron.contextBridge.exposeInMainWorld("xaide", api);
