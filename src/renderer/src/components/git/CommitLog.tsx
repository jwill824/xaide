import type { FC } from 'react'
import type { LogResult } from '../../../../src/main/git/types'

interface Props {
  log: LogResult | null
  isLoading: boolean
}

export const CommitLog: FC<Props> = ({ log, isLoading }) => {
  if (isLoading) return <div className="p-2 text-neutral-400">Loading commits...</div>
  if (!log || log.branchCommits.length === 0) {
    return <div className="p-2 text-neutral-400">No commits</div>
  }

  return (
    <div className="flex flex-col gap-2 p-2 border-t border-neutral-800">
      <div className="text-xs text-neutral-400">Recent Commits</div>
      <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
        {log.branchCommits.slice(0, 10).map((c) => (
          <div key={c.hash} className="text-xs flex gap-2 p-1 bg-neutral-900 rounded">
            <div className="text-neutral-400 font-mono flex-shrink-0">{c.hash.slice(0, 7)}</div>
            <div className="text-neutral-300 flex-1 truncate">{c.message}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
