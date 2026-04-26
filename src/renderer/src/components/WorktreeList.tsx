import type { FC } from 'react'
import { useWorktrees, useCreateWorktree, useDeleteWorktree } from '../hooks/useWorktrees'
import { useUiStore } from '../store/uiStore'

type Props = {
  workspaceId: string
  repoPath: string
}

export const WorktreeList: FC<Props> = ({ workspaceId, repoPath }) => {
  const { data: worktrees = [], isLoading, isError } = useWorktrees(workspaceId)
  const createWorktree = useCreateWorktree()
  const deleteWorktree = useDeleteWorktree(workspaceId)
  const activeWorktreeId = useUiStore((s) => s.activeWorktreeId)
  const setActiveWorktree = useUiStore((s) => s.setActiveWorktree)

  function handleNew() {
    const label = `session-${Date.now().toString(36)}`
    createWorktree.mutate({ workspaceId, repoPath, label })
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
          Worktrees
        </span>
        <button
          type="button"
          aria-label="New worktree"
          title="New worktree"
          onClick={handleNew}
          disabled={createWorktree.isPending}
          className="text-neutral-500 hover:text-neutral-200 text-xs px-1 rounded disabled:opacity-50"
        >
          +
        </button>
      </div>
      {isError ? (
        <p className="px-3 py-1 text-xs text-red-500">Failed to load worktrees</p>
      ) : isLoading ? (
        <p className="px-3 py-1 text-xs text-neutral-600">Loading…</p>
      ) : worktrees.length === 0 ? (
        <p className="px-3 py-1 text-xs text-neutral-600">No worktrees yet</p>
      ) : (
        <ul>
          {worktrees.map((wt) => (
            <li key={wt.id} className="group flex items-center pr-1">
              <button
                type="button"
                aria-current={activeWorktreeId === wt.id ? 'true' : undefined}
                className={[
                  'flex-1 text-left px-3 py-1 text-xs rounded-sm truncate',
                  activeWorktreeId === wt.id
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                ].join(' ')}
                onClick={() => setActiveWorktree(wt.id)}
              >
                {wt.branch}
              </button>
              <button
                type="button"
                aria-label={`Delete worktree ${wt.branch}`}
                className="hidden group-hover:block text-neutral-600 hover:text-red-400 text-xs px-1 rounded"
                onClick={() => deleteWorktree.mutate({ worktreeId: wt.id })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}