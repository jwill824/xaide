import { useState } from 'react'
import type { FC } from 'react'
import { useMcpServers } from '../hooks/useMcpServers'
import { useActiveWorkspace } from '../hooks/useActiveWorkspace'

export const McpServersSection: FC<{ workspaceId: string | null }> = ({ workspaceId }) => {
  const { servers, createServer, deleteServer, isPending } = useMcpServers(workspaceId)
  const activeWorkspace = useActiveWorkspace()
  const repoPath = activeWorkspace?.repoPath ?? ''
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'global' | 'workspace'>('global')
  const [configJson, setConfigJson] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let config = {}
    try {
      config = JSON.parse(configJson || '{}')
    } catch {
      config = {}
    }
    createServer(
      {
        name,
        scope,
        config: scope === 'workspace' && workspaceId
          ? { ...config, workspaceId }
          : config,
      },
      {
        onSuccess: () => {
          setName('')
          setScope('global')
          setConfigJson('')
        },
      }
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-neutral-100">MCP Servers</h1>

      <div className="flex gap-2">
        <button
          onClick={() => window.xaide.settings.writeMcpConfigClaude(repoPath, workspaceId ?? '')}
          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white"
        >
          Write Claude Config
        </button>
        <button
          onClick={() => window.xaide.settings.writeMcpConfigCopilot(repoPath, workspaceId ?? '')}
          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white"
        >
          Write Copilot Config
        </button>
      </div>

      {servers.length === 0 ? (
        <p className="text-neutral-400">No MCP servers configured</p>
      ) : (
        <table className="w-full text-sm text-neutral-200">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="pb-2">Name</th>
              <th className="pb-2">Scope</th>
              <th className="pb-2">Config</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {servers.map((server) => (
              <tr key={server.id} className="border-t border-neutral-700">
                <td className="py-2">{server.name}</td>
                <td className="py-2">
                  <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-xs">
                    {server.scope}
                  </span>
                </td>
                <td className="py-2 font-mono text-xs truncate max-w-xs">
                  {server.configJson.length > 60
                    ? server.configJson.slice(0, 60) + '…'
                    : server.configJson}
                </td>
                <td className="py-2">
                  <button
                    onClick={() => deleteServer(server.id)}
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

      <form onSubmit={handleSubmit} className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. my-mcp-server"
            className="bg-neutral-800 text-neutral-200 rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'global' | 'workspace')}
            className="bg-neutral-800 text-neutral-200 rounded px-2 py-1 text-sm"
          >
            <option value="global">global</option>
            <option value="workspace">workspace</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">Config JSON</label>
          <textarea
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            placeholder="{}"
            rows={2}
            className="bg-neutral-800 text-neutral-200 rounded px-2 py-1 text-sm font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm"
        >
          Add Server
        </button>
      </form>
    </div>
  )
}

