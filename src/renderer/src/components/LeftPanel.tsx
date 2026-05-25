import { useState, type FC } from 'react'
import { useWorkspaces, useCreateWorkspace } from '../hooks/useWorkspaces'
import { useUiStore } from '../store/uiStore'
import { WorktreeList } from './WorktreeList'
import { TaskList } from './TaskList'

export const LeftPanel: FC = () => {
  const { data: workspaces = [], isLoading, isError } = useWorkspaces()
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useUiStore((s) => s.setActiveWorkspace)
  const activeTaskId = useUiStore((s) => s.activeTaskId)
  const setActiveTask = useUiStore((s) => s.setActiveTask)

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const createWorkspace = useCreateWorkspace()

  function handleCancel() {
    setShowForm(false)
    setName('')
    setRepoPath('')
  }

  function handleSubmit() {
    createWorkspace.mutate(
      { name, repoPath },
      {
        onSuccess: () => {
          setShowForm(false)
          setName('')
          setRepoPath('')
        },
      },
    )
  }

  return (
    <aside className="w-56 shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col">
      <div className="flex items-center px-3 py-2">
        <span className="flex-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
          Workspaces
        </span>
        <button
          type="button"
          aria-label="New workspace"
          className="text-neutral-500 hover:text-neutral-300 text-lg leading-none"
          onClick={() => setShowForm(true)}
        >
          +
        </button>
      </div>
      {showForm && (
        <div className="px-3 py-2 flex flex-col gap-1">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-neutral-800 text-neutral-200 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-neutral-600"
          />
          <input
            type="text"
            placeholder="Repo path"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            className="w-full bg-neutral-800 text-neutral-200 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-neutral-600"
          />
          <div className="flex gap-1 mt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createWorkspace.isPending}
              className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs px-2 py-1 rounded disabled:opacity-50"
            >
              {createWorkspace.isPending ? '…' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs px-2 py-1 rounded"
            >
              Cancel
            </button>
          </div>
          {createWorkspace.isError && (
            <p className="px-3 py-1 text-xs text-red-400">{String(createWorkspace.error)}</p>
          )}
        </div>
      )}
      {isError ? (
        <p className="px-3 py-2 text-xs text-red-500">Failed to load workspaces</p>
      ) : isLoading ? (
        <p className="px-3 py-2 text-xs text-neutral-600">Loading…</p>
      ) : workspaces.length === 0 ? (
        <p className="px-3 py-2 text-xs text-neutral-600">No workspaces yet</p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {workspaces.map((ws) => (
            <li key={ws.id}>
              <button
                type="button"
                aria-current={activeWorkspaceId === ws.id ? 'page' : undefined}
                className={[
                  'w-full text-left px-3 py-1.5 text-sm rounded-sm truncate',
                  activeWorkspaceId === ws.id
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-300 hover:bg-neutral-800',
                ].join(' ')}
                onClick={() => setActiveWorkspace(ws.id)}
              >
                {ws.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {activeWorkspaceId && (
        <WorktreeList
          workspaceId={activeWorkspaceId}
          repoPath={
            workspaces.find((ws) => ws.id === activeWorkspaceId)?.repoPath ?? ''
          }
        />
      )}
      {activeWorkspaceId && (
        <TaskList
          workspaceId={activeWorkspaceId}
          activeTaskId={activeTaskId}
          onSelectTask={setActiveTask}
        />
      )}
    </aside>
  )
}
