import { describe, it, expect } from 'vitest'
import type {
  Hunk,
  StatusResult,
  DiffResult,
  CommitInfo,
  LogResult,
} from '../../../src/main/git/types'

describe('Git Types', () => {
  it('should export all required types', () => {
    const _hunk: Hunk = {
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 5,
      content: '@@ -1,3 +1,5 @@\n line1\n+inserted\n line2',
    }

    const _status: StatusResult = {
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
    }

    const _diff: DiffResult = {
      filePath: 'src/test.ts',
      splitMode: { hunks: [_hunk] },
      unifiedMode: 'diff output',
    }

    const _commit: CommitInfo = {
      hash: 'abc123',
      author: 'Test Author',
      date: new Date().toISOString(),
      message: 'Test commit',
    }

    const _log: LogResult = {
      branchCommits: [_commit],
      baseContextCommits: [],
    }

    expect(true).toBe(true)
  })
})
