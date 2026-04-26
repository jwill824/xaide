import { useState } from 'react'
import type { FC } from 'react'
import { useDetectedAgents } from '../hooks/useAgents'
import type { WorktreeRecord } from '../../../preload/ipc-types'

interface Props {
  worktrees: WorktreeRecord[]
  onLaunch: (agentId: string, worktreeId: string) => void
  onClose: () => void
}

export const AgentLauncher: FC<Props> = ({ worktrees, onLaunch, onClose }) => {
  const { data: agents = [] } = useDetectedAgents()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(
    worktrees[0]?.id ?? null,
  )

  const canLaunch = selectedAgent !== null && selectedWorktree !== null

  return (
    <div className="absolute top-8 left-0 z-50 w-72 bg-neutral-800 border border-neutral-700 rounded shadow-lg p-3 flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">Agent</p>
        <div className="flex flex-col gap-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => agent.installed && setSelectedAgent(agent.id)}
              disabled={!agent.installed}
              className={[
                'flex items-center justify-between px-2 py-1 rounded text-sm',
                selectedAgent === agent.id
                  ? 'bg-blue-600 text-white'
                  : agent.installed
                    ? 'text-neutral-200 hover:bg-neutral-700'
                    : 'text-neutral-500 cursor-not-allowed',
              ].join(' ')}
            >
              <span>{agent.name}</span>
              {!agent.installed && (
                <span className="text-xs text-neutral-500 ml-2">not installed</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {worktrees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">Worktree</p>
          <div className="flex flex-col gap-1">
            {worktrees.map((wt) => (
              <button
                key={wt.id}
                type="button"
                onClick={() => setSelectedWorktree(wt.id)}
                className={[
                  'px-2 py-1 rounded text-sm text-left',
                  selectedWorktree === wt.id
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-200 hover:bg-neutral-700',
                ].join(' ')}
              >
                {wt.branch}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canLaunch}
          onClick={() => canLaunch && onLaunch(selectedAgent!, selectedWorktree!)}
          className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Launch
        </button>
      </div>
    </div>
  )
}
