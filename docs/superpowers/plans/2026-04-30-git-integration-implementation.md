# Git Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a full-featured Git panel in Xaide enabling status viewing, diffs, commit history, staged/unstaged changes, commits (with optional AI messages), and push operations—all scoped per worktree.

**Architecture:** Hybrid approach with GitManager backend (all git operations via simple-git) and frontend UI state store (Zustand). IPC bridge uses 8 channels following existing patterns (AGENT_CHANNELS, PTY_CHANNELS). Git panel is new left-rail icon button, auto-follows active worktree with manual override dropdown.

**Tech Stack:** simple-git (backend), Zustand (state), React (components), Vitest (tests), TypeScript

---

## File Structure

### Backend Files
- `src/main/git/types.ts` — Shared type definitions (CommitInfo, Hunk, StatusResult, DiffResult, LogResult)
- `src/main/git/GitManager.ts` — Core git operations facade (8 methods per spec)
- `src/main/git/git.ipc.ts` — IPC handlers for all 8 git channels

### IPC/Preload
- `src/preload/ipc-types.ts` — Modification: add GIT_CHANNELS and GitAPI interface

### Frontend
- `src/renderer/src/store/gitStore.ts` — Zustand store (state + actions)
- `src/renderer/src/hooks/useGit.ts` — Custom hook to call IPC methods
- `src/renderer/src/components/GitPanel.tsx` — Main component
- `src/renderer/src/components/git/GitFileList.tsx` — Lists staged/unstaged files
- `src/renderer/src/components/git/DiffViewer.tsx` — Split/unified diff display
- `src/renderer/src/components/git/CommitForm.tsx` — Commit UI (message + AI button)
- `src/renderer/src/components/git/CommitLog.tsx` — Recent commits
- `src/renderer/src/components/git/WorktreeSelector.tsx` — Dropdown for worktree selection
- `src/renderer/src/components/IconRail.tsx` — Modification: add Git button
- `src/renderer/src/App.tsx` — Modification: render GitPanel when active

### Tests
- `tests/main/git/GitManager.test.ts` — GitManager tests
- `tests/renderer/git/gitStore.test.ts` — Store tests
- `tests/renderer/git/GitPanel.test.tsx` — Component integration tests

---

## Task 1: Git Backend Types

**Files:**
- Create: `src/main/git/types.ts`
- Test: `tests/main/git/types.test.ts` (simple import test)

- [ ] **Step 1: Create test file**

```bash
mkdir -p tests/main/git
cat > tests/main/git/types.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import type {
  Hunk,
  StatusResult,
  DiffResult,
  CommitInfo,
  LogResult,
} from '../../../src/main/git/types';

describe('Git Types', () => {
  it('should export all required types', () => {
    // Types are compile-time only; this test verifies they're importable
    const _hunk: Hunk = {
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 5,
      content: '@@ -1,3 +1,5 @@\n line1\n+inserted\n line2',
    };

    const _status: StatusResult = {
      branch: 'main',
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
    };

    const _diff: DiffResult = {
      filePath: 'src/test.ts',
      splitMode: { hunks: [_hunk] },
      unifiedMode: 'diff output',
    };

    const _commit: CommitInfo = {
      hash: 'abc123',
      author: 'Test Author',
      date: new Date().toISOString(),
      message: 'Test commit',
    };

    const _log: LogResult = {
      branchCommits: [_commit],
      baseContextCommits: [],
    };

    expect(true).toBe(true);
  });
});
EOF
