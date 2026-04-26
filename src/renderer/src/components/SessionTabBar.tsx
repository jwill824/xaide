import type { FC } from 'react'
import type { ShellSession } from '../store/uiStore'

interface Props {
  workspaceId: string
  sessions: ShellSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onCloseSession: (id: string) => void
  onOpenAgentLauncher: () => void
}

export const SessionTabBar: FC<Props> = ({
  workspaceId,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onCloseSession,
  onOpenAgentLauncher,
}) => (
  <div className="flex items-center border-b border-neutral-800 bg-neutral-900 px-1 shrink-0">
    {sessions
      .filter((s) => s.workspaceId === workspaceId)
      .map((session) => (
        <div
          key={session.id}
          role="tab"
          aria-selected={session.id === activeSessionId}
          className={[
            'group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer select-none border-b-2',
            session.id === activeSessionId
              ? 'border-blue-500 text-white'
              : 'border-transparent text-neutral-400 hover:text-neutral-200',
          ].join(' ')}
          onClick={() => onSelectSession(session.id)}
        >
          <span className="truncate max-w-[120px]">{session.title}</span>
          <button
            type="button"
            aria-label={`Close session ${session.title}`}
            className="hidden group-hover:flex items-center ml-1 text-neutral-500 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation()
              onCloseSession(session.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    <button
      type="button"
      aria-label="New terminal session"
      className="ml-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded"
      onClick={onNewSession}
    >
      +
    </button>
    <button
      type="button"
      aria-label="Launch agent session"
      title="Launch agent"
      className="ml-1 px-2 py-1 text-xs text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 rounded"
      onClick={onOpenAgentLauncher}
    >
      ✦
    </button>
  </div>
)
