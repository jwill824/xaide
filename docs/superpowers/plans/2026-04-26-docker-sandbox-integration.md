# Docker Sandbox Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow AI agent sessions to run inside Docker containers that mount the active worktree, providing process isolation and a reproducible environment.

**Architecture:** A new `SandboxManager` wraps the Docker CLI to create/start/stop containers. `AgentSessionManager.create()` accepts an optional `sandboxImage` — when provided, it creates+starts a container mounting the worktree at `/workspace`, then spawns `docker exec` as the PTY command instead of the agent CLI directly. Kill flow is updated to stop/remove the container. A sandbox toggle is added to `AgentLauncher`, wired all the way through IPC and into the renderer.

**Tech Stack:** Docker CLI (`execFileSync`), Electron IPC, React, Tailwind CSS, Drizzle ORM (SQLite), Vitest + Testing Library.

---

## File Map

**New files:**
- `src/main/sandbox/SandboxManager.ts` — Docker lifecycle: isDockerAvailable, create, start, stop, remove, execArgs
- `src/main/ipc/sandbox.ipc.ts` — 5 IPC handlers (available, create, start, stop, remove)
- `src/renderer/src/hooks/useDockerStatus.ts` — React Query hook polling sandbox:available
- `tests/main/sandbox-manager.test.ts` — 6 SandboxManager unit tests
- `tests/main/sandbox.ipc.test.ts` — 5 IPC handler tests

**Modified files:**
- `src/preload/ipc-types.ts` — SANDBOX_CHANNELS, SandboxCreateOptions, SandboxInfo, SandboxAPI; add `sandboxImage?` to CreateAgentSessionInput; update `AgentAPI.killSession` to accept `containerId?`; add `sandbox: SandboxAPI` to XaideAPI
- `src/preload/index.ts` — bind sandbox API via contextBridge
- `src/main/ipc/index.ts` — export `registerSandboxHandlers`
- `src/main/index.ts` — instantiate SandboxManager, pass to AgentSessionManager + registerSandboxHandlers
- `src/main/agent/types.ts` — add `sandboxImage?` to CreateAgentSessionInput
- `src/main/agent/AgentSessionManager.ts` — accept SandboxManager; sandbox path in create(); containerId cleanup in kill()
- `src/main/ipc/agent.ipc.ts` — pass containerId through SESSION_KILL handler
- `src/renderer/src/store/uiStore.ts` — add `containerId?: string | null` to AgentSessionUiRecord
- `src/renderer/src/components/MainArea.tsx` — handleLaunchAgent accepts sandboxImage, handleKillAgentSession passes containerId
- `src/renderer/src/components/AgentLauncher.tsx` — sandbox section (toggle + image input + Docker status)
- `tests/main/agent-session-manager.test.ts` — add sandbox tests, update kill mock for containerId
- `tests/renderer/AgentLauncher.test.tsx` — add 3 sandbox tests
- `tests/renderer/setup.ts` — add `sandbox` mock to window.xaide

---

## Task 1: SandboxManager

**Files:**
- Create: `src/main/sandbox/SandboxManager.ts`
- Test: `tests/main/sandbox-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/main/sandbox-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from 'node:child_process'
import { SandboxManager } from '../../src/main/sandbox/SandboxManager'

const mockExec = vi.mocked(execFileSync)

describe('SandboxManager', () => {
  let manager: SandboxManager

  beforeEach(() => {
    manager = new SandboxManager()
    vi.clearAllMocks()
  })

  it('isDockerAvailable returns true when docker info succeeds', () => {
    mockExec.mockReturnValue('' as any)
    expect(manager.isDockerAvailable()).toBe(true)
    expect(mockExec).toHaveBeenCalledWith('docker', ['info'], { stdio: 'pipe' })
  })

  it('isDockerAvailable returns false when docker info throws', () => {
    mockExec.mockImplementation(() => { throw new Error('docker not found') })
    expect(manager.isDockerAvailable()).toBe(false)
  })

  it('create returns SandboxInfo with trimmed containerId from docker output', () => {
    mockExec.mockReturnValue('abc123def456\n' as any)
    const info = manager.create({ image: 'node:22', worktreePath: '/tmp/wt', branch: 'feat/x' })
    expect(info.containerId).toBe('abc123def456')
    expect(info.image).toBe('node:22')
    expect(info.worktreePath).toBe('/tmp/wt')
    expect(mockExec).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['create', '--rm', '-v', '/tmp/wt:/workspace', 'node:22']),
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('start calls docker start with the containerId', () => {
    mockExec.mockReturnValue('' as any)
    manager.start('abc123')
    expect(mockExec).toHaveBeenCalledWith('docker', ['start', 'abc123'], { stdio: 'pipe' })
  })

  it('stop does not throw when docker stop fails (container already stopped)', () => {
    mockExec.mockImplementation(() => { throw new Error('no such container') })
    expect(() => manager.stop('abc123')).not.toThrow()
  })

  it('execArgs returns docker exec -i prefix for the given containerId', () => {
    const result = manager.execArgs('abc123')
    expect(result.command).toBe('docker')
    expect(result.prefixArgs).toEqual(['exec', '-i', 'abc123'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:main -- --reporter=verbose tests/main/sandbox-manager.test.ts
```
Expected: FAIL — Cannot find module `../../src/main/sandbox/SandboxManager`

- [ ] **Step 3: Implement SandboxManager**

```typescript
// src/main/sandbox/SandboxManager.ts
import { execFileSync } from 'node:child_process'

export interface SandboxCreateOptions {
  image: string
  worktreePath: string
  branch: string
}

export interface SandboxInfo {
  containerId: string
  image: string
  worktreePath: string
}

export class SandboxManager {
  isDockerAvailable(): boolean {
    try {
      execFileSync('docker', ['info'], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  create(options: SandboxCreateOptions): SandboxInfo {
    const args = [
      'create',
      '--rm',
      '-v', `${options.worktreePath}:/workspace`,
      '-w', '/workspace',
      '--label', `xaide.branch=${options.branch}`,
      options.image,
      'sleep', 'infinity',
    ]
    const output = execFileSync('docker', args, { stdio: 'pipe', encoding: 'utf8' })
    const containerId = output.trim()
    return { containerId, image: options.image, worktreePath: options.worktreePath }
  }

  start(containerId: string): void {
    execFileSync('docker', ['start', containerId], { stdio: 'pipe' })
  }

  stop(containerId: string): void {
    try {
      execFileSync('docker', ['stop', '-t', '5', containerId], { stdio: 'pipe' })
    } catch {
      // Container may already be stopped or removed
    }
  }

  remove(containerId: string): void {
    try {
      execFileSync('docker', ['rm', '-f', containerId], { stdio: 'pipe' })
    } catch {
      // Container may already be removed
    }
  }

  /** Returns the command + prefix args to run a process inside a running container */
  execArgs(containerId: string): { command: string; prefixArgs: string[] } {
    return {
      command: 'docker',
      prefixArgs: ['exec', '-i', containerId],
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:main -- --reporter=verbose tests/main/sandbox-manager.test.ts
```
Expected: 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/main/sandbox/SandboxManager.ts tests/main/sandbox-manager.test.ts
git commit -m "feat: add SandboxManager for Docker container lifecycle

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Sandbox IPC Types + Handlers + Preload

**Files:**
- Create: `src/main/ipc/sandbox.ipc.ts`
- Create: `tests/main/sandbox.ipc.test.ts`
- Modify: `src/preload/ipc-types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/renderer/setup.ts`

- [ ] **Step 1: Write the failing IPC test**

```typescript
// tests/main/sandbox.ipc.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import { ipcMain } from 'electron'
import { registerSandboxHandlers } from '../../src/main/ipc/sandbox.ipc'
import type { SandboxManager } from '../../src/main/sandbox/SandboxManager'

function makeSandboxManager() {
  return {
    isDockerAvailable: vi.fn().mockReturnValue(true),
    create: vi.fn().mockReturnValue({ containerId: 'cnt-1', image: 'node:22', worktreePath: '/tmp/wt' }),
    start: vi.fn(),
    stop: vi.fn(),
    remove: vi.fn(),
  } as unknown as SandboxManager
}

describe('registerSandboxHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers sandbox:available, sandbox:create, sandbox:start, sandbox:stop, sandbox:remove handlers', () => {
    registerSandboxHandlers(makeSandboxManager())
    const channels = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0])
    expect(channels).toContain('sandbox:available')
    expect(channels).toContain('sandbox:create')
    expect(channels).toContain('sandbox:start')
    expect(channels).toContain('sandbox:stop')
    expect(channels).toContain('sandbox:remove')
  })

  it('sandbox:available calls sandbox.isDockerAvailable()', async () => {
    const sandbox = makeSandboxManager()
    registerSandboxHandlers(sandbox)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'sandbox:available')?.[1]
    const result = await (handler as Function)({})
    expect(sandbox.isDockerAvailable).toHaveBeenCalledOnce()
    expect(result).toBe(true)
  })

  it('sandbox:create calls sandbox.create() with options', async () => {
    const sandbox = makeSandboxManager()
    registerSandboxHandlers(sandbox)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'sandbox:create')?.[1]
    const opts = { image: 'node:22', worktreePath: '/tmp/wt', branch: 'feat/x' }
    await (handler as Function)({}, opts)
    expect(sandbox.create).toHaveBeenCalledWith(opts)
  })

  it('sandbox:start calls sandbox.start() with containerId', async () => {
    const sandbox = makeSandboxManager()
    registerSandboxHandlers(sandbox)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'sandbox:start')?.[1]
    await (handler as Function)({}, 'cnt-1')
    expect(sandbox.start).toHaveBeenCalledWith('cnt-1')
  })

  it('sandbox:stop calls sandbox.stop() with containerId', async () => {
    const sandbox = makeSandboxManager()
    registerSandboxHandlers(sandbox)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'sandbox:stop')?.[1]
    await (handler as Function)({}, 'cnt-1')
    expect(sandbox.stop).toHaveBeenCalledWith('cnt-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:main -- --reporter=verbose tests/main/sandbox.ipc.test.ts
```
Expected: FAIL — Cannot find module `../../src/main/ipc/sandbox.ipc`

- [ ] **Step 3: Update `src/preload/ipc-types.ts`**

Add after the `// --- Tasks ---` block (before the `XaideAPI` interface):

```typescript
// --- Sandbox ---

export const SANDBOX_CHANNELS = {
  AVAILABLE: 'sandbox:available',
  CREATE: 'sandbox:create',
  START: 'sandbox:start',
  STOP: 'sandbox:stop',
  REMOVE: 'sandbox:remove',
} as const

export interface SandboxCreateOptions {
  image: string
  worktreePath: string
  branch: string
}

export interface SandboxInfo {
  containerId: string
  image: string
  worktreePath: string
}

export interface SandboxAPI {
  isAvailable: () => Promise<boolean>
  create: (options: SandboxCreateOptions) => Promise<SandboxInfo>
  start: (containerId: string) => Promise<void>
  stop: (containerId: string) => Promise<void>
  remove: (containerId: string) => Promise<void>
}
```

Also update `CreateAgentSessionInput` — add `sandboxImage?`:
```typescript
export interface CreateAgentSessionInput {
  agentId: string
  worktreeId: string
  worktreePath: string
  branch: string
  taskId?: string
  cols?: number
  rows?: number
  sandboxImage?: string   // ← add this line
}
```

Update `AgentAPI.killSession` signature to accept optional containerId:
```typescript
export interface AgentAPI {
  listDetected: () => Promise<DetectedAgent[]>
  createSession: (input: CreateAgentSessionInput) => Promise<AgentSessionRecord>
  listSessions: () => Promise<AgentSessionRecord[]>
  killSession: (sessionId: string, ptySessionId: string, containerId?: string | null) => Promise<void>
}
```

Update `XaideAPI` to include sandbox:
```typescript
export interface XaideAPI {
  workspace: WorkspaceAPI
  pty: PtyAPI
  worktree: WorktreeAPI
  agent: AgentAPI
  tasks: TaskAPI
  sandbox: SandboxAPI   // ← add this line
}
```

- [ ] **Step 4: Create `src/main/ipc/sandbox.ipc.ts`**

```typescript
// src/main/ipc/sandbox.ipc.ts
import { ipcMain } from 'electron'
import { SANDBOX_CHANNELS } from '../../preload/ipc-types'
import type { SandboxCreateOptions } from '../../preload/ipc-types'
import type { SandboxManager } from '../sandbox/SandboxManager'

export function registerSandboxHandlers(sandbox: SandboxManager): void {
  ipcMain.handle(SANDBOX_CHANNELS.AVAILABLE, () => sandbox.isDockerAvailable())

  ipcMain.handle(SANDBOX_CHANNELS.CREATE, (_, options: SandboxCreateOptions) =>
    sandbox.create(options),
  )

  ipcMain.handle(SANDBOX_CHANNELS.START, (_, containerId: string) => sandbox.start(containerId))

  ipcMain.handle(SANDBOX_CHANNELS.STOP, (_, containerId: string) => sandbox.stop(containerId))

  ipcMain.handle(SANDBOX_CHANNELS.REMOVE, (_, containerId: string) => sandbox.remove(containerId))
}
```

- [ ] **Step 5: Update `src/main/ipc/index.ts`** — add export:

```typescript
export { registerSandboxHandlers } from './sandbox.ipc'
```

(Add alongside the existing exports.)

- [ ] **Step 6: Update `src/preload/index.ts`** — add sandbox binding

Import `SANDBOX_CHANNELS` and `SandboxAPI`:
```typescript
import {
  // ... existing imports ...
  SANDBOX_CHANNELS,
  type SandboxAPI,
} from './ipc-types'
```

Add to the `contextBridge.exposeInMainWorld('xaide', { ... })` object:
```typescript
sandbox: {
  isAvailable: () => ipcRenderer.invoke(SANDBOX_CHANNELS.AVAILABLE),
  create: (options) => ipcRenderer.invoke(SANDBOX_CHANNELS.CREATE, options),
  start: (containerId) => ipcRenderer.invoke(SANDBOX_CHANNELS.START, containerId),
  stop: (containerId) => ipcRenderer.invoke(SANDBOX_CHANNELS.STOP, containerId),
  remove: (containerId) => ipcRenderer.invoke(SANDBOX_CHANNELS.REMOVE, containerId),
} satisfies SandboxAPI,
```

- [ ] **Step 7: Update `src/main/index.ts`** — instantiate SandboxManager and register handlers

Add import:
```typescript
import { SandboxManager } from './sandbox/SandboxManager'
import { registerSandboxHandlers } from './ipc'
```

In `app.whenReady()`, after `const agentRegistry = new AgentRegistry()`:
```typescript
const sandboxManager = new SandboxManager()
```

After `registerTaskHandlers(taskManager)`:
```typescript
registerSandboxHandlers(sandboxManager)
```

- [ ] **Step 8: Update `tests/renderer/setup.ts`** — add sandbox mock

Add `sandbox` to the `mockXaideApi` object and update the `XaideAPI` import:
```typescript
import type { Workspace, WorktreeRecord, XaideAPI, SandboxAPI } from '../../src/preload/ipc-types'
```

Add to `mockXaideApi`:
```typescript
sandbox: {
  isAvailable: vi.fn().mockResolvedValue(false),
  create: vi.fn().mockResolvedValue({ containerId: 'cnt-mock', image: 'node:22', worktreePath: '/tmp/wt' }),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
} satisfies SandboxAPI,
```

- [ ] **Step 9: Run all tests to verify nothing is broken**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test
npm run test:renderer
```
Expected: 84 main tests (79 + 5 new IPC), 41 renderer tests

- [ ] **Step 10: Commit**

```bash
git add src/main/ipc/sandbox.ipc.ts src/main/ipc/index.ts \
        src/preload/ipc-types.ts src/preload/index.ts \
        src/main/index.ts tests/main/sandbox.ipc.test.ts \
        tests/renderer/setup.ts
git commit -m "feat: sandbox IPC channels, types, and preload binding

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: AgentSessionManager Sandbox Integration

**Files:**
- Modify: `src/main/agent/types.ts`
- Modify: `src/main/agent/AgentSessionManager.ts`
- Modify: `src/main/ipc/agent.ipc.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/src/store/uiStore.ts`
- Modify: `src/renderer/src/components/MainArea.tsx`
- Modify: `tests/main/agent-session-manager.test.ts`

- [ ] **Step 1: Update `src/main/agent/types.ts`**

Add `sandboxImage?` to `CreateAgentSessionInput`:
```typescript
export interface CreateAgentSessionInput {
  agentId: string
  worktreeId: string
  worktreePath: string
  branch: string
  repoPath?: string
  taskId?: string
  cols?: number
  rows?: number
  sandboxImage?: string   // ← add this line
}
```

- [ ] **Step 2: Update `AgentSessionManager.ts`** — full replacement:

```typescript
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DrizzleDb } from '../db/schema'
import { agentSessions } from '../db/schema'
import type { PtyManager } from '../pty/PtyManager'
import type { HookRunner } from '../worktree/HookRunner'
import type { SandboxManager } from '../sandbox/SandboxManager'
import type { AgentSessionRecord, CreateAgentSessionInput } from './types'

const AGENT_COMMANDS: Record<string, { command: string; args: string[] }> = {
  claude: { command: 'claude', args: [] },
  copilot: { command: 'gh', args: ['copilot'] },
}

export class AgentSessionManager {
  constructor(
    private db: DrizzleDb,
    private pty: PtyManager,
    private hookRunner: HookRunner,
    private sandbox?: SandboxManager,
  ) {}

  async create(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const id = randomUUID()
    const agentCmd = AGENT_COMMANDS[input.agentId] ?? { command: input.agentId, args: [] }

    let command = agentCmd.command
    let args = agentCmd.args
    let containerId: string | null = null

    if (input.sandboxImage && this.sandbox) {
      const info = this.sandbox.create({
        image: input.sandboxImage,
        worktreePath: input.worktreePath,
        branch: input.branch,
      })
      this.sandbox.start(info.containerId)
      containerId = info.containerId
      const exec = this.sandbox.execArgs(info.containerId)
      command = exec.command
      args = [...exec.prefixArgs, agentCmd.command, ...agentCmd.args]
    }

    const ptyResult = this.pty.create({
      workspaceId: input.repoPath ?? input.worktreeId ?? '',
      cols: input.cols ?? 80,
      rows: input.rows ?? 24,
      cwd: input.worktreePath,
      command,
      args,
    })

    let record: AgentSessionRecord
    try {
      const [inserted] = await this.db
        .insert(agentSessions)
        .values({
          id,
          taskId: input.taskId ?? null,
          agentId: input.agentId,
          branch: input.branch,
          worktreePath: input.worktreePath,
          ptySessionId: ptyResult.id,
          containerId,
          status: 'running',
        })
        .returning()
      record = inserted as AgentSessionRecord
    } catch (err) {
      try { this.pty.kill(ptyResult.id) } catch { /* already dead */ }
      if (containerId && this.sandbox) {
        try { this.sandbox.stop(containerId) } catch { /* already stopped */ }
      }
      throw err
    }

    this.hookRunner
      .run('agent.started', {
        repoPath: input.repoPath ?? input.worktreePath,
        branch: input.branch,
        worktreePath: input.worktreePath,
      })
      .catch(() => {})

    return record as AgentSessionRecord
  }

  async list(): Promise<AgentSessionRecord[]> {
    const rows = await this.db.select().from(agentSessions)
    return rows as AgentSessionRecord[]
  }

  async kill(sessionId: string, ptySessionId: string, containerId?: string | null): Promise<void> {
    try {
      this.pty.kill(ptySessionId)
    } catch {
      // PTY may already be dead
    }
    if (containerId && this.sandbox) {
      this.sandbox.stop(containerId)
    }
    await this.db
      .update(agentSessions)
      .set({ status: 'finished', updatedAt: new Date().toISOString() })
      .where(eq(agentSessions.id, sessionId))
  }
}
```

- [ ] **Step 3: Update `src/main/ipc/agent.ipc.ts`** — pass containerId through kill handler

Find the SESSION_KILL handler and update it to pass the optional containerId:
```typescript
ipcMain.handle(
  AGENT_CHANNELS.SESSION_KILL,
  async (_, sessionId: string, ptySessionId: string, containerId?: string | null) =>
    sessionManager.kill(sessionId, ptySessionId, containerId),
)
```

- [ ] **Step 4: Update `src/main/index.ts`** — pass SandboxManager to AgentSessionManager

Change:
```typescript
const agentSessionManager = new AgentSessionManager(db, ptyManager, hookRunner)
```
To:
```typescript
const agentSessionManager = new AgentSessionManager(db, ptyManager, hookRunner, sandboxManager)
```

(The `sandboxManager` was instantiated in Task 2's changes.)

- [ ] **Step 5: Update `src/renderer/src/store/uiStore.ts`** — add containerId to AgentSessionUiRecord

```typescript
export interface AgentSessionUiRecord {
  id: string
  ptySessionId: string
  agentId: string
  agentName: string
  branch: string
  worktreeId: string
  workspaceId: string
  containerId?: string | null   // ← add this line
}
```

- [ ] **Step 6: Update `src/renderer/src/components/MainArea.tsx`**

Update `handleLaunchAgent` to accept `sandboxImage?` and store `containerId` in the UI record:
```typescript
const handleLaunchAgent = async (agentId: string, worktreeId: string, sandboxImage?: string) => {
  const wt = worktrees.find((w) => w.id === worktreeId)
  if (!wt || !activeWorkspaceId) return
  try {
    const record = await launchAgent.mutateAsync({
      agentId,
      worktreeId,
      worktreePath: wt.worktreePath,
      branch: wt.branch,
      sandboxImage,
    })
    setShowLauncher(false)
    const uiRecord: AgentSessionUiRecord = {
      id: record.id,
      ptySessionId: record.ptySessionId ?? record.id,
      agentId: record.agentId,
      agentName: agentNames[agentId] ?? agentId,
      branch: record.branch,
      worktreeId,
      workspaceId: activeWorkspaceId,
      containerId: record.containerId,
    }
    addAgentSession(uiRecord)
    addSession({
      id: record.ptySessionId ?? record.id,
      workspaceId: activeWorkspaceId,
      title: `${agentNames[agentId] ?? agentId} (${wt.branch})`,
      cwd: wt.worktreePath,
    })
  } catch (err) {
    console.error('[AgentLauncher] failed to launch agent:', err)
  }
}
```

Update `handleKillAgentSession` to pass containerId:
```typescript
const handleKillAgentSession = useCallback(
  async (id: string) => {
    const session = agentSessions.find((s) => s.id === id)
    if (!session) return
    await window.xaide.agent.killSession(id, session.ptySessionId ?? '', session.containerId ?? null)
    removeAgentSession(id)
    await closeSession(id)
  },
  [agentSessions, removeAgentSession, closeSession],
)
```

- [ ] **Step 7: Update `tests/main/agent-session-manager.test.ts`** — add sandbox tests

Update `makeMockDb` to support the `select().from()` chain returning records (needed when containerId is passed):

The existing mock `select: vi.fn().mockReturnValue({ from: vi.fn().mockResolvedValue([]) })` still works for `kill()` because we removed the DB select from kill. No changes needed to the mock.

Update the constructor calls to pass `undefined` for the optional sandbox parameter (no change needed — TypeScript optional params don't require updates to existing call sites).

Add two new tests at the end of the `describe` block:

```typescript
it('create with sandboxImage creates and starts a container', async () => {
  const returning = [{ id: 'sess-2', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/x', ptySessionId: 'pty-abc', taskId: null, containerId: 'cnt-1', status: 'running', createdAt: '', updatedAt: '' }]
  db.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }) })

  const mockSandbox = {
    create: vi.fn().mockReturnValue({ containerId: 'cnt-1', image: 'node:22', worktreePath: '/tmp/x' }),
    start: vi.fn(),
    stop: vi.fn(),
    execArgs: vi.fn().mockReturnValue({ command: 'docker', prefixArgs: ['exec', '-i', 'cnt-1'] }),
    isDockerAvailable: vi.fn().mockReturnValue(true),
    remove: vi.fn(),
  }
  const sandboxManager = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager, hookRunner as unknown as HookRunner, mockSandbox as any)

  await sandboxManager.create({ agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/x', branch: 'feat/x', sandboxImage: 'node:22' })

  expect(mockSandbox.create).toHaveBeenCalledWith({ image: 'node:22', worktreePath: '/tmp/x', branch: 'feat/x' })
  expect(mockSandbox.start).toHaveBeenCalledWith('cnt-1')
})

it('create with sandboxImage wraps agent command in docker exec', async () => {
  const returning = [{ id: 'sess-2', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/x', ptySessionId: 'pty-abc', taskId: null, containerId: 'cnt-1', status: 'running', createdAt: '', updatedAt: '' }]
  db.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }) })

  const mockSandbox = {
    create: vi.fn().mockReturnValue({ containerId: 'cnt-1', image: 'node:22', worktreePath: '/tmp/x' }),
    start: vi.fn(),
    stop: vi.fn(),
    execArgs: vi.fn().mockReturnValue({ command: 'docker', prefixArgs: ['exec', '-i', 'cnt-1'] }),
    isDockerAvailable: vi.fn().mockReturnValue(true),
    remove: vi.fn(),
  }
  const sandboxManager = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager, hookRunner as unknown as HookRunner, mockSandbox as any)

  await sandboxManager.create({ agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/x', branch: 'feat/x', sandboxImage: 'node:22' })

  const ptyCall = (pty.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
  expect(ptyCall.command).toBe('docker')
  expect(ptyCall.args).toEqual(['exec', '-i', 'cnt-1', 'claude'])
})

it('kill with containerId calls sandbox.stop()', async () => {
  db.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })
  const mockSandbox = {
    stop: vi.fn(),
    create: vi.fn(),
    start: vi.fn(),
    remove: vi.fn(),
    execArgs: vi.fn(),
    isDockerAvailable: vi.fn(),
  }
  const sandboxManager = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager, hookRunner as unknown as HookRunner, mockSandbox as any)
  await sandboxManager.kill('sess-1', 'pty-abc', 'cnt-1')
  expect(mockSandbox.stop).toHaveBeenCalledWith('cnt-1')
})
```

- [ ] **Step 8: Run all tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test
npm run test:renderer
```
Expected: 87 main tests (84 + 3 new), 41 renderer tests

- [ ] **Step 9: Commit**

```bash
git add src/main/agent/AgentSessionManager.ts src/main/agent/types.ts \
        src/main/ipc/agent.ipc.ts src/main/index.ts \
        src/renderer/src/store/uiStore.ts \
        src/renderer/src/components/MainArea.tsx \
        tests/main/agent-session-manager.test.ts
git commit -m "feat: AgentSessionManager sandbox integration with docker exec PTY

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Sandbox UI — AgentLauncher Toggle + useDockerStatus

**Files:**
- Create: `src/renderer/src/hooks/useDockerStatus.ts`
- Modify: `src/renderer/src/components/AgentLauncher.tsx`
- Modify: `tests/renderer/AgentLauncher.test.tsx`

- [ ] **Step 1: Write the failing renderer tests**

Add 3 new tests to the bottom of the existing `describe('AgentLauncher', ...)` block in `tests/renderer/AgentLauncher.test.tsx`:

```typescript
it('shows sandbox toggle section', async () => {
  render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
  await waitFor(() => screen.getByText('Claude Code'))
  expect(screen.getByRole('checkbox', { name: /use docker sandbox/i })).toBeInTheDocument()
})

it('shows image input when sandbox toggle is enabled', async () => {
  render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
  await waitFor(() => screen.getByText('Claude Code'))
  const toggle = screen.getByRole('checkbox', { name: /use docker sandbox/i })
  await userEvent.click(toggle)
  expect(screen.getByPlaceholderText(/docker image/i)).toBeInTheDocument()
})

it('calls onLaunch with sandboxImage when sandbox is enabled', async () => {
  vi.mocked(window.xaide.sandbox.isAvailable).mockResolvedValue(true)
  render(<AgentLauncher worktrees={mockWorktrees} onLaunch={onLaunch} onClose={onClose} />, { wrapper })
  await waitFor(() => screen.getByText('Claude Code'))
  fireEvent.click(screen.getByText('Claude Code'))
  const toggle = screen.getByRole('checkbox', { name: /use docker sandbox/i })
  await userEvent.click(toggle)
  const imageInput = screen.getByPlaceholderText(/docker image/i)
  await userEvent.clear(imageInput)
  await userEvent.type(imageInput, 'node:22')
  fireEvent.click(screen.getByRole('button', { name: /launch/i }))
  await waitFor(() => expect(onLaunch).toHaveBeenCalledWith('claude', 'wt-1', 'node:22'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:renderer -- --reporter=verbose tests/renderer/AgentLauncher.test.tsx
```
Expected: 3 new tests FAIL

- [ ] **Step 3: Create `src/renderer/src/hooks/useDockerStatus.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'

export function useDockerStatus() {
  return useQuery({
    queryKey: ['sandbox', 'available'],
    queryFn: () => window.xaide.sandbox.isAvailable(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}
```

- [ ] **Step 4: Replace `src/renderer/src/components/AgentLauncher.tsx`**

```typescript
import { useState } from 'react'
import type { FC } from 'react'
import { useDetectedAgents } from '../hooks/useAgents'
import { useDockerStatus } from '../hooks/useDockerStatus'
import type { WorktreeRecord } from '../../../preload/ipc-types'

const DEFAULT_SANDBOX_IMAGE = 'node:22-bookworm-slim'

interface Props {
  worktrees: WorktreeRecord[]
  onLaunch: (agentId: string, worktreeId: string, sandboxImage?: string) => void
  onClose: () => void
}

export const AgentLauncher: FC<Props> = ({ worktrees, onLaunch, onClose }) => {
  const { data: agents = [] } = useDetectedAgents()
  const { data: dockerAvailable = false } = useDockerStatus()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedWorktree, setSelectedWorktree] = useState<string | null>(
    worktrees[0]?.id ?? null,
  )
  const [sandboxEnabled, setSandboxEnabled] = useState(false)
  const [sandboxImage, setSandboxImage] = useState(DEFAULT_SANDBOX_IMAGE)

  const canLaunch = selectedAgent !== null && selectedWorktree !== null

  const handleLaunch = () => {
    if (!canLaunch) return
    onLaunch(selectedAgent!, selectedWorktree!, sandboxEnabled ? sandboxImage : undefined)
  }

  return (
    <div className="absolute top-8 left-0 z-50 w-72 bg-neutral-800 border border-neutral-700 rounded shadow-lg p-3 flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">Agent</p>
        <div className="flex flex-col gap-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => agent.installed && setSelectedAgent(agent.id)}
              disabled={!agent.installed}
              className={[
                'flex items-center justify-between px-2 py-1 rounded text-sm',
                selectedAgent === agent.id
                  ? 'bg-blue-600 text-white'
                  : agent.installed
                    ? 'text-neutral-200 hover:bg-neutral-700'
                    : 'text-neutral-500 cursor-not-allowed',
              ].join(' ')}
            >
              <span>{agent.name}</span>
              {!agent.installed && (
                <span className="text-xs text-neutral-500 ml-2">not installed</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {worktrees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">Worktree</p>
          <div className="flex flex-col gap-1">
            {worktrees.map((wt) => (
              <button
                key={wt.id}
                type="button"
                onClick={() => setSelectedWorktree(wt.id)}
                className={[
                  'px-2 py-1 rounded text-sm text-left',
                  selectedWorktree === wt.id
                    ? 'bg-blue-600 text-white'
                    : 'text-neutral-200 hover:bg-neutral-700',
                ].join(' ')}
              >
                {wt.branch}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-neutral-400 mb-1 uppercase tracking-wider">
          Sandbox
          {!dockerAvailable && (
            <span className="ml-1 text-neutral-600 normal-case font-normal">(Docker not found)</span>
          )}
        </p>
        <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label="Use Docker sandbox"
            checked={sandboxEnabled}
            onChange={(e) => setSandboxEnabled(e.target.checked)}
            disabled={!dockerAvailable}
            className="accent-blue-500"
          />
          Use Docker sandbox
        </label>
        {sandboxEnabled && (
          <input
            type="text"
            placeholder="Docker image (e.g. node:22)"
            value={sandboxImage}
            onChange={(e) => setSandboxImage(e.target.value)}
            className="mt-1 w-full bg-neutral-700 text-neutral-200 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-neutral-600"
          />
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1 text-xs rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canLaunch}
          onClick={handleLaunch}
          className="px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Launch
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run all renderer tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm run test:renderer
```
Expected: 44 tests (41 + 3 new)

- [ ] **Step 6: Run main tests to confirm nothing broke**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH"
npm test
```
Expected: 87 tests pass

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/hooks/useDockerStatus.ts \
        src/renderer/src/components/AgentLauncher.tsx \
        tests/renderer/AgentLauncher.test.tsx
git commit -m "feat: AgentLauncher sandbox toggle with Docker status and image config

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review

**Spec coverage:**
- ✅ Docker container lifecycle (create, start, stop, remove) — T1
- ✅ IPC exposure of sandbox operations — T2
- ✅ Agent sessions optionally run inside Docker container via docker exec — T3
- ✅ Worktree path mounted at `/workspace` inside container — T3 (SandboxManager.create)
- ✅ Branch parameter passed as label on container — T3
- ✅ Container cleanup on session kill — T3
- ✅ UI toggle for sandbox mode — T4
- ✅ Docker status indicator (Docker not found) — T4
- ✅ Configurable Docker image with default `node:22-bookworm-slim` — T4

**Placeholder scan:** No placeholders found. All steps have complete code.

**Type consistency:**
- `SandboxCreateOptions` defined in T1 (`SandboxManager.ts`) and re-exported from T2 (`ipc-types.ts`) — both have same fields: `image`, `worktreePath`, `branch`
- `SandboxInfo` consistent between T1 and T2
- `CreateAgentSessionInput.sandboxImage?` added in both `types.ts` (T3) and `ipc-types.ts` (T2)
- `AgentAPI.killSession` signature `(sessionId, ptySessionId, containerId?)` consistent between T2 (preload) and T3 (agent.ipc.ts + manager)
- `AgentSessionUiRecord.containerId?` added in T3, read in T4 via MainArea
- `onLaunch: (agentId, worktreeId, sandboxImage?) => void` consistent between AgentLauncher (T4) and MainArea (T3)
