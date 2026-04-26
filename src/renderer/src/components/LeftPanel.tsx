import type { FC } from 'react'
import { useWorkspaces } from '../hooks/useWorkspaces'

export const LeftPanel: FC = () => {
  const { data: workspaces = [], isLoading, isError } = useWorkspaces()

  return (
    <aside className="w-56 shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col">
      <div className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
        Workspaces
      </div>
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
              <button type="button" className="w-full text-left px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 rounded-sm truncate">
                {ws.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
