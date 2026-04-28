import { useState } from 'react'
import type { FC } from 'react'
import { useHooks } from '../hooks/useHooks'

const HOOK_EVENTS = ['agent.start', 'agent.stop', 'agent.commit', 'agent.error'] as const
type HookEvent = (typeof HOOK_EVENTS)[number]

export const HooksSection: FC<{ workspaceId: string | null }> = ({ workspaceId }) => {
  const { hooks, createHook, updateHook, deleteHook } = useHooks(workspaceId)
  const [event, setEvent] = useState<HookEvent>('agent.start')
  const [command, setCommand] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createHook({
      event,
      command,
      workspaceId: workspaceId ?? null,
    })
    setEvent('agent.start')
    setCommand('')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-neutral-100">Hooks Configuration</h1>

      {hooks.length === 0 ? (
        <p className="text-neutral-400">No hooks configured</p>
      ) : (
        <table className="w-full text-sm text-neutral-200">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="pb-2">Event</th>
              <th className="pb-2">Command</th>
              <th className="pb-2">Enabled</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {hooks.map((hook) => (
              <tr key={hook.id} className="border-t border-neutral-700">
                <td className="py-2">{hook.event}</td>
                <td className="py-2 font-mono">{hook.command}</td>
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={hook.enabled}
                    onChange={() => updateHook({ id: hook.id, enabled: !hook.enabled })}
                    aria-label={`Toggle ${hook.event}`}
                  />
                </td>
                <td className="py-2">
                  <button
                    onClick={() => deleteHook(hook.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">Event</label>
          <select
            value={event}
            onChange={(e) => setEvent(e.target.value as HookEvent)}
            className="bg-neutral-800 text-neutral-200 rounded px-2 py-1 text-sm"
          >
            {HOOK_EVENTS.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">Command</label>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g. npm test"
            className="bg-neutral-800 text-neutral-200 rounded px-2 py-1 text-sm"
          />
        </div>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm"
        >
          Add Hook
        </button>
      </form>
    </div>
  )
}
