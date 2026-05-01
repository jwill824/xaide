# Git Integration Design

**Date:** 2026-04-30  
**Status:** Approved  
**Scope:** Add a dedicated Git panel to Xaide for viewing and managing worktree changes.

## Overview

Xaide runs each AI agent in its own git worktree. Currently, there's no way to see what an agent has changed, staged, or committed without leaving the app. This design adds a Git icon to the left rail, opening a comprehensive panel showing:

- **File status** — staged, unstaged, untracked files per worktree
- **Diff viewer** — unified or side-by-side diff with toggle
- **Commit workflow** — stage/unstage, write message, optionally AI-generate message, commit, push
- **Commit log** — history of the current worktree branch + context commits from its base branch

The Git panel auto-follows the active worktree (from the left panel) but can be overridden with a dropdown to inspect any worktree independently.

## Architecture

### Backend: GitManager (`src/main/git/GitManager.ts`)

A facade for all git operations, scoped per worktree. Returns clean, UI-ready data structures. No UI state — purely functional.

```ts
class GitManager {
  async getStatus(worktreePath: string): Promise<{
    staged: string[]        // paths staged for commit
    unstaged: string[]      // modified but not staged
    untracked: string[]     // new files
  }>

  async getDiff(
    worktreePath: string,
    filePath: string,
    mode: 'unified' | 'split'
  ): Promise<{
    before: string          // original content
    after: string           // new content
    hunks?: Hunk[]         // for split mode: line-by-line mapping
  }>

  async getLog(
    worktreePath: string,
    baseBranch: string,
    limit: number = 50
  ): Promise<{
    branch: CommitInfo[]    // commits on the worktree branch
    baseContext: CommitInfo[] // last N commits on base branch
  }>

  async stage(worktreePath: string, filePath: string): Promise<void>
  async unstage(worktreePath: string, filePath: string): Promise<void>
  async commit(worktreePath: string, message: string): Promise<string>
  async push(worktreePath: string, branch: string, remote?: string): Promise<void>
  async generateCommitMessage(worktreePath: string): Promise<string>
}
```

**Data types** (`src/main/git/types.ts`):

```ts
export interface CommitInfo {
  hash: string           // short SHA
  author: string         // "Name <email>"
  date: Date             // commit timestamp
  message: string        // full message
  summary: string        // first line
}

export interface Hunk {
  oldStart: number       // line number in before
  oldLines: number       // count in before
  newStart: number       // line number in after
  newLines: number       // count in after
  lines: string[]        // with +/- prefix
}

export interface StatusResult {
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

export interface DiffResult {
  before: string
  after: string
  hunks?: Hunk[]
}

export interface LogResult {
  branch: CommitInfo[]
  baseContext: CommitInfo[]
}
```

### IPC Bridge (`src/preload/ipc-types.ts`, `src/main/ipc/git.ipc.ts`, `src/preload/index.ts`)

**Channels:**

```ts
export const GIT_CHANNELS = {
  STATUS: 'git:status',
  DIFF: 'git:diff',
  LOG: 'git:log',
  STAGE: 'git:stage',
  UNSTAGE: 'git:unstage',
  COMMIT: 'git:commit',
  PUSH: 'git:push',
  GENERATE_MESSAGE: 'git:generate-message',
} as const

export interface GitAPI {
  status: (worktreePath: string) => Promise<StatusResult>
  diff: (worktreePath: string, filePath: string, mode: 'unified' | 'split') => Promise<DiffResult>
  log: (worktreePath: string, baseBranch: string, limit?: number) => Promise<LogResult>
  stage: (worktreePath: string, filePath: string) => Promise<void>
  unstage: (worktreePath: string, filePath: string) => Promise<void>
  commit: (worktreePath: string, message: string) => Promise<string>
  push: (worktreePath: string, branch: string, remote?: string) => Promise<void>
  generateMessage: (worktreePath: string) => Promise<string>
}
```

**IPC handlers** in `src/main/ipc/git.ipc.ts` register all 8 handlers, delegating to `GitManager`.

**Preload** exposes `window.xaide.git.*` via contextBridge.

### Frontend: GitPanel Component

**File:** `src/renderer/src/components/GitPanel.tsx`

Main component with sub-components:
- `GitFileList` — shows staged/unstaged/untracked files with stage/unstage/revert buttons
- `DiffViewer` — displays unified or split diff for selected file, toggleable mode
- `CommitForm` — message input, "Generate" button (calls `generateCommitMessage`), "Commit" button
- `CommitLog` — read-only list of branch commits + base branch context with dates/authors
- `WorktreeSelector` — dropdown to override active worktree (auto-follows left panel by default)

**UI State** (`src/renderer/src/store/gitStore.ts` — new zustand store):

```ts
interface GitStoreState {
  // Selection & view state
  activeWorktreeId: string | null       // synced from uiStore
  selectedWorktreePath: string | null   // dropdown override (null = auto-follow)
  selectedFilePath: string | null       // which file is being diffed
  diffMode: 'unified' | 'split'
  commitMessage: string

  // Data
  status: StatusResult | null
  diff: DiffResult | null
  log: LogResult | null

  // Loading states
  isLoading: boolean
  isPushing: boolean
  isGenerating: boolean

  // Setters
  setActiveWorktreeId: (id: string | null) => void
  setSelectedWorktreePath: (path: string | null) => void
  setSelectedFilePath: (path: string | null) => void
  setDiffMode: (mode: 'unified' | 'split') => void
  setCommitMessage: (msg: string) => void
  setStatus: (status: StatusResult | null) => void
  setDiff: (diff: DiffResult | null) => void
  setLog: (log: LogResult | null) => void
}
```

**Hooks** (`src/renderer/src/hooks/useGit.ts`):

```ts
// High-level hooks for common operations
export function useGitStatus(worktreePath: string | null) {
  // Load status on mount and refetch after stage/unstage/commit
}

export function useGitDiff(worktreePath: string | null, filePath: string | null) {
  // Load diff when file selected
}

export function useGitLog(worktreePath: string | null) {
  // Load log on mount
}

export function useStageFile(worktreePath: string | null, filePath: string | null) {
  // Call git.stage(), refetch status
}

export function useUnstageFile(worktreePath: string | null, filePath: string | null) {
  // Call git.unstage(), refetch status
}

export function useCommit(worktreePath: string | null, message: string) {
  // Call git.commit(), clear form, refetch log & status
}

export function usePush(worktreePath: string | null, branch: string) {
  // Call git.push() with error handling
}

export function useGenerateCommitMessage(worktreePath: string | null) {
  // Call git.generateMessage(), return message (don't auto-fill — user can edit first)
}
```

### Left Rail Integration

Add a Git icon button to `src/renderer/src/components/IconRail.tsx`:

```ts
const buttons = [
  { id: 'workspaces', icon: '📦', label: 'Workspaces' },
  { id: 'agents', icon: '🤖', label: 'Agents' },
  { id: 'tasks', icon: '📋', label: 'Tasks' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
  { id: 'git', icon: '⎇', label: 'Git' },  // NEW
]
```

Update `src/renderer/src/store/uiStore.ts` to add `activePanel: 'workspaces' | 'agents' | 'tasks' | 'settings' | 'git'`, defaulting to `'workspaces'`.

When Git is active, show `GitPanel` in place of the left panel content (similar to how Settings currently works).

## Data Flow

1. **User clicks Git icon** → `uiStore.setActivePanel('git')`
2. **GitPanel mounts** → reads `activeWorktreeId` from `uiStore`
3. **Load status & log** → calls `useGitStatus` and `useGitLog` on mount
4. **User clicks a file** → `setSelectedFilePath(path)`, `useGitDiff` loads diff
5. **User clicks stage/unstage** → `useStageFile` / `useUnstageFile`, refetch status
6. **User clicks "Generate"** → `useGenerateCommitMessage`, returns string (user can edit)
7. **User clicks "Commit"** → `useCommit`, clears form, refetches status & log
8. **User clicks "Push"** → `usePush`, shows success/error toast

**Worktree override:** If user opens the dropdown and picks a different worktree, `setSelectedWorktreePath(path)` — subsequent operations use that path instead of `activeWorktreeId`.

## Error Handling

- **Status/diff/log failures** → show error toast, display empty state ("Unable to load git status")
- **Stage/unstage failures** → inline error message next to the file
- **Commit failures** (nothing staged, merge conflicts, etc.) → error message in form, don't dismiss form
- **Push failures** (network, auth, branch protection) → error toast with "Retry" button
- **AI message generation failures** → error message in form, user can write manually

No component-level error boundary needed; errors are scoped to git operations and surfaced locally.

## Testing Strategy

**Backend tests** (`tests/main/git.test.ts`):
- 12 tests covering GitManager:
  - `getStatus()` with various file states
  - `getDiff()` with both modes
  - `getLog()` with branch + base context
  - `stage()`, `unstage()`, `commit()`, `push()`
  - Error cases (file not found, no changes, push failed)

**Renderer tests** (`tests/renderer/GitPanel.test.tsx`):
- 8 tests covering UI interactions:
  - File list renders staged/unstaged/untracked
  - Stage/unstage button clicks
  - Diff viewer switches modes
  - Commit form submission
  - Worktree selector changes active worktree
  - Generate message button

**Integration:** Manual testing of full flow (agent runs, user opens Git panel, stages changes, commits, pushes).

## Dependencies

- Existing: `simple-git` (already used by WorktreeManager)
- New: None — reuse existing libraries

## Implementation Order

1. Backend: GitManager + types + tests
2. IPC bridge: handlers + preload + types
3. Frontend hooks: useGit* hooks
4. Frontend components: GitFileList, DiffViewer, CommitForm, CommitLog, GitPanel
5. Left rail integration: Git icon, uiStore activePanel
6. Manual testing & iteration

## Success Criteria

- ✅ Git icon visible in left rail
- ✅ Clicking Git shows file status for active worktree
- ✅ Can stage/unstage files
- ✅ Diff viewer shows changes (both unified and split modes)
- ✅ Can commit with message (manual or AI-generated)
- ✅ Can push to remote
- ✅ Can override worktree with dropdown
- ✅ All tests passing (12 backend + 8 frontend)
