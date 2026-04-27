# Docker Sandboxes (sbx) Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-Docker `SandboxManager` with Docker Sandboxes (`sbx` CLI), which runs AI coding agents in isolated microVMs and natively supports our agent types (claude, copilot).

**Architecture:** The `sbx` CLI handles everything the old `docker create/exec` approach did, but at a higher level — `sbx create` provisions a microVM with a workspace mount, and `sbx run <agent>` becomes the PTY command directly (no `docker exec` prefix needed). The `SandboxManager` interface shrinks: `start()` and `execArgs()` are removed; a new `runArgs()` returns the PTY command. The `containerId` DB column is repurposed to store the sandbox name (no schema migration needed since values were always null in production).

**Tech Stack:** `sbx` CLI (installed via `brew install docker/tap/sbx`), `execFileSync` from `node:child_process`, TypeScript, React, Vitest, Testing Library.

---

## File Map

**Modified:**
- `src/main/sandbox/SandboxManager.ts` — rewritten for sbx
- `src/preload/ipc-types.ts` — `SandboxCreateOptions`, `SandboxInfo`, `SandboxAPI`, remove `START` channel, `sandboxImage→sandboxName` in `CreateAgentSessionInput`, `containerId→sandboxName` in `killSession`
- `src/main/ipc/sandbox.ipc.ts` — remove `start` handler, update types
- `src/preload/index.ts` — remove `start` binding, update sandbox API
- `src/main/agent/types.ts` — `sandboxImage→sandboxName` in `CreateAgentSessionInput`
- `src/main/agent/AgentSessionManager.ts` — use `runArgs()` PTY, no `start()`, store sandboxName
- `src/main/ipc/agent.ipc.ts` — `containerId→sandboxName` param
- `src/renderer/src/store/uiStore.ts` — `containerId→sandboxName` in `AgentSessionUiRecord`
- `src/renderer/src/components/MainArea.tsx` — `sandboxImage→sandboxName`, auto-generate name
- `src/renderer/src/hooks/useDockerStatus.ts` — rename to `useSbxStatus.ts`
- `src/renderer/src/components/AgentLauncher.tsx` — remove image input, update prop, import new hook
- `tests/main/sandbox-manager.test.ts` — rewritten for sbx
- `tests/main/sandbox.ipc.test.ts` — remove start, update types
- `tests/main/agent-session-manager.test.ts` — update sandbox tests
- `tests/renderer/AgentLauncher.test.tsx` — remove image tests, update sandbox toggle tests
- `tests/renderer/setup.ts` — remove `sandbox.start` mock

**Created:**
- `src/renderer/src/hooks/useSbxStatus.ts` — replaces `useDockerStatus.ts`

---

## Task 1: Rewrite SandboxManager for sbx

**Files:**
- Modify: `src/main/sandbox/SandboxManager.ts`
- Modify: `tests/main/sandbox-manager.test.ts`

---

- [ ] **Step 1: Rewrite the test file (TDD — all tests must fail first)**

Replace the entire contents of `tests/main/sandbox-manager.test.ts`:

```typescript
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

  it('isSbxAvailable returns true when sbx --version succeeds', () => {
    mockExec.mockReturnValue('sbx 1.0.0\n' as any)
    expect(manager.isSbxAvailable()).toBe(true)
    expect(mockExec).toHaveBeenCalledWith('sbx', ['--version'], { stdio: 'pipe' })
  })

  it('isSbxAvailable returns false when sbx is not installed', () => {
    mockExec.mockImplementation(() => { throw new Error('command not found: sbx') })
    expect(manager.isSbxAvailable()).toBe(false)
  })

  it('create calls sbx create with name and workspace and returns SandboxInfo', () => {
    mockExec.mockReturnValue('' as any)
    const info = manager.create({ name: 'xaide-abc', worktreePath: '/tmp/wt' })
    expect(info.sandboxName).toBe('xaide-abc')
    expect(info.worktreePath).toBe('/tmp/wt')
    expect(mockExec).toHaveBeenCalledWith(
      'sbx',
      ['create', '--name', 'xaide-abc', '--workspace', '/tmp/wt'],
      { stdio: 'pipe' },
    )
  })

  it('create throws when sbx create fails', () => {
    mockExec.mockImplementation(() => { throw new Error('sbx: not logged in') })
    expect(() => manager.create({ name: 'xaide-abc', worktreePath: '/tmp/wt' }))
      .toThrow('sbx: not logged in')
  })

  it('stop calls sbx stop with the sandbox name', () => {
    mockExec.mockReturnValue('' as any)
    manager.stop('xaide-abc')
    expect(mockExec).toHaveBeenCalledWith('sbx', ['stop', 'xaide-abc'], { stdio: 'pipe' })
  })

  it('stop does not throw when sbx stop fails (sandbox already stopped)', () => {
    mockExec.mockImplementation(() => { throw new Error('no such sandbox') })
    expect(() => manager.stop('xaide-abc')).not.toThrow()
  })

  it('remove calls sbx rm with the sandbox name', () => {
    mockExec.mockReturnValue('' as any)
    manager.remove('xaide-abc')
    expect(mockExec).toHaveBeenCalledWith('sbx', ['rm', 'xaide-abc'], { stdio: 'pipe' })
  })

  it('remove does not throw when sbx rm fails', () => {
    mockExec.mockImplementation(() => { throw new Error('no such sandbox') })
    expect(() => manager.remove('xaide-abc')).not.toThrow()
  })

  it('runArgs returns sbx run command for claude agent', () => {
    const result = manager.runArgs('xaide-abc', 'claude')
    expect(result.command).toBe('sbx')
    expect(result.args).toEqual(['run', 'claude', '--name', 'xaide-abc'])
  })

  it('runArgs returns sbx run command for copilot agent', () => {
    const result = manager.runArgs('xaide-abc', 'copilot')
    expect(result.command).toBe('sbx')
    expect(result.args).toEqual(['run', 'copilot', '--name', 'xaide-abc'])
  })
})
```

- [ ] **Step 2: Run tests to confirm FAIL**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm test -- --reporter=verbose tests/main/sandbox-manager.test.ts
```

Expected: multiple failures (old API doesn't match)

- [ ] **Step 3: Rewrite `src/main/sandbox/SandboxManager.ts`**

Replace the entire file:

```typescript
import { execFileSync } from 'node:child_process'

export interface SandboxCreateOptions {
  name: string
  worktreePath: string
}

export interface SandboxInfo {
  sandboxName: string
  worktreePath: string
}

// Maps Xaide agent IDs to sbx agent names
const SBX_AGENT_MAP: Record<string, string> = {
  claude: 'claude',
  copilot: 'copilot',
}

export class SandboxManager {
  isSbxAvailable(): boolean {
    try {
      execFileSync('sbx', ['--version'], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  create(options: SandboxCreateOptions): SandboxInfo {
    execFileSync(
      'sbx',
      ['create', '--name', options.name, '--workspace', options.worktreePath],
      { stdio: 'pipe' },
    )
    return { sandboxName: options.name, worktreePath: options.worktreePath }
  }

  stop(sandboxName: string): void {
    try {
      execFileSync('sbx', ['stop', sandboxName], { stdio: 'pipe' })
    } catch {
      // Sandbox may already be stopped or removed
    }
  }

  remove(sandboxName: string): void {
    try {
      execFileSync('sbx', ['rm', sandboxName], { stdio: 'pipe' })
    } catch {
      // Sandbox may already be removed
    }
  }

  runArgs(sandboxName: string, agentId: string): { command: string; args: string[] } {
    const sbxAgent = SBX_AGENT_MAP[agentId] ?? agentId
    return {
      command: 'sbx',
      args: ['run', sbxAgent, '--name', sandboxName],
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm PASS**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm test -- --reporter=verbose tests/main/sandbox-manager.test.ts
```

Expected: 10/10 pass

- [ ] **Step 5: Commit**

```bash
git add src/main/sandbox/SandboxManager.ts tests/main/sandbox-manager.test.ts
git commit -m "refactor: replace docker-based SandboxManager with sbx CLI

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Update IPC Types, Preload, and Sandbox IPC Handler

**Files:**
- Modify: `src/preload/ipc-types.ts`
- Modify: `src/main/ipc/sandbox.ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/main/sandbox.ipc.test.ts`
- Modify: `tests/renderer/setup.ts`

---

- [ ] **Step 1: Update `src/preload/ipc-types.ts`**

Make these changes (read the file first to find exact locations):

**Replace `SANDBOX_CHANNELS`** — remove `START`:
```typescript
export const SANDBOX_CHANNELS = {
  AVAILABLE: 'sandbox:available',
  CREATE: 'sandbox:create',
  STOP: 'sandbox:stop',
  REMOVE: 'sandbox:remove',
} as const
```

**Replace `SandboxCreateOptions`** — `name` + `worktreePath`, no `image`/`branch`:
```typescript
export interface SandboxCreateOptions {
  name: string
  worktreePath: string
}
```

**Replace `SandboxInfo`** — `sandboxName` replaces `containerId`/`image`:
```typescript
export interface SandboxInfo {
  sandboxName: string
  worktreePath: string
}
```

**Replace `SandboxAPI`** — remove `start`, update params:
```typescript
export interface SandboxAPI {
  available: () => Promise<boolean>
  create: (options: SandboxCreateOptions) => Promise<SandboxInfo>
  stop: (sandboxName: string) => Promise<void>
  remove: (sandboxName: string) => Promise<void>
}
```

**Update `CreateAgentSessionInput`** — `sandboxImage` → `sandboxName`:
```typescript
export interface CreateAgentSessionInput {
  agentId: string
  worktreeId: string
  worktreePath: string
  branch: string
  taskId?: string
  cols?: number
  rows?: number
  sandboxName?: string   // was sandboxImage
}
```

**Update `AgentAPI.killSession`** — `containerId?` → `sandboxName?`:
```typescript
export interface AgentAPI {
  listDetected: () => Promise<DetectedAgent[]>
  createSession: (input: CreateAgentSessionInput) => Promise<AgentSessionRecord>
  listSessions: () => Promise<AgentSessionRecord[]>
  killSession: (sessionId: string, ptySessionId: string, sandboxName?: string) => Promise<void>
}
```

**Update `AgentSessionRecord`** — keep `containerId` field name (DB column name stays, stores sandbox name):
```typescript
// containerId field is unchanged — it stores the sbx sandbox name at runtime
// DB column rename is deferred to a future migration
```
(No change to `AgentSessionRecord` — `containerId` field remains as-is)

- [ ] **Step 2: Update `src/main/ipc/sandbox.ipc.ts`**

Replace the entire file:

```typescript
import { ipcMain } from 'electron'
import { SANDBOX_CHANNELS } from '../../preload/ipc-types'
import type { SandboxManager } from '../sandbox/SandboxManager'
import type { SandboxCreateOptions } from '../../preload/ipc-types'

export function registerSandboxHandlers(sandbox: SandboxManager): void {
  ipcMain.handle(SANDBOX_CHANNELS.AVAILABLE, () => sandbox.isSbxAvailable())

  ipcMain.handle(SANDBOX_CHANNELS.CREATE, (_event, options: SandboxCreateOptions) =>
    sandbox.create(options),
  )

  ipcMain.handle(SANDBOX_CHANNELS.STOP, (_event, sandboxName: string) =>
    sandbox.stop(sandboxName),
  )

  ipcMain.handle(SANDBOX_CHANNELS.REMOVE, (_event, sandboxName: string) =>
    sandbox.remove(sandboxName),
  )
}
```

- [ ] **Step 3: Update `src/preload/index.ts`**

Find the `sandbox` binding. Replace it (remove `start`, update to `sandboxName` params):

```typescript
sandbox: {
  available: () => ipcRenderer.invoke(SANDBOX_CHANNELS.AVAILABLE),
  create: (options: SandboxCreateOptions) => ipcRenderer.invoke(SANDBOX_CHANNELS.CREATE, options),
  stop: (sandboxName: string) => ipcRenderer.invoke(SANDBOX_CHANNELS.STOP, sandboxName),
  remove: (sandboxName: string) => ipcRenderer.invoke(SANDBOX_CHANNELS.REMOVE, sandboxName),
} satisfies SandboxAPI,
```

- [ ] **Step 4: Rewrite `tests/main/sandbox.ipc.test.ts`**

Replace the entire file:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import { SANDBOX_CHANNELS } from '../../src/preload/ipc-types'
import { registerSandboxHandlers } from '../../src/main/ipc/sandbox.ipc'
import type { SandboxManager } from '../../src/main/sandbox/SandboxManager'

const mockHandle = vi.mocked(ipcMain.handle)

const mockSandbox: SandboxManager = {
  isSbxAvailable: vi.fn(),
  create: vi.fn(),
  stop: vi.fn(),
  remove: vi.fn(),
  runArgs: vi.fn(),
} as unknown as SandboxManager

describe('sandbox IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerSandboxHandlers(mockSandbox)
  })

  it('registers all 4 sandbox channels', () => {
    const channels = mockHandle.mock.calls.map((c) => c[0])
    expect(channels).toContain(SANDBOX_CHANNELS.AVAILABLE)
    expect(channels).toContain(SANDBOX_CHANNELS.CREATE)
    expect(channels).toContain(SANDBOX_CHANNELS.STOP)
    expect(channels).toContain(SANDBOX_CHANNELS.REMOVE)
  })

  it('available handler delegates to sandbox.isSbxAvailable', async () => {
    vi.mocked(mockSandbox.isSbxAvailable).mockReturnValue(true)
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.AVAILABLE)![1]
    const result = await handler({} as any, undefined as any)
    expect(result).toBe(true)
    expect(mockSandbox.isSbxAvailable).toHaveBeenCalled()
  })

  it('create handler delegates to sandbox.create and returns SandboxInfo', async () => {
    const options = { name: 'xaide-abc', worktreePath: '/tmp/wt' }
    const info = { sandboxName: 'xaide-abc', worktreePath: '/tmp/wt' }
    vi.mocked(mockSandbox.create).mockReturnValue(info)
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.CREATE)![1]
    const result = await handler({} as any, options)
    expect(result).toEqual(info)
    expect(mockSandbox.create).toHaveBeenCalledWith(options)
  })

  it('stop handler delegates to sandbox.stop', async () => {
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.STOP)![1]
    const result = await handler({} as any, 'xaide-abc')
    expect(mockSandbox.stop).toHaveBeenCalledWith('xaide-abc')
    expect(result).toBeUndefined()
  })

  it('remove handler delegates to sandbox.remove', async () => {
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.REMOVE)![1]
    const result = await handler({} as any, 'xaide-abc')
    expect(mockSandbox.remove).toHaveBeenCalledWith('xaide-abc')
    expect(result).toBeUndefined()
  })
})
```

- [ ] **Step 5: Update `tests/renderer/setup.ts`**

Find the `sandbox` mock on `window.xaide`. Replace it:

```typescript
sandbox: {
  available: vi.fn().mockResolvedValue(true),
  create: vi.fn().mockResolvedValue({ sandboxName: 'xaide-abc', worktreePath: '/tmp/wt' }),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
},
```

- [ ] **Step 6: Run all tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm test
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm run test:renderer
```

Expected: all pass (TypeScript may show compile errors in files not yet updated — fix any that appear in the test files themselves)

- [ ] **Step 7: Commit**

```bash
git add \
  src/preload/ipc-types.ts \
  src/main/ipc/sandbox.ipc.ts \
  src/preload/index.ts \
  tests/main/sandbox.ipc.test.ts \
  tests/renderer/setup.ts
git commit -m "refactor: update sandbox IPC types and handlers for sbx CLI

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Update AgentSessionManager, agent IPC, uiStore, and MainArea

**Files:**
- Modify: `src/main/agent/types.ts`
- Modify: `src/main/agent/AgentSessionManager.ts`
- Modify: `src/main/ipc/agent.ipc.ts`
- Modify: `src/renderer/src/store/uiStore.ts`
- Modify: `src/renderer/src/components/MainArea.tsx`
- Modify: `tests/main/agent-session-manager.test.ts`

---

- [ ] **Step 1: Update `src/main/agent/types.ts`**

Find `CreateAgentSessionInput`. Change `sandboxImage` → `sandboxName`:

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
  sandboxName?: string   // was sandboxImage — sbx sandbox name (auto-generated by caller)
}
```

- [ ] **Step 2: Update `src/main/agent/AgentSessionManager.ts`**

Replace the sandbox integration section. The full updated `create()` method sandbox block:

```typescript
async create(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
  const id = randomUUID()

  let sandboxName: string | undefined
  if (input.sandboxName && this.sandbox) {
    this.sandbox.create({
      name: input.sandboxName,
      worktreePath: input.worktreePath,
    })
    sandboxName = input.sandboxName
  }

  let ptyCommand: string
  let ptyArgs: string[]
  if (sandboxName && this.sandbox) {
    const { command, args } = this.sandbox.runArgs(sandboxName, input.agentId)
    ptyCommand = command
    ptyArgs = args
  } else {
    const agentCmd = AGENT_COMMANDS[input.agentId] ?? { command: input.agentId, args: [] }
    ptyCommand = agentCmd.command
    ptyArgs = agentCmd.args
  }

  const ptyResult = this.pty.create({
    workspaceId: input.repoPath ?? input.worktreeId ?? '',
    cols: input.cols ?? 80,
    rows: input.rows ?? 24,
    cwd: input.worktreePath,
    command: ptyCommand,
    args: ptyArgs,
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
        containerId: sandboxName ?? null,   // DB column repurposed: stores sbx sandbox name
        status: 'running',
      })
      .returning()
    record = inserted as AgentSessionRecord
  } catch (err) {
    try { this.pty.kill(ptyResult.id) } catch { /* already dead */ }
    if (sandboxName && this.sandbox) {
      this.sandbox.remove(sandboxName)
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
```

Also update `kill()` — rename `containerId` param to `sandboxName`:

```typescript
async kill(sessionId: string, ptySessionId: string, sandboxName?: string): Promise<void> {
  try {
    this.pty.kill(ptySessionId)
  } catch {
    // PTY may already be dead
  }
  if (sandboxName && this.sandbox) {
    this.sandbox.stop(sandboxName)
  }
  await this.db
    .update(agentSessions)
    .set({ status: 'finished', updatedAt: new Date().toISOString() })
    .where(eq(agentSessions.id, sessionId))
}
```

Note: Remove the `AGENT_COMMANDS` lookup from the sandbox path — when using sbx, `runArgs()` handles agent command mapping internally.

- [ ] **Step 3: Update `src/main/ipc/agent.ipc.ts`**

Find the `agent:session:kill` handler. Rename `containerId` → `sandboxName`:

```typescript
ipcMain.handle('agent:session:kill', (_event, sessionId: string, ptySessionId: string, sandboxName?: string) =>
  sessionManager.kill(sessionId, ptySessionId, sandboxName),
)
```

- [ ] **Step 4: Update `src/renderer/src/store/uiStore.ts`**

Find `AgentSessionUiRecord`. Rename `containerId` → `sandboxName`:

```typescript
export interface AgentSessionUiRecord {
  id: string
  ptySessionId: string
  agentId: string
  agentName: string
  branch: string
  worktreeId: string
  workspaceId: string
  sandboxName?: string | null   // was containerId
}
```

- [ ] **Step 5: Update `src/renderer/src/components/MainArea.tsx`**

Read the file to find all occurrences of `sandboxImage`, `containerId`, and the `handleLaunchAgent`/`handleKillAgentSession` functions.

Update `handleLaunchAgent` signature: `sandboxImage?` → `sandboxName?`

Update the `handleLaunchAgent` body — generate sandbox name from worktree if needed:
```typescript
const handleLaunchAgent = async (agentId: string, worktreeId: string, sandboxName?: string) => {
  // ... existing logic ...
  const session = await window.xaide.agent.createSession({
    // ... existing fields ...
    sandboxName,  // was sandboxImage
  })
  addAgentSession({
    // ... existing fields ...
    sandboxName: session.containerId ?? undefined,  // DB column stores sbx name
  })
}
```

Update `handleKillAgentSession` — rename `containerId` → `sandboxName` from session record:
```typescript
const handleKillAgentSession = async (sessionId: string) => {
  const session = agentSessions.find((s) => s.id === sessionId)
  if (!session) return
  await window.xaide.agent.killSession(
    sessionId,
    session.ptySessionId,
    session.sandboxName ?? undefined,  // was containerId
  )
  // ... rest of existing logic ...
}
```

- [ ] **Step 6: Update sandbox tests in `tests/main/agent-session-manager.test.ts`**

Find the 3 sandbox tests added in T3 of sub-plan #6. Update them to use `sandboxName` instead of `sandboxImage`/`containerId`, and use `sandbox.runArgs()` instead of `sandbox.execArgs()`:

```typescript
describe('sandbox integration', () => {
  const makeSandboxMock = () => ({
    isSbxAvailable: vi.fn().mockReturnValue(true),
    create: vi.fn().mockReturnValue({ sandboxName: 'xaide-abc', worktreePath: '/tmp/wt' }),
    stop: vi.fn(),
    remove: vi.fn(),
    runArgs: vi.fn().mockReturnValue({ command: 'sbx', args: ['run', 'claude', '--name', 'xaide-abc'] }),
  })

  it('create uses sbx runArgs PTY when sandboxName provided', async () => {
    // Use existing db/pty/hookRunner mocks from the test file
    const sandboxMock = makeSandboxMock()
    // Instantiate AgentSessionManager with sandboxMock as 4th arg
    // Call create() with sandboxName: 'xaide-abc'
    // Assert sandbox.create was called with { name: 'xaide-abc', worktreePath: ... }
    // Assert sandbox.runArgs was called with ('xaide-abc', 'claude')
    // Assert pty.create was called with command: 'sbx', args: ['run', 'claude', '--name', 'xaide-abc']
    // Assert DB insert had containerId: 'xaide-abc'
  })

  it('kill calls sandbox.stop when sandboxName provided', async () => {
    const sandboxMock = makeSandboxMock()
    // Instantiate AgentSessionManager with sandboxMock
    // Call kill(sessionId, ptySessionId, 'xaide-abc')
    // Assert sandbox.stop was called with 'xaide-abc'
  })

  it('kill does not call sandbox.stop when sandboxName is not provided', async () => {
    const sandboxMock = makeSandboxMock()
    // Call kill(sessionId, ptySessionId) — no sandboxName
    // Assert sandbox.stop was NOT called
  })
})
```

**Write the full test implementations** following the existing patterns in the file (look at how `db`, `pty`, and `hookRunner` are mocked in the existing tests). Do not leave pseudo-code.

- [ ] **Step 7: Run tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm test
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm run test:renderer
```

Expected: all tests pass. Fix any TypeScript errors from renamed fields before committing.

- [ ] **Step 8: Commit**

```bash
git add \
  src/main/agent/types.ts \
  src/main/agent/AgentSessionManager.ts \
  src/main/ipc/agent.ipc.ts \
  src/renderer/src/store/uiStore.ts \
  src/renderer/src/components/MainArea.tsx \
  tests/main/agent-session-manager.test.ts
git commit -m "refactor: update AgentSessionManager and MainArea for sbx sandbox names

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Update AgentLauncher and useSbxStatus Hook

**Files:**
- Create: `src/renderer/src/hooks/useSbxStatus.ts`
- Modify: `src/renderer/src/hooks/useDockerStatus.ts` (delete this file)
- Modify: `src/renderer/src/components/AgentLauncher.tsx`
- Modify: `tests/renderer/AgentLauncher.test.tsx`

---

- [ ] **Step 1: Create `src/renderer/src/hooks/useSbxStatus.ts`**

```typescript
import { useState, useEffect } from 'react'

export function useSbxStatus(): { available: boolean; loading: boolean } {
  const [available, setAvailable] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.xaide.sandbox
      .available()
      .then((result) => setAvailable(result))
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false))
  }, [])

  return { available, loading }
}
```

- [ ] **Step 2: Delete the old hook file**

```bash
rm src/renderer/src/hooks/useDockerStatus.ts
```

- [ ] **Step 3: Update `AgentLauncher.tsx` — update tests FIRST (TDD)**

In `tests/renderer/AgentLauncher.test.tsx`, find and update the 3 sandbox tests:

**Test: Docker unavailable → update to sbx wording:**
```typescript
it('shows sbx unavailable indicator when sbx is not installed', async () => {
  vi.mocked(window.xaide.sandbox.available).mockResolvedValue(false)
  render(<AgentLauncher worktrees={mockWorktrees} onLaunch={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByText(/sbx unavailable/i)).toBeInTheDocument()
})
```

**Test: sandbox toggle — unchanged behavior, just verify it still works:**
```typescript
it('shows sandbox toggle when sbx is available', async () => {
  vi.mocked(window.xaide.sandbox.available).mockResolvedValue(true)
  render(<AgentLauncher worktrees={mockWorktrees} onLaunch={vi.fn()} onClose={vi.fn()} />)
  expect(await screen.findByRole('checkbox', { name: /use sandbox/i })).toBeInTheDocument()
})
```

**Test: onLaunch receives sandboxName (auto-generated, not user-typed image):**
```typescript
it('passes auto-generated sandboxName to onLaunch when sandbox is enabled', async () => {
  vi.mocked(window.xaide.sandbox.available).mockResolvedValue(true)
  const onLaunch = vi.fn()
  render(
    <AgentLauncher
      worktrees={mockWorktrees}
      onLaunch={onLaunch}
      onClose={vi.fn()}
    />,
  )

  // Select an agent (find the first installed agent button)
  const agentBtn = await screen.findByRole('button', { name: /claude/i })
  await userEvent.click(agentBtn)

  // Enable sandbox
  const toggle = await screen.findByRole('checkbox', { name: /use sandbox/i })
  await userEvent.click(toggle)

  // Click Launch
  const launchBtn = screen.getByRole('button', { name: /launch/i })
  await userEvent.click(launchBtn)

  expect(onLaunch).toHaveBeenCalledWith(
    expect.any(String),  // agentId
    expect.any(String),  // worktreeId
    expect.stringMatching(/^xaide-/),  // auto-generated sandbox name
  )
})
```

Run tests to confirm the 3 sandbox tests FAIL:
```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm run test:renderer -- --reporter=verbose tests/renderer/AgentLauncher.test.tsx
```

- [ ] **Step 4: Update `AgentLauncher.tsx`**

Make these changes:

1. Replace `import { useDockerStatus }` with `import { useSbxStatus }` from `'../hooks/useSbxStatus'`
2. Replace `const { available: dockerAvailable, loading: dockerLoading } = useDockerStatus()` with `const { available: sbxAvailable, loading: sbxLoading } = useSbxStatus()`
3. Remove the `sandboxImage` state
4. Update the `onLaunch` prop type: `onLaunch: (agentId: string, worktreeId: string, sandboxName?: string) => void`
5. In the launch handler, generate a sandbox name when `useSandbox` is enabled:
   ```typescript
   const sandboxName = useSandbox
     ? `xaide-${selectedWorktree!.slice(0, 8)}-${Date.now().toString(36)}`
     : undefined
   onLaunch(selectedAgent!, selectedWorktree!, sandboxName)
   ```
6. Replace the sandbox UI section — no image input, just the toggle:
   ```tsx
   {!sbxLoading && (
     <div className="border-t border-neutral-700 pt-2">
       {!sbxAvailable ? (
         <p className="text-xs text-red-400">sbx unavailable</p>
       ) : (
         <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
           <input
             type="checkbox"
             checked={useSandbox}
             onChange={(e) => setUseSandbox(e.target.checked)}
             aria-label="Use sandbox"
           />
           Use sandbox
         </label>
       )}
     </div>
   )}
   ```
7. Remove `disabled={(useSandbox && !sandboxImage.trim())}` from the Launch button (no image required anymore)

- [ ] **Step 5: Run renderer tests**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm run test:renderer
```

Expected: all 44 tests pass (including the updated 3 sandbox tests)

- [ ] **Step 6: Run full test suite**

```bash
export PATH="/Users/jeff.williams/.vfox/cache/nodejs/v-22.22.2/nodejs-22.22.2/bin:$PATH" && npm test
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add \
  src/renderer/src/hooks/useSbxStatus.ts \
  src/renderer/src/components/AgentLauncher.tsx \
  tests/renderer/AgentLauncher.test.tsx
git rm src/renderer/src/hooks/useDockerStatus.ts
git commit -m "refactor: update AgentLauncher to use sbx, auto-generate sandbox names

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review

### Spec Coverage
- [x] `SandboxManager` uses `sbx` CLI (T1)
- [x] `isSbxAvailable()` replaces `isDockerAvailable()` (T1)
- [x] `create()` uses `sbx create --name --workspace` (T1)
- [x] `runArgs()` returns `sbx run <agent> --name <sandboxName>` (T1)
- [x] `start()` and `execArgs()` removed (T1)
- [x] IPC types updated: `SandboxCreateOptions`, `SandboxInfo`, `SandboxAPI` (T2)
- [x] `SANDBOX_CHANNELS.START` removed (T2)
- [x] `CreateAgentSessionInput.sandboxName` replaces `sandboxImage` (T2, T3)
- [x] `AgentAPI.killSession` uses `sandboxName?` (T2, T3)
- [x] `AgentSessionManager` uses `runArgs()` for PTY, no separate `start()` (T3)
- [x] DB stores sandbox name in `containerId` column (T3, noted as repurposing)
- [x] `uiStore.AgentSessionUiRecord.sandboxName` replaces `containerId` (T3)
- [x] `MainArea` passes `sandboxName` to create/kill (T3)
- [x] `useSbxStatus` replaces `useDockerStatus` (T4)
- [x] `AgentLauncher` removes image input, auto-generates sandbox name (T4)
- [x] All tests updated (T1-T4)

### Known Limitations (future work)
- `sbx` requires `sbx login` (Docker OAuth) — unauthenticated users will get an error from `sbx create`; a future plan should surface auth errors in the UI
- `sbx` agent name mapping (`SBX_AGENT_MAP`) may need updating as sbx adds more agents
- DB column `containerId` stores sandbox names — rename in a future schema migration
- `sbx --branch` mode (native worktree creation) is not used; we use our own worktrees mounted via `--workspace`
