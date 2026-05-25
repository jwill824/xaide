import { create } from 'zustand'
import type { StatusResult, DiffResult, CommitInfo, LogResult } from '../../../src/main/git/types'

interface GitState {
  // Current worktree being viewed
  activeWorktreeId: string | null
  setActiveWorktreeId: (id: string | null) => void

  // Status
  status: StatusResult | null
  setStatus: (status: StatusResult | null) => void
  isLoadingStatus: boolean
  setIsLoadingStatus: (loading: boolean) => void

  // Diff viewer
  selectedFile: string | null
  setSelectedFile: (file: string | null) => void
  currentDiff: DiffResult | null
  setCurrentDiff: (diff: DiffResult | null) => void
  isLoadingDiff: boolean
  setIsLoadingDiff: (loading: boolean) => void
  diffStaged: boolean
  setDiffStaged: (staged: boolean) => void

  // Commit form
  commitMessage: string
  setCommitMessage: (msg: string) => void
  isCommitting: boolean
  setIsCommitting: (committing: boolean) => void

  // Log
  commitLog: LogResult | null
  setCommitLog: (log: LogResult | null) => void
  isLoadingLog: boolean
  setIsLoadingLog: (loading: boolean) => void

  // Staged files for commit
  stagedForCommit: string[]
  setStagedForCommit: (files: string[]) => void
}

export const useGitStore = create<GitState>((set) => ({
  activeWorktreeId: null,
  setActiveWorktreeId: (id) => set({ activeWorktreeId: id }),

  status: null,
  setStatus: (status) => set({ status }),
  isLoadingStatus: false,
  setIsLoadingStatus: (loading) => set({ isLoadingStatus: loading }),

  selectedFile: null,
  setSelectedFile: (file) => set({ selectedFile: file }),
  currentDiff: null,
  setCurrentDiff: (diff) => set({ currentDiff: diff }),
  isLoadingDiff: false,
  setIsLoadingDiff: (loading) => set({ isLoadingDiff: loading }),
  diffStaged: false,
  setDiffStaged: (staged) => set({ diffStaged: staged }),

  commitMessage: '',
  setCommitMessage: (msg) => set({ commitMessage: msg }),
  isCommitting: false,
  setIsCommitting: (committing) => set({ isCommitting: committing }),

  commitLog: null,
  setCommitLog: (log) => set({ commitLog: log }),
  isLoadingLog: false,
  setIsLoadingLog: (loading) => set({ isLoadingLog: loading }),

  stagedForCommit: [],
  setStagedForCommit: (files) => set({ stagedForCommit: files }),
}))
