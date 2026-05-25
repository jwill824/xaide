import type { FC } from 'react'
import { useActiveWorkspace } from '../hooks/useActiveWorkspace'
import { useGitStore } from '../store/gitStore'
import { useGitStatus, useGitDiff, useGitLog } from '../hooks/useGit'
import { WorktreeSelector } from './git/WorktreeSelector'
import { GitFileList } from './git/GitFileList'
import { DiffViewer } from './git/DiffViewer'
import { CommitForm } from './git/CommitForm'
import { CommitLog } from './git/CommitLog'

export const GitPanel: FC = () => {
  const workspace = useActiveWorkspace()
  const { activeWorktreeId, selectedFile, diffStaged } = useGitStore()

  const status = useGitStatus(activeWorktreeId)
  const diff = useGitDiff(activeWorktreeId, selectedFile || '', diffStaged)
  const log = useGitLog(activeWorktreeId, 20)

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <WorktreeSelector workspaceId={workspace?.id || null} />
      <div className="flex flex-1 min-h-0">
        <div className="w-80 flex flex-col border-r border-neutral-800 overflow-y-auto">
          <GitFileList
            worktreeId={activeWorktreeId || ''}
            status={status.data || null}
            isLoading={status.isLoading}
          />
          <CommitForm worktreeId={activeWorktreeId || ''} isLoading={status.isLoading} />
          <CommitLog log={log.data || null} isLoading={log.isLoading} />
        </div>
        <DiffViewer diff={diff.data || null} isLoading={diff.isLoading} />
      </div>
    </div>
  )
}
