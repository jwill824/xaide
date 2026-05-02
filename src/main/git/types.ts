export interface Hunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string  // the raw hunk text including header line
}

export interface StatusResult {
  branch: string
  ahead: number
  behind: number
  staged: string[]      // file paths
  unstaged: string[]    // file paths
  untracked: string[]   // file paths
}

export interface DiffResult {
  filePath: string
  splitMode: { hunks: Hunk[] }
  unifiedMode: string   // raw unified diff string
}

export interface CommitInfo {
  hash: string
  author: string
  date: string          // ISO string
  message: string
}

export interface LogResult {
  branchCommits: CommitInfo[]
  baseContextCommits: CommitInfo[]
}
