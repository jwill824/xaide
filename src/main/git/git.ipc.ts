import { ipcMain } from 'electron'
import type { GitManager } from './GitManager'

export const GIT_CHANNELS = {
  STATUS: 'git:status',
  DIFF: 'git:diff',
  LOG: 'git:log',
  STAGE: 'git:stage',
  UNSTAGE: 'git:unstage',
  DISCARD: 'git:discard',
  COMMIT: 'git:commit',
  PUSH: 'git:push',
} as const

type GitManagerResolver = (worktreeId: string) => GitManager

export function registerGitHandlers(getManager: GitManagerResolver): void {
  ipcMain.handle(GIT_CHANNELS.STATUS, (_, worktreeId: string) => getManager(worktreeId).status())
  ipcMain.handle(GIT_CHANNELS.DIFF, (_, worktreeId: string, filePath: string, staged: boolean) =>
    getManager(worktreeId).diff(filePath, staged),
  )
  ipcMain.handle(
    GIT_CHANNELS.LOG,
    (_, worktreeId: string, limit?: number, branch?: string, baseB?: string) =>
      getManager(worktreeId).log(limit, branch, baseB),
  )
  ipcMain.handle(GIT_CHANNELS.STAGE, (_, worktreeId: string, files: string[]) =>
    getManager(worktreeId).stage(files),
  )
  ipcMain.handle(GIT_CHANNELS.UNSTAGE, (_, worktreeId: string, files: string[]) =>
    getManager(worktreeId).unstage(files),
  )
  ipcMain.handle(GIT_CHANNELS.DISCARD, (_, worktreeId: string, files: string[]) =>
    getManager(worktreeId).discard(files),
  )
  ipcMain.handle(GIT_CHANNELS.COMMIT, (_, worktreeId: string, message: string, amend?: boolean) =>
    getManager(worktreeId).commit(message, amend),
  )
  ipcMain.handle(GIT_CHANNELS.PUSH, (_, worktreeId: string, setUpstream?: boolean) =>
    getManager(worktreeId).push(setUpstream),
  )
}
