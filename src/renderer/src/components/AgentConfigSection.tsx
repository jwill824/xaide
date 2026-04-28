import { useState, useEffect, type FC } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAgentConfig } from '../hooks/useAgentConfig'
import { useActiveWorkspace } from '../hooks/useActiveWorkspace'

interface Props {
  workspaceId: string | null
}

interface FileConfigSubsectionProps {
  label: string
  repoPath: string
  readFn: (repoPath: string) => Promise<{ external: string; xaideManaged: string }>
  writeFn: (content: string) => Promise<void>
  queryKey: string
}

const FileConfigSubsection: FC<FileConfigSubsectionProps> = ({
  label,
  repoPath,
  readFn,
  writeFn,
  queryKey,
}) => {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => readFn(repoPath),
  })

  const [content, setContent] = useState('')

  useEffect(() => {
    if (data?.xaideManaged !== undefined) {
      setContent(data.xaideManaged)
    }
  }, [data?.xaideManaged])

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => writeFn(content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
    },
  })

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-neutral-200">{label}</h2>
      {isLoading ? (
        <p className="text-xs text-neutral-400">Loading...</p>
      ) : (
        <>
          {data?.external && (
            <textarea
              readOnly
              value={data.external}
              aria-label={`${label} external content`}
              className="w-full h-24 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-500 resize-none"
            />
          )}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            aria-label={`${label} managed content`}
            className="w-full h-32 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100 resize-none"
          />
          <button
            onClick={() => save()}
            disabled={isPending}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    </div>
  )
}

export const AgentConfigSection: FC<Props> = ({ workspaceId }) => {
  const activeWorkspace = useActiveWorkspace()
  const repoPath = activeWorkspace?.repoPath ?? ''

  const { globalConfig, workspaceConfig, upsert, isPending } = useAgentConfig(workspaceId)

  const [globalJson, setGlobalJson] = useState('')
  const [workspaceJson, setWorkspaceJson] = useState('')

  useEffect(() => {
    if (globalConfig?.configJson !== undefined) setGlobalJson(globalConfig.configJson)
  }, [globalConfig?.configJson])

  useEffect(() => {
    if (workspaceConfig?.configJson !== undefined) setWorkspaceJson(workspaceConfig.configJson)
  }, [workspaceConfig?.configJson])

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-100">Agent Configuration</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileConfigSubsection
          label="Claude (CLAUDE.md)"
          repoPath={repoPath}
          readFn={window.xaide.settings.readClaudeConfig}
          writeFn={window.xaide.settings.writeClaudeConfig}
          queryKey="claudeConfig"
        />
        <FileConfigSubsection
          label="GitHub Copilot (.github/copilot-instructions.md)"
          repoPath={repoPath}
          readFn={window.xaide.settings.readCopilotConfig}
          writeFn={window.xaide.settings.writeCopilotConfig}
          queryKey="copilotConfig"
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-neutral-200">Stored Agent Config</h2>

        <div className="space-y-2">
          <label className="text-xs text-neutral-400">Global Config (JSON)</label>
          <textarea
            value={globalJson}
            onChange={(e) => setGlobalJson(e.target.value)}
            aria-label="Global config JSON"
            className="w-full h-24 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100 resize-none"
          />
          <button
            onClick={() => upsert({ scope: 'global', configJson: globalJson })}
            disabled={isPending}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save Global'}
          </button>
        </div>

        {workspaceId && (
          <div className="space-y-2">
            <label className="text-xs text-neutral-400">Workspace Config (JSON)</label>
            <textarea
              value={workspaceJson}
              onChange={(e) => setWorkspaceJson(e.target.value)}
              aria-label="Workspace config JSON"
              className="w-full h-24 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100 resize-none"
            />
            <button
              onClick={() =>
                upsert({ scope: 'workspace', workspaceId: workspaceId, configJson: workspaceJson })
              }
              disabled={isPending}
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs text-white disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save Workspace'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

