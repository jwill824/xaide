import type { FC } from 'react'
import type { DiffResult } from '../../../src/main/git/types'

interface Props {
  diff: DiffResult | null
  isLoading: boolean
}

export const DiffViewer: FC<Props> = ({ diff, isLoading }) => {
  if (isLoading) return <div className="p-2 text-neutral-400">Loading diff...</div>
  if (!diff) return <div className="p-2 text-neutral-400">Select a file to view diff</div>

  const lines = diff.unifiedMode.split('\n')

  return (
    <div className="flex-1 overflow-auto bg-neutral-950 border-l border-neutral-800">
      <div className="font-mono text-xs p-2">
        <div className="text-neutral-400 mb-2">{diff.filePath}</div>
        {lines.map((line, i) => {
          let className = 'text-neutral-400'
          if (line.startsWith('+')) className = 'text-green-600 bg-green-950 bg-opacity-30'
          else if (line.startsWith('-')) className = 'text-red-600 bg-red-950 bg-opacity-30'
          else if (line.startsWith('@@')) className = 'text-blue-400'
          return (
            <div key={i} className={className}>
              {line}
            </div>
          )
        })}
      </div>
    </div>
  )
}
