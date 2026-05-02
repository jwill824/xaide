import type { FC } from 'react'
import { useGitStore } from '../../store/gitStore'
import { useGitCommit } from '../../hooks/useGit'

interface Props {
  worktreeId: string
  isLoading?: boolean
}

export const CommitForm: FC<Props> = ({ worktreeId, isLoading }) => {
  const { commitMessage, setCommitMessage, stagedForCommit } = useGitStore()
  const commit = useGitCommit()

  return (
    <div className="flex flex-col gap-2 p-2 border-t border-neutral-800">
      <div className="text-xs text-neutral-400">
        {stagedForCommit.length} file(s) staged
      </div>
      <textarea
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        placeholder="Commit message..."
        className="w-full h-16 p-2 bg-neutral-900 border border-neutral-700 rounded text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
      />
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (commitMessage.trim()) {
              commit.mutate({ worktreeId, message: commitMessage })
              setCommitMessage('')
            }
          }}
          disabled={isLoading || !commitMessage.trim() || commit.isPending}
          className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 text-sm rounded"
        >
          Commit
        </button>
        <button
          disabled={isLoading || commit.isPending}
          className="px-2 py-1 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 text-sm rounded"
        >
          AI Generate
        </button>
      </div>
    </div>
  )
}
