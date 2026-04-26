import { ipcMain } from 'electron'
import type { WorktreeManager } from '../worktree/WorktreeManager'
import type { HookRunner } from '../worktree/HookRunner'
import { WORKTREE_CHANNELS } from '../../preload/ipc-types'
import type { CreateWorktreeOptions } from '../../preload/ipc-types'

export function registerWorktreeHandlers(
  manager: WorktreeManager,
  hookRunner: HookRunner,
): void {
  ipcMain.handle(WORKTREE_CHANNELS.LIST, (_, workspaceId: string) =>
    manager.list(workspaceId),
  )

  ipcMain.handle(WORKTREE_CHANNELS.CREATE, async (_, options: CreateWorktreeOptions) => {
    const wt = await manager.create(options)
    await hookRunner.run('worktree.created', {
      repoPath: options.repoPath,
      branch: wt.branch,
      worktreePath: wt.worktreePath,
    })
    return wt
  })

  ipcMain.handle(
    WORKTREE_CHANNELS.DELETE,
    (_, worktreeId: string, deleteBranch = false) =>
      manager.delete({ worktreeId, deleteBranch }),
  )
}