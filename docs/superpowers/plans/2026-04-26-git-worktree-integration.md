# Git & Worktree Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `WorktreeManager` (create/list/delete git worktrees via `simple-git`), a `HookRunner` for lifecycle script hooks, a typed IPC bridge, and a `WorktreeList` UI panel — so users can create and switch between git worktrees per workspace from within the app.

**Architecture:** `WorktreeManager` (main process) owns all git and DB operations. Worktrees are stored in `~/.xaide/worktrees/{workspaceId}/{branchSlug}/` and tracked in a new `worktrees` SQLite table. `HookRunner` executes shell/JS scripts from `.agentapp/hooks/` at lifecycle events. The renderer queries worktrees via a typed `WorktreeAPI` on the `contextBridge`. The `WorktreeList` component renders in `LeftPanel` under the active workspace.

> **Docker integration note (Phase 9):** `WorktreeManager.create()` accepts an optional explicit `branch` parameter. When `SandboxManager` is built, it will pass a deterministic branch name (e.g. `feat/task-1-claude`) so the container bind-mount and the git worktree share the same branch identity. Callers that don't need this just omit `branch` and one is auto-generated.

**Tech Stack:** `simple-git` ^3, better-sqlite3, Drizzle ORM, React 18, TanStack React Query v5, zustand, Vitest

---

## File Structure

**New files:**
- `src/main/worktree/WorktreeManager.ts` — git worktree lifecycle (create/list/get/delete) + SQLite persistence
- `src/main/worktree/HookRunner.ts` — execute `.agentapp/hooks/{event}` scripts at lifecycle events
- `src/main/ipc/worktree.ipc.ts` — IPC handlers for worktree operations
- `src/renderer/src/hooks/useWorktrees.ts` — React Query hook for listing worktrees
- `src/renderer/src/components/WorktreeList.tsx` — UI list with New/Delete buttons
- `tests/main/worktree.test.ts` — WorktreeManager unit tests (real git repo in tmpdir)
- `tests/main/hook-runner.test.ts` — HookRunner unit tests
- `tests/renderer/WorktreeList.test.tsx` — component tests

**Modified files:**
- `src/main/db/client.ts` — add `worktrees` table to `SCHEMA_SQL`
- `src/main/db/schema.ts` — add `worktrees` Drizzle table definition
- `src/preload/ipc-types.ts` — add `WORKTREE_CHANNELS`, `WorktreeRecord`, `CreateWorktreeOptions`, `WorktreeAPI`; extend `XaideAPI`
- `src/preload/index.ts` — wire `worktree` API onto `contextBridge`
- `src/main/ipc/index.ts` — export `registerWorktreeHandlers`
- `src/main/index.ts` — instantiate `WorktreeManager` + `HookRunner`, register handlers
- `src/renderer/src/store/uiStore.ts` — add `activeWorktreeId` + `setActiveWorktree`
- `src/renderer/src/components/LeftPanel.tsx` — embed `WorktreeList` under workspace list
- `tests/renderer/setup.ts` — add `worktree` mock to `window.xaide`

---

## Task 1: Install simple-git + add worktrees table to DB schema

**Files:**
- Modify: `package.json` (add `simple-git` dependency)
- Modify: `src/main/db/client.ts` (add `worktrees` CREATE TABLE to SCHEMA_SQL)
- Modify: `src/main/db/schema.ts` (add `worktrees` Drizzle table)
- Test: `tests/main/db.test.ts` (add assertion that worktrees table exists)

- [ ] **Step 1: Install simple-git**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm install simple-git
```

Expected: `simple-git` appears in `package.json` dependencies.

- [ ] **Step 2: Add the failing test**

In `tests/main/db.test.ts`, add to the existing describe block:

```ts
it('creates the worktrees table', () => {
  const sqlite = createDb(':memory:')
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='worktrees'")
    .all() as { name: string }[]
  expect(tables).toHaveLength(1)
  sqlite.close()
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose 2>&1 | grep -A3 "worktrees table"
```

Expected: FAIL — "expected 0 to have length 1"

- [ ] **Step 4: Add `worktrees` table to `src/main/db/client.ts`**

Inside the `SCHEMA_SQL` template string, after the `plugins` table block and before the closing backtick, add:

```sql
  CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo_path TEXT NOT NULL,
    branch TEXT NOT NULL,
    base_branch TEXT NOT NULL DEFAULT 'HEAD',
    worktree_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active','merged','discarded')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_worktrees_workspace_id
    ON worktrees(workspace_id);
```

- [ ] **Step 5: Add `worktrees` Drizzle table to `src/main/db/schema.ts`**

Append at the end of the file:

```ts
export const worktrees = sqliteTable(
  'worktrees',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoPath: text('repo_path').notNull(),
    branch: text('branch').notNull(),
    baseBranch: text('base_branch').notNull().default('HEAD'),
    worktreePath: text('worktree_path').notNull(),
    status: text('status', { enum: ['active', 'merged', 'discarded'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_worktrees_workspace_id').on(t.workspaceId)],
)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm rebuild better-sqlite3 && npm test
```

Expected: all 36 main tests pass (including the new worktrees table test).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/main/db/client.ts src/main/db/schema.ts tests/main/db.test.ts
git commit -m "feat: install simple-git, add worktrees table to DB schema"
```

---

## Task 2: WorktreeManager

**Files:**
- Create: `src/main/worktree/WorktreeManager.ts`
- Create: `tests/main/worktree.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/worktree.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { WorktreeManager } from '../../src/main/worktree/WorktreeManager'
import * as schema from '../../src/main/db/schema'

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xaide-repo-'))
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  writeFileSync(join(dir, 'README.md'), '# test')
  execSync('git add .', { cwd: dir })
  execSync('git commit -m "init"', { cwd: dir })
  return dir
}

function makeManager() {
  const sqlite = createDb(':memory:')
  const db = drizzle(sqlite, { schema })
  return new WorktreeManager(db)
}

describe('WorktreeManager', () => {
  let repoPath: string
  let workspaceId: string

  beforeEach(() => {
    repoPath = makeGitRepo()
    workspaceId = 'ws-test-1'
  })

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true })
  })

  it('starts with an empty list for a workspace', () => {
    expect(makeManager().list(workspaceId)).toEqual([])
  })

  it('creates a worktree and returns the record', async () => {
    const mgr = makeManager()
    const wt = await mgr.create({ workspaceId, repoPath, label: 'auth-flow' })
    expect(wt.workspaceId).toBe(workspaceId)
    expect(wt.branch).toMatch(/^xaide\/auth-flow-/)
    expect(wt.status).toBe('active')
    expect(wt.repoPath).toBe(repoPath)
    rmSync(wt.worktreePath, { recursive: true, force: true })
  })

  it('accepts an explicit branch name (Docker integration path)', async () => {
    const mgr = makeManager()
    const wt = await mgr.create({
      workspaceId,
      repoPath,
      label: 'task-1',
      branch: 'feat/task-1-claude',
    })
    expect(wt.branch).toBe('feat/task-1-claude')
    rmSync(wt.worktreePath, { recursive: true, force: true })
  })

  it('lists created worktrees for a workspace', async () => {
    const mgr = makeManager()
    const wt = await mgr.create({ workspaceId, repoPath, label: 'feature-x' })
    const list = mgr.list(workspaceId)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(wt.id)
    rmSync(wt.worktreePath, { recursive: true, force: true })
  })

  it('deletes a worktree and removes its DB record', async () => {
    const mgr = makeManager()
    const wt = await mgr.create({ workspaceId, repoPath, label: 'delete-me' })
    await mgr.delete({ worktreeId: wt.id })
    expect(mgr.list(workspaceId)).toHaveLength(0)
  })

  it('throws when deleting a nonexistent worktree', async () => {
    await expect(
      makeManager().delete({ worktreeId: 'no-such-id' }),
    ).rejects.toThrow('Worktree not found')
  })

  it('get returns null for unknown id', () => {
    expect(makeManager().get('missing')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose 2>&1 | grep -E "FAIL|Cannot find module"
```

Expected: FAIL — "Cannot find module '../../src/main/worktree/WorktreeManager'"

- [ ] **Step 3: Implement WorktreeManager**

Create `src/main/worktree/WorktreeManager.ts`:

```ts
import { randomUUID } from 'crypto'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import simpleGit from 'simple-git'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { worktrees } from '../db/schema'
import * as schema from '../db/schema'

type DrizzleDb = BetterSQLite3Database<typeof schema>

export type Worktree = typeof worktrees.$inferSelect

export type CreateWorktreeInput = {
  workspaceId: string
  repoPath: string
  label: string
  /** Explicit branch name. If omitted, auto-generated as `xaide/{slug}-{8charId}`.
   *  Pass this when coordinating with SandboxManager (Docker phase) so the
   *  container bind-mount and the worktree share the same branch identity. */
  branch?: string
  /** Base branch/commit to fork from. Defaults to 'HEAD'. */
  baseBranch?: string
}

export type DeleteWorktreeInput = {
  worktreeId: string
  /** Also delete the git branch after removing the worktree. Default: false. */
  deleteBranch?: boolean
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function worktreePath(workspaceId: string, branchSlug: string): string {
  return join(homedir(), '.xaide', 'worktrees', workspaceId, branchSlug)
}

export class WorktreeManager {
  constructor(private db: DrizzleDb) {}

  async create(input: CreateWorktreeInput): Promise<Worktree> {
    const { workspaceId, repoPath, label, baseBranch = 'HEAD' } = input
    const shortId = randomUUID().slice(0, 8)
    const branch = input.branch ?? `xaide/${slugify(label)}-${shortId}`
    const branchSlug = branch.replace(/\//g, '-')
    const wtPath = worktreePath(workspaceId, branchSlug)

    mkdirSync(wtPath, { recursive: true })
    const git = simpleGit(repoPath)
    await git.raw(['worktree', 'add', '-b', branch, wtPath, baseBranch])

    const now = new Date().toISOString()
    const row = this.db
      .insert(worktrees)
      .values({
        id: randomUUID(),
        workspaceId,
        repoPath,
        branch,
        baseBranch,
        worktreePath: wtPath,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    if (!row) throw new Error('Failed to persist worktree record')
    return row
  }

  list(workspaceId: string): Worktree[] {
    return this.db
      .select()
      .from(worktrees)
      .where(eq(worktrees.workspaceId, workspaceId))
      .all()
  }

  get(id: string): Worktree | null {
    return (
      this.db.select().from(worktrees).where(eq(worktrees.id, id)).get() ?? null
    )
  }

  async delete(input: DeleteWorktreeInput): Promise<void> {
    const { worktreeId, deleteBranch = false } = input
    const record = this.get(worktreeId)
    if (!record) throw new Error(`Worktree not found: ${worktreeId}`)

    const git = simpleGit(record.repoPath)

    try {
      await git.raw(['worktree', 'remove', '--force', record.worktreePath])
    } catch {
      // Worktree path may already be gone — still clean up DB record
      rmSync(record.worktreePath, { recursive: true, force: true })
    }

    if (deleteBranch) {
      try {
        await git.deleteLocalBranch(record.branch, true)
      } catch {
        // Branch may not exist; ignore
      }
    }

    this.db.delete(worktrees).where(eq(worktrees.id, worktreeId)).run()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose 2>&1 | grep -E "worktree|PASS|FAIL"
```

Expected: all 7 WorktreeManager tests pass, all previous tests still pass (42+ total).

- [ ] **Step 5: Commit**

```bash
git add src/main/worktree/WorktreeManager.ts tests/main/worktree.test.ts
git commit -m "feat: add WorktreeManager with create/list/get/delete"
```

---

## Task 3: HookRunner

**Files:**
- Create: `src/main/worktree/HookRunner.ts`
- Create: `tests/main/hook-runner.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/hook-runner.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { HookRunner } from '../../src/main/worktree/HookRunner'

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xaide-hook-'))
  return dir
}

describe('HookRunner', () => {
  let repoPath: string
  let runner: HookRunner

  beforeEach(() => {
    repoPath = makeRepo()
    runner = new HookRunner()
  })

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true })
  })

  it('silently skips when no hooks dir exists', async () => {
    await expect(
      runner.run('worktree.created', {
        repoPath,
        branch: 'xaide/test-1',
        worktreePath: '/tmp/wt',
      }),
    ).resolves.toBeUndefined()
  })

  it('silently skips when no matching script exists', async () => {
    mkdirSync(join(repoPath, '.agentapp', 'hooks'), { recursive: true })
    await expect(
      runner.run('worktree.created', {
        repoPath,
        branch: 'xaide/test-1',
        worktreePath: '/tmp/wt',
      }),
    ).resolves.toBeUndefined()
  })

  it('runs a .sh hook script and passes env vars', async () => {
    const hooksDir = join(repoPath, '.agentapp', 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    const outFile = join(repoPath, 'hook.out')
    const scriptPath = join(hooksDir, 'worktree-created.sh')
    writeFileSync(
      scriptPath,
      `#!/bin/sh\necho "$XAIDE_BRANCH:$XAIDE_WORKTREE_PATH" > "${outFile}"\n`,
    )
    chmodSync(scriptPath, 0o755)

    await runner.run('worktree.created', {
      repoPath,
      branch: 'xaide/my-branch',
      worktreePath: '/tmp/test-wt',
    })

    const output = readFileSync(outFile, 'utf8').trim()
    expect(output).toBe('xaide/my-branch:/tmp/test-wt')
  })

  it('throws when hook script exits with non-zero', async () => {
    const hooksDir = join(repoPath, '.agentapp', 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    const scriptPath = join(hooksDir, 'worktree-created.sh')
    writeFileSync(scriptPath, '#!/bin/sh\nexit 1\n')
    chmodSync(scriptPath, 0o755)

    await expect(
      runner.run('worktree.created', {
        repoPath,
        branch: 'xaide/test',
        worktreePath: '/tmp/wt',
      }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose 2>&1 | grep -E "HookRunner|Cannot find"
```

Expected: FAIL — "Cannot find module '../../src/main/worktree/HookRunner'"

- [ ] **Step 3: Implement HookRunner**

Create `src/main/worktree/HookRunner.ts`:

```ts
import { existsSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type HookEvent =
  | 'worktree.created'
  | 'agent.started'
  | 'agent.idle'
  | 'agent.finished'
  | 'sandbox.ready'
  | 'pr.created'
  | 'task.loaded'
  | 'task.parallel.launched'

export type HookContext = {
  repoPath: string
  branch: string
  worktreePath: string
}

/** Maps hook event name to its script filename stem (dots → dashes). */
function eventToFilename(event: HookEvent): string {
  return event.replace(/\./g, '-')
}

export class HookRunner {
  async run(event: HookEvent, ctx: HookContext): Promise<void> {
    const hooksDir = join(ctx.repoPath, '.agentapp', 'hooks')
    if (!existsSync(hooksDir)) return

    const stem = eventToFilename(event)
    for (const ext of ['.sh', '.js', '']) {
      const scriptPath = join(hooksDir, stem + ext)
      if (existsSync(scriptPath)) {
        await this.runScript(scriptPath, ctx)
        return
      }
    }
  }

  private async runScript(scriptPath: string, ctx: HookContext): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      XAIDE_REPO_PATH: ctx.repoPath,
      XAIDE_BRANCH: ctx.branch,
      XAIDE_WORKTREE_PATH: ctx.worktreePath,
    }
    await execFileAsync(scriptPath, [], { env })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose 2>&1 | grep -E "HookRunner|Tests"
```

Expected: all 4 HookRunner tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/worktree/HookRunner.ts tests/main/hook-runner.test.ts
git commit -m "feat: add HookRunner for lifecycle script hooks (.agentapp/hooks/)"
```

---

## Task 4: Worktree IPC bridge

**Files:**
- Modify: `src/preload/ipc-types.ts` (add WORKTREE_CHANNELS, WorktreeRecord, CreateWorktreeOptions, WorktreeAPI; extend XaideAPI)
- Create: `src/main/ipc/worktree.ipc.ts`
- Modify: `src/main/ipc/index.ts` (export registerWorktreeHandlers)
- Modify: `src/main/index.ts` (instantiate WorktreeManager + HookRunner, register handlers)
- Modify: `src/preload/index.ts` (wire worktree API)
- Modify: `tests/renderer/setup.ts` (add worktree mock)

The IPC tests for worktree follow the same pattern as `tests/main/workspace.ipc.test.ts`. Create `tests/main/worktree.ipc.test.ts`.

- [ ] **Step 1: Write the failing IPC tests**

Create `tests/main/worktree.ipc.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorktreeManager, Worktree } from '../../src/main/worktree/WorktreeManager'
import type { HookRunner } from '../../src/main/worktree/HookRunner'

const mockIpcMain = { handle: vi.fn() }
vi.mock('electron', () => ({ ipcMain: mockIpcMain }))

const { registerWorktreeHandlers } = await import('../../src/main/ipc/worktree.ipc')

const SAMPLE: Worktree = {
  id: 'wt-1',
  workspaceId: 'ws-1',
  repoPath: '/repo',
  branch: 'xaide/test-abc12345',
  baseBranch: 'HEAD',
  worktreePath: '/home/.xaide/worktrees/ws-1/xaide-test-abc12345',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function makeManager(): WorktreeManager {
  return {
    list: vi.fn(() => [SAMPLE]),
    get: vi.fn(() => SAMPLE),
    create: vi.fn(async () => SAMPLE),
    delete: vi.fn(async () => undefined),
  } as unknown as WorktreeManager
}

function makeHookRunner(): HookRunner {
  return { run: vi.fn(async () => undefined) } as unknown as HookRunner
}

describe('worktree IPC handlers', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    handlers = {}
    mockIpcMain.handle.mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    })
    registerWorktreeHandlers(makeManager(), makeHookRunner())
  })

  it('registers worktree:list handler', () => {
    expect(handlers['worktree:list']).toBeDefined()
  })

  it('worktree:list returns worktrees', async () => {
    const result = await handlers['worktree:list']({}, 'ws-1')
    expect(result).toEqual([SAMPLE])
  })

  it('worktree:create returns new worktree and fires worktree.created hook', async () => {
    const mgr = makeManager()
    const hook = makeHookRunner()
    handlers = {}
    mockIpcMain.handle.mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    })
    registerWorktreeHandlers(mgr, hook)

    const result = await handlers['worktree:create']({}, {
      workspaceId: 'ws-1',
      repoPath: '/repo',
      label: 'my-task',
    })
    expect(result).toEqual(SAMPLE)
    expect(mgr.create).toHaveBeenCalledWith(expect.objectContaining({ label: 'my-task' }))
    expect(hook.run).toHaveBeenCalledWith('worktree.created', expect.objectContaining({ branch: SAMPLE.branch }))
  })

  it('worktree:delete calls manager.delete', async () => {
    const mgr = makeManager()
    handlers = {}
    mockIpcMain.handle.mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    })
    registerWorktreeHandlers(mgr, makeHookRunner())
    await handlers['worktree:delete']({}, 'wt-1', false)
    expect(mgr.delete).toHaveBeenCalledWith({ worktreeId: 'wt-1', deleteBranch: false })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test -- --reporter=verbose 2>&1 | grep -E "worktree IPC|Cannot find"
```

Expected: FAIL — "Cannot find module '../../src/main/ipc/worktree.ipc'"

- [ ] **Step 3: Add WORKTREE channels + types to `src/preload/ipc-types.ts`**

After the existing `PtyAPI` interface, append:

```ts
// --- Worktree ---

export const WORKTREE_CHANNELS = {
  LIST: 'worktree:list',
  CREATE: 'worktree:create',
  DELETE: 'worktree:delete',
} as const

export interface WorktreeRecord {
  id: string
  workspaceId: string
  repoPath: string
  branch: string
  baseBranch: string
  worktreePath: string
  status: 'active' | 'merged' | 'discarded'
  createdAt: string
  updatedAt: string
}

export interface CreateWorktreeOptions {
  workspaceId: string
  repoPath: string
  label: string
  /** Explicit branch name — pass from SandboxManager during Docker phase. */
  branch?: string
  baseBranch?: string
}

export interface WorktreeAPI {
  list: (workspaceId: string) => Promise<WorktreeRecord[]>
  create: (options: CreateWorktreeOptions) => Promise<WorktreeRecord>
  delete: (worktreeId: string, deleteBranch?: boolean) => Promise<void>
}
```

Then update the `XaideAPI` interface to add `worktree`:

```ts
export interface XaideAPI {
  workspace: WorkspaceAPI
  pty: PtyAPI
  worktree: WorktreeAPI
}
```

- [ ] **Step 4: Create `src/main/ipc/worktree.ipc.ts`**

```ts
import { ipcMain } from 'electron'
import type { WorktreeManager } from '../worktree/WorktreeManager'
import type { HookRunner } from '../worktree/HookRunner'
import { WORKTREE_CHANNELS } from '../../preload/ipc-types'
import type { CreateWorktreeOptions } from '../../preload/ipc-types'

export function registerWorktreeHandlers(
  manager: WorktreeManager,
  hookRunner: HookRunner,
): void {
  ipcMain.handle(WORKTREE_CHANNELS.LIST, (_, workspaceId: string) =>
    manager.list(workspaceId),
  )

  ipcMain.handle(WORKTREE_CHANNELS.CREATE, async (_, options: CreateWorktreeOptions) => {
    const wt = await manager.create(options)
    await hookRunner.run('worktree.created', {
      repoPath: options.repoPath,
      branch: wt.branch,
      worktreePath: wt.worktreePath,
    })
    return wt
  })

  ipcMain.handle(
    WORKTREE_CHANNELS.DELETE,
    (_, worktreeId: string, deleteBranch = false) =>
      manager.delete({ worktreeId, deleteBranch }),
  )
}
```

- [ ] **Step 5: Export from `src/main/ipc/index.ts`**

Replace the file content with:

```ts
export { registerWorkspaceHandlers } from './workspace.ipc'
export { registerPtyHandlers } from './pty.ipc'
export { registerWorktreeHandlers } from './worktree.ipc'
```

- [ ] **Step 6: Update `src/main/index.ts` to instantiate WorktreeManager + HookRunner**

Add imports at the top (after existing imports):

```ts
import { WorktreeManager } from './worktree/WorktreeManager'
import { HookRunner } from './worktree/HookRunner'
import { registerWorktreeHandlers } from './ipc'
```

Inside `createWindow()` (or wherever `registerWorkspaceHandlers` is called), add after that line:

```ts
const worktreeManager = new WorktreeManager(db)
const hookRunner = new HookRunner()
registerWorktreeHandlers(worktreeManager, hookRunner)
```

> **Note:** `db` here is the Drizzle instance. Check the existing `createWindow` / app setup code for the exact variable name and placement — the pattern mirrors how `WorkspaceManager` is instantiated.

- [ ] **Step 7: Wire worktree API in `src/preload/index.ts`**

Add the import at the top:

```ts
import type { XaideAPI, CreateWorkspaceInput, PtyCreateOptions, CreateWorktreeOptions } from './ipc-types'
import { IPC_CHANNELS, PTY_CHANNELS, WORKTREE_CHANNELS } from './ipc-types'
```

Add the `worktree` key to the `api` object:

```ts
  worktree: {
    list: (workspaceId: string) =>
      ipcRenderer.invoke(WORKTREE_CHANNELS.LIST, workspaceId),
    create: (options: CreateWorktreeOptions) =>
      ipcRenderer.invoke(WORKTREE_CHANNELS.CREATE, options),
    delete: (worktreeId: string, deleteBranch = false) =>
      ipcRenderer.invoke(WORKTREE_CHANNELS.DELETE, worktreeId, deleteBranch),
  },
```

- [ ] **Step 8: Add worktree mock to `tests/renderer/setup.ts`**

In the `window.xaide` mock object, add a `worktree` key alongside `workspace` and `pty`:

```ts
    worktree: {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({
        id: 'wt-mock-1',
        workspaceId: 'ws-mock-1',
        repoPath: '/mock/repo',
        branch: 'xaide/mock-abc12345',
        baseBranch: 'HEAD',
        worktreePath: '/home/.xaide/worktrees/ws-mock-1/xaide-mock-abc12345',
        status: 'active' as const,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
      delete: vi.fn(async () => undefined),
    },
```

- [ ] **Step 9: Run all tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test && npm run test:renderer
```

Expected: all main tests pass (including 4 new worktree IPC tests), all 25 renderer tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/preload/ipc-types.ts src/preload/index.ts \
        src/main/ipc/worktree.ipc.ts src/main/ipc/index.ts \
        src/main/index.ts tests/main/worktree.ipc.test.ts \
        tests/renderer/setup.ts
git commit -m "feat: add worktree IPC bridge (list/create/delete channels)"
```

---

## Task 5: WorktreeList component + LeftPanel update

**Files:**
- Modify: `src/renderer/src/store/uiStore.ts` (add activeWorktreeId + setActiveWorktree)
- Create: `src/renderer/src/hooks/useWorktrees.ts`
- Create: `src/renderer/src/components/WorktreeList.tsx`
- Modify: `src/renderer/src/components/LeftPanel.tsx` (embed WorktreeList)
- Create: `tests/renderer/WorktreeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/WorktreeList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorktreeList } from '../../src/renderer/src/components/WorktreeList'
import { useUiStore } from '../../src/renderer/src/store/uiStore'

const MOCK_WT = {
  id: 'wt-1',
  workspaceId: 'ws-1',
  repoPath: '/repo',
  branch: 'xaide/feature-abc12345',
  baseBranch: 'HEAD',
  worktreePath: '/home/.xaide/worktrees/ws-1/xaide-feature-abc12345',
  status: 'active' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('WorktreeList', () => {
  beforeEach(() => {
    useUiStore.setState({ activeWorktreeId: null })
    vi.mocked(window.xaide.worktree.list).mockResolvedValue([MOCK_WT])
  })

  it('renders loading state initially', () => {
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders worktree branch name after load', async () => {
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    await waitFor(() => expect(screen.getByText('xaide/feature-abc12345')).toBeInTheDocument())
  })

  it('renders empty state when no worktrees', async () => {
    vi.mocked(window.xaide.worktree.list).mockResolvedValue([])
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    await waitFor(() => expect(screen.getByText(/no worktrees/i)).toBeInTheDocument())
  })

  it('calls create and refetches on New button click', async () => {
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    await waitFor(() => screen.getByText('xaide/feature-abc12345'))
    fireEvent.click(screen.getByRole('button', { name: /new worktree/i }))
    await waitFor(() => expect(window.xaide.worktree.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', repoPath: '/repo' }),
    ))
  })

  it('sets activeWorktreeId on worktree item click', async () => {
    render(<WorktreeList workspaceId="ws-1" repoPath="/repo" />, { wrapper })
    await waitFor(() => screen.getByText('xaide/feature-abc12345'))
    fireEvent.click(screen.getByText('xaide/feature-abc12345'))
    expect(useUiStore.getState().activeWorktreeId).toBe('wt-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:renderer -- --reporter=verbose 2>&1 | grep -E "WorktreeList|Cannot find"
```

Expected: FAIL — "Cannot find module '../../src/renderer/src/components/WorktreeList'"

- [ ] **Step 3: Add `activeWorktreeId` to `src/renderer/src/store/uiStore.ts`**

Add to the `UiState` interface:

```ts
  activeWorktreeId: string | null
  setActiveWorktree: (id: string | null) => void
```

Add to the `create` call initial state:

```ts
  activeWorktreeId: null,
```

Add to the `create` call actions:

```ts
  setActiveWorktree: (id) => set({ activeWorktreeId: id }),
```

- [ ] **Step 4: Create `src/renderer/src/hooks/useWorktrees.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorktreeRecord, CreateWorktreeOptions } from '../../../preload/ipc-types'

export function useWorktrees(workspaceId: string | null) {
  return useQuery<WorktreeRecord[]>({
    queryKey: ['worktrees', workspaceId],
    queryFn: () => window.xaide.worktree.list(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useCreateWorktree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (options: CreateWorktreeOptions) => window.xaide.worktree.create(options),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['worktrees', variables.workspaceId] })
    },
  })
}

export function useDeleteWorktree(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worktreeId, deleteBranch }: { worktreeId: string; deleteBranch?: boolean }) =>
      window.xaide.worktree.delete(worktreeId, deleteBranch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worktrees', workspaceId] })
    },
  })
}
```

- [ ] **Step 5: Create `src/renderer/src/components/WorktreeList.tsx`**

```tsx
import type { FC } from 'react'
import { useWorktrees, useCreateWorktree, useDeleteWorktree } from '../hooks/useWorktrees'
import { useUiStore } from '../store/uiStore'

type Props = {
  workspaceId: string
  repoPath: string
}

export const WorktreeList: FC<Props> = ({ workspaceId, repoPath }) => {
  const { data: worktrees = [], isLoading, isError } = useWorktrees(workspaceId)
  const createWorktree = useCreateWorktree()
  const deleteWorktree = useDeleteWorktree(workspaceId)
  const activeWorktreeId = useUiStore((s) => s.activeWorktreeId)
  const setActiveWorktree = useUiStore((s) => s.setActiveWorktree)

  function handleNew() {
    const label = `session-${Date.now().toString(36)}`
    createWorktree.mutate({ workspaceId, repoPath, label })
  }

  return (
    <div className="flex flex-col">
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider select-none">
          Worktrees
        </span>
        <button
          type="button"
          aria-label="New worktree"
          title="New worktree"
          onClick={handleNew}
          disabled={createWorktree.isPending}
          className="text-neutral-500 hover:text-neutral-200 text-xs px-1 rounded disabled:opacity-50"
        >
          +
        </button>
      </div>
      {isError ? (
        <p className="px-3 py-1 text-xs text-red-500">Failed to load worktrees</p>
      ) : isLoading ? (
        <p className="px-3 py-1 text-xs text-neutral-600">Loading…</p>
      ) : worktrees.length === 0 ? (
        <p className="px-3 py-1 text-xs text-neutral-600">No worktrees yet</p>
      ) : (
        <ul>
          {worktrees.map((wt) => (
            <li key={wt.id} className="group flex items-center pr-1">
              <button
                type="button"
                aria-current={activeWorktreeId === wt.id ? 'true' : undefined}
                className={[
                  'flex-1 text-left px-3 py-1 text-xs rounded-sm truncate',
                  activeWorktreeId === wt.id
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                ].join(' ')}
                onClick={() => setActiveWorktree(wt.id)}
              >
                {wt.branch}
              </button>
              <button
                type="button"
                aria-label={`Delete worktree ${wt.branch}`}
                className="hidden group-hover:block text-neutral-600 hover:text-red-400 text-xs px-1 rounded"
                onClick={() => deleteWorktree.mutate({ worktreeId: wt.id })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Update `src/renderer/src/components/LeftPanel.tsx`**

Add the import at the top:

```ts
import { WorktreeList } from './WorktreeList'
```

After the workspace `<ul>` closing tag (before `</aside>`), add:

```tsx
      {activeWorkspaceId && (
        <WorktreeList
          workspaceId={activeWorkspaceId}
          repoPath={
            workspaces.find((ws) => ws.id === activeWorkspaceId)?.repoPath ?? ''
          }
        />
      )}
```

- [ ] **Step 7: Run all tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test && npm run test:renderer
```

Expected: all main tests pass, all renderer tests pass including 5 new WorktreeList tests.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/store/uiStore.ts \
        src/renderer/src/hooks/useWorktrees.ts \
        src/renderer/src/components/WorktreeList.tsx \
        src/renderer/src/components/LeftPanel.tsx \
        tests/renderer/WorktreeList.test.tsx
git commit -m "feat: add WorktreeList component + LeftPanel integration"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `WorktreeManager` with `create`/`list`/`delete` — Task 2
- ✅ `branch` parameter explicit for Docker integration — `CreateWorktreeInput.branch?`, noted in Task 2 + Task 4 types
- ✅ `baseBranch` defaults to `'HEAD'` — Task 2
- ✅ Worktrees persisted to SQLite — Task 1 schema + Task 2 insert
- ✅ `worktree.created` hook fires on create — Task 3 + Task 4 IPC handler
- ✅ `HookRunner` supports `.sh`, `.js`, no-extension scripts — Task 3
- ✅ IPC bridge (list/create/delete) — Task 4
- ✅ `WorktreeList` UI under active workspace — Task 5
- ✅ `activeWorktreeId` in zustand — Task 5
- ✅ `useWorktrees`, `useCreateWorktree`, `useDeleteWorktree` hooks — Task 5
- ✅ Docker integration note preserved throughout

**Type consistency check:**
- `CreateWorktreeInput` (WorktreeManager) matches `CreateWorktreeOptions` (IPC types) — both have `workspaceId, repoPath, label, branch?, baseBranch?`
- `Worktree` (DB infer) shape matches `WorktreeRecord` (IPC type) — both have `id, workspaceId, repoPath, branch, baseBranch, worktreePath, status, createdAt, updatedAt`
- `HookContext` fields (`repoPath, branch, worktreePath`) are populated from `Worktree` record in IPC handler — consistent
- `useWorktrees(workspaceId | null)` matches `WorktreeList` props (`workspaceId: string`) — `enabled: !!workspaceId` guards the null case
