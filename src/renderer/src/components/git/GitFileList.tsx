import type { FC } from 'react'
import { useGitStore } from '../../store/gitStore'
import { useGitStage, useGitUnstage, useGitDiscard } from '../../hooks/useGit'
import type { StatusResult } from '../../../../src/main/git/types'

interface Props {
  worktreeId: string
  status: StatusResult | null
  isLoading: boolean
}

export const GitFileList: FC<Props> = ({ worktreeId, status, isLoading }) => {
  const { selectedFile, setSelectedFile } = useGitStore()
  const stage = useGitStage()
  const unstage = useGitUnstage()
  const discard = useGitDiscard()

  if (isLoading) return <div className="p-2 text-neutral-400">Loading files...</div>
  if (!status) return <div className="p-2 text-neutral-400">No status available</div>

  return (
    <div className="flex flex-col gap-2 p-2 text-sm">
      {status.untracked.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer hover:text-neutral-200">
            Untracked ({status.untracked.length})
          </summary>
          <div className="ml-2 mt-1 flex flex-col gap-1">
            {status.untracked.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setSelectedFile(f)
                  stage.mutate({ worktreeId, files: [f] })
                }}
                className="text-left text-neutral-300 hover:text-white truncate"
              >
                ＋ {f}
              </button>
            ))}
          </div>
        </details>
      )}

      {status.unstaged.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer hover:text-neutral-200">
            Modified ({status.unstaged.length})
          </summary>
          <div className="ml-2 mt-1 flex flex-col gap-1">
            {status.unstaged.map((f) => (
              <div key={f} className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedFile(f)}
                  className="flex-1 text-left text-neutral-300 hover:text-white truncate"
                >
                  ⊙ {f}
                </button>
                <button
                  onClick={() => stage.mutate({ worktreeId, files: [f] })}
                  className="px-1 text-xs text-neutral-400 hover:text-white"
                >
                  Stage
                </button>
                <button
                  onClick={() => discard.mutate({ worktreeId, files: [f] })}
                  className="px-1 text-xs text-red-400 hover:text-red-200"
                >
                  Discard
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {status.staged.length > 0 && (
        <details className="group" open>
          <summary className="cursor-pointer hover:text-neutral-200">
            Staged ({status.staged.length})
          </summary>
          <div className="ml-2 mt-1 flex flex-col gap-1">
            {status.staged.map((f) => (
              <div key={f} className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedFile(f)}
                  className="flex-1 text-left text-green-300 hover:text-green-100 truncate"
                >
                  ✓ {f}
                </button>
                <button
                  onClick={() => unstage.mutate({ worktreeId, files: [f] })}
                  className="px-1 text-xs text-neutral-400 hover:text-white"
                >
                  Unstage
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
