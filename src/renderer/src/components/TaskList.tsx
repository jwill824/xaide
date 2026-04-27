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

interface Props {
  workspaceId: string
}

export const TaskList: FC<Props> = ({ workspaceId }) => {
  const { data: tasks = [], isLoading } = useTasks(workspaceId)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const handleCreate = async () => {
    const title = newTitle.trim()
    if (!title) return
    await createTask.mutateAsync({ workspaceId, title })
    setNewTitle('')
    setShowForm(false)
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
              className="group px-3 py-1 flex items-center gap-2 hover:bg-neutral-800"
            >
              <button
                type="button"
                onClick={() => handleStatusCycle(task)}
                className={`text-[10px] shrink-0 ${STATUS_COLOR[task.status as Task['status']]} hover:opacity-70`}
                title={`Status: ${task.status} (click to advance)`}
              >
                {task.status}
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
