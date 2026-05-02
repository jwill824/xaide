import type { FC } from 'react'
import { useWorktrees } from '../../hooks/useWorktrees'
import { useGitStore } from '../../store/gitStore'

interface Props {
  workspaceId: string | null
}

export const WorktreeSelector: FC<Props> = ({ workspaceId }) => {
  const { data: worktrees, isLoading } = useWorktrees(workspaceId)
  const { activeWorktreeId, setActiveWorktreeId } = useGitStore()

  if (isLoading) return <div className="text-xs text-neutral-400">Loading...</div>

  const active = worktrees?.find((w) => w.id === activeWorktreeId)
  const label = active ? active.branch : 'Select worktree'

  return (
    <div className="flex items-center gap-2 p-2 border-b border-neutral-800">
      <span className="text-xs text-neutral-400">Worktree:</span>
      <select
        value={activeWorktreeId || ''}
        onChange={(e) => setActiveWorktreeId(e.target.value || null)}
        className="flex-1 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-xs text-neutral-100"
      >
        <option value="">None</option>
        {worktrees?.map((w) => (
          <option key={w.id} value={w.id}>
            {w.branch}
          </option>
        ))}
      </select>
    </div>
  )
}
