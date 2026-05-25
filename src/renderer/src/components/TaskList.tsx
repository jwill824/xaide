import { useState } from 'react'
import type { FC, KeyboardEvent } from 'react'
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from '../hooks/useTasks'
import type { Task } from '../../../preload/ipc-types'

const STATUS_CYCLE: Record<Task['status'], Task['status']> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
  blocked: 'pending',
}

const STATUS_COLOR: Record<Task['status'], string> = {
  pending: 'text-neutral-400',
  in_progress: 'text-blue-400',
  done: 'text-green-400',
  blocked: 'text-red-400',
}

const STATUS_LABEL: Record<Task['status'], string> = {
  pending: '○ pending',
  in_progress: '● in progress',
  done: '✓ done',
  blocked: '✗ blocked',
}

const STATUS_NEXT: Record<Task['status'], string> = {
  pending: 'Start → in progress',
  in_progress: 'Complete → done',
  done: 'Reset → pending',
  blocked: 'Unblock → pending',
}

interface Props {
  workspaceId: string
  activeTaskId?: string | null
  onSelectTask?: (taskId: string) => void
}

export const TaskList: FC<Props> = ({ workspaceId, activeTaskId, onSelectTask }) => {
  const { data: tasks = [], isLoading } = useTasks(workspaceId)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const handleCreate = async () => {
    const title = newTitle.trim()
    if (!title) return
    try {
      await createTask.mutateAsync({ workspaceId, title })
      setNewTitle('')
      setShowForm(false)
    } catch {
      // mutation error is stored in createTask.error
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') {
      setShowForm(false)
      setNewTitle('')
    }
  }

  const handleStatusCycle = (task: Task) => {
    updateTask.mutate({ id: task.id, input: { status: STATUS_CYCLE[task.status] } })
  }

  const handleDelete = (task: Task) => {
    deleteTask.mutate({ id: task.id, workspaceId })
  }

  return (
    <div className="border-t border-neutral-800 flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
          Tasks
        </span>
        <button
          type="button"
          aria-label="Add task"
          onClick={() => setShowForm(true)}
          className="text-neutral-500 hover:text-neutral-300 text-xs leading-none"
        >
          +
        </button>
      </div>

      {showForm && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            type="text"
            placeholder="Task title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-neutral-800 text-neutral-200 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-neutral-600"
          />
          {createTask.isError && (
            <p className="text-xs text-red-400 px-2 pb-1">Failed to create task</p>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="px-3 py-1 text-xs text-neutral-600">Loading…</p>
      ) : tasks.length === 0 && !showForm ? (
        <p className="px-3 py-1 text-xs text-neutral-600 select-none">No tasks yet</p>
      ) : (
        <ul className="overflow-y-auto max-h-48">
          {tasks.map((task) => (
            <li
              key={task.id}
              className={[
                'group px-3 py-1 flex items-center gap-2 cursor-pointer',
                activeTaskId === task.id ? 'bg-neutral-700' : 'hover:bg-neutral-800',
              ].join(' ')}
              onClick={() => onSelectTask?.(task.id)}
            >
              <button
                type="button"
                onClick={() => handleStatusCycle(task)}
                className={`text-[10px] shrink-0 font-medium ${STATUS_COLOR[task.status]} hover:opacity-70 transition-opacity cursor-pointer`}
                title={STATUS_NEXT[task.status]}
                aria-label={`${task.status} — click to advance`}
              >
                {STATUS_LABEL[task.status]}
              </button>
              <span className="flex-1 text-xs text-neutral-300 truncate" title={task.title}>
                {task.title}
              </span>
              <button
                type="button"
                aria-label="Delete task"
                onClick={() => handleDelete(task)}
                className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 text-xs leading-none"
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
